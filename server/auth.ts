import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { sendVerificationMessage, generateVerificationCode } from "./messaging";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: true,
    saveUninitialized: true,
    store: storage.sessionStore,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    },
    name: 'connect.sid'
  };

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    console.log("Serializing user:", user.id);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      console.log("Deserializing user:", id);
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Add the username check endpoint
  app.get("/api/check-username/:username", async (req, res) => {
    try {
      const existingUser = await storage.getUserByUsername(req.params.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      res.status(200).json({ message: "Username available" });
    } catch (error) {
      console.error("Username check error:", error);
      res.status(500).json({ message: "Failed to check username availability" });
    }
  });

  // Update the registration endpoint to handle the staged registration.  Keeping original verification logic.
  app.post("/api/register", async (req, res, next) => {
    try {
      console.log("Registration request received:", {
        ...req.body,
        password: '[REDACTED]'
      });

      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
      });

      console.log("User created:", {
        id: user.id,
        username: user.username,
        contactPreference: user.contactPreference
      });

      // Generate and store verification code
      const verificationCode = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await storage.createContactVerification({
        userId: user.id,
        type: 'email',
        code: verificationCode,
        expiresAt,
      });

      // Send verification email
      const emailSent = await sendVerificationMessage(
        'email',
        user.email,
        verificationCode
      );

      console.log("Verification email sending result:", {
        success: emailSent,
        email: user.email
      });

      // Generate new session
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regenerate error:", err);
          return next(err);
        }

        // Log in the user immediately after registration
        req.login(user, (err) => {
          if (err) {
            console.error("Login error after registration:", err);
            return next(err);
          }
          console.log("User logged in after registration:", {
            id: user.id,
            isAuthenticated: req.isAuthenticated(),
            session: req.sessionID
          });
          // Save the session before sending response
          req.session.save((err) => {
            if (err) {
              console.error("Session save error:", err);
              return next(err);
            }
            res.status(201).json(user);
          });
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      next(error);
    }
  });

  // Update the verification endpoint to handle both temp and authenticated users
  app.post("/api/verify-contact", async (req, res) => {
    try {
      console.log("Verification attempt:", {
        isAuthenticated: req.isAuthenticated(),
        user: req.user?.id,
        sessionID: req.sessionID,
        body: req.body,
        cookies: req.headers.cookie,
        tempUserId: req.session.tempUserId
      });

      const { code, type } = req.body;
      const userId = req.isAuthenticated() ? req.user.id : req.session.tempUserId;

      if (!userId) {
        console.log("No user ID found (neither authenticated nor temporary)");
        return res.status(401).json({ message: "No valid user session" });
      }

      const verification = await storage.getLatestContactVerification(userId);

      console.log("Found verification:", verification);

      if (!verification) {
        return res.status(400).json({ message: "No verification pending" });
      }

      if (verification.code !== code) {
        return res.status(400).json({ message: "Invalid verification code" });
      }

      if (new Date() > verification.expiresAt) {
        return res.status(400).json({ message: "Verification code expired" });
      }

      // If user is authenticated, mark the contact as verified
      if (req.isAuthenticated()) {
        await storage.markContactVerified(req.user.id, type);

        // After email verification, if user chose WhatsApp, send WhatsApp verification
        if (type === 'email' && req.user.contactPreference === 'whatsapp' && !req.user.isPhoneVerified && req.user.phoneNumber) {
          console.log("Email verified, initiating WhatsApp verification for user:", req.user.id);

          const whatsAppVerificationCode = generateVerificationCode();
          const whatsAppExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

          await storage.createContactVerification({
            userId: req.user.id,
            type: 'phone',
            code: whatsAppVerificationCode,
            expiresAt: whatsAppExpiresAt,
          });

          const whatsAppMessageSent = await sendVerificationMessage(
            'whatsapp',
            req.user.phoneNumber,
            whatsAppVerificationCode
          );

          console.log("WhatsApp verification message result:", {
            userId: req.user.id,
            phoneNumber: req.user.phoneNumber,
            success: whatsAppMessageSent
          });
        }

        // Get updated user and refresh session
        const updatedUser = await storage.getUser(req.user.id);
        if (!updatedUser) {
          return res.status(404).json({ message: "User not found" });
        }

        // Regenerate session and update user
        req.session.regenerate((err) => {
          if (err) {
            console.error("Session regenerate error:", err);
            return res.status(500).json({ message: "Failed to update session" });
          }
          req.login(updatedUser, (err) => {
            if (err) {
              console.error("Session refresh error:", err);
              return res.status(500).json({ message: "Failed to update session" });
            }
            req.session.save((err) => {
              if (err) {
                console.error("Session save error:", err);
                return res.status(500).json({ message: "Failed to save session" });
              }
              console.log("Verification successful:", {
                userId: updatedUser.id,
                type,
                isAuthenticated: req.isAuthenticated(),
                session: req.sessionID
              });
              res.json({ message: "Contact verified successfully" });
            });
          });
        });
      } else {
        // For temporary users, just confirm the verification was successful
        res.json({ message: "Verification successful" });
      }
    } catch (error) {
      console.error("Verification error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  // Update the resend verification endpoint to properly handle WhatsApp messages
  app.post("/api/resend-verification", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const verificationCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await storage.createContactVerification({
      userId: req.user.id,
      type: req.body.type || 'email',
      code: verificationCode,
      expiresAt,
    });

    // Send verification message based on type
    const messageType = req.body.type === 'phone' ?
      (req.user.contactPreference === 'whatsapp' ? 'whatsapp' : 'imessage') :
      'email';

    const contact = req.body.type === 'phone' ? req.user.phoneNumber : req.user.email;

    console.log("Sending verification message:", {
      type: messageType,
      contact,
      code: verificationCode
    });

    const messageSent = await sendVerificationMessage(
      messageType,
      contact,
      verificationCode
    );

    console.log("Verification message result:", {
      type: messageType,
      contact,
      success: messageSent
    });

    if (!messageSent) {
      console.error("Failed to send verification message");
      return res.status(500).json({ message: "Failed to send verification code" });
    }

    res.json({ message: "Verification code resent" });
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: "Invalid credentials" });

      req.login(user, (err) => {
        if (err) return next(err);
        console.log("User logged in:", {
          id: user.id,
          isAuthenticated: req.isAuthenticated(),
          session: req.sessionID
        });
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    console.log("Get user request:", {
      isAuthenticated: req.isAuthenticated(),
      sessionID: req.sessionID,
      user: req.user?.id,
      cookies: req.headers.cookie
    });
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });

  // Add debug endpoint
  app.get("/api/debug-session", (req, res) => {
    console.log("Debug session:", {
      sessionID: req.sessionID,
      isAuthenticated: req.isAuthenticated(),
      user: req.user?.id,
      cookies: req.headers.cookie,
      session: req.session
    });
    res.json({
      sessionID: req.sessionID,
      isAuthenticated: req.isAuthenticated(),
      userId: req.user?.id
    });
  });

  // Add new endpoint for initiating verification
  app.post("/api/initiate-verification", async (req, res) => {
    try {
      const { email, type } = req.body;

      // Generate verification code
      const verificationCode = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Create temporary session to store verification data
      const tempUserId = Date.now(); // Use timestamp as temporary ID
      await storage.createContactVerification({
        userId: tempUserId,
        type,
        code: verificationCode,
        expiresAt,
      });

      // Send verification code
      const messageSent = await sendVerificationMessage(
        type,
        email,
        verificationCode
      );

      if (!messageSent) {
        throw new Error("Failed to send verification code");
      }

      // Store temp user ID in session for later use
      req.session.tempUserId = tempUserId;

      res.json({
        message: "Verification code sent",
        tempUserId
      });
    } catch (error) {
      console.error("Verification initiation error:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to send verification code"
      });
    }
  });
}