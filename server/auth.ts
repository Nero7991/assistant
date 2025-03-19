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

async function verifyContactAndUpdateUser(userId: number, type: string, code: string) {
  const verification = await storage.getLatestContactVerification(userId);
  console.log("Found verification:", verification);

  if (!verification) {
    throw new Error("No verification pending");
  }

  if (verification.code !== code) {
    throw new Error("Invalid verification code");
  }

  if (new Date() > verification.expiresAt) {
    throw new Error("Verification code expired");
  }

  await storage.markContactVerified(userId, type);
  const user = await storage.getUser(userId);
  const verifications = await storage.getVerifications(userId);
  const isEmailVerified = verifications.some(v => (v.type === 'email' && v.verified));
  const isPhoneVerified = verifications.some(v => ((v.type === 'phone' || v.type === 'whatsapp') && v.verified));

  console.log("Verification status check:", {
    userId,
    type,
    isEmailVerified,
    isPhoneVerified,
    verifications
  });

  if (user) {
    user.isEmailVerified = isEmailVerified;
    user.isPhoneVerified = isPhoneVerified;
    await storage.updateUser(user);
  }

  return user;
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    },
    name: 'connect.sid'
  };

  app.set('trust proxy', 1);
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

      let isEmailVerified = false;
      let isPhoneVerified = false;

      if (req.session.tempUserId) {
        console.log("Checking verifications from temp user:", req.session.tempUserId);
        const verifications = await storage.getVerifications(req.session.tempUserId);

        for (const verification of verifications) {
          if (verification.verified) {
            console.log("Found verified contact:", verification);
            if (verification.type === 'email') {
              isEmailVerified = true;
            } else if (verification.type === 'phone' || verification.type === 'whatsapp') {
              isPhoneVerified = true;
            }
          }
        }
      }

      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
        isEmailVerified,
        isPhoneVerified
      });

      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regenerate error:", err);
          return next(err);
        }

        req.login(user, (err) => {
          if (err) {
            console.error("Login error after registration:", err);
            return next(err);
          }

          delete req.session.tempUserId;
          res.status(201).json(user);
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      next(error);
    }
  });

  app.post("/api/verify-contact", async (req, res) => {
    try {
      const { code, type } = req.body;
      const userId = req.isAuthenticated() ? req.user.id : req.session.tempUserId;

      if (!userId) {
        console.log("No user ID found (neither authenticated nor temporary)");
        return res.status(401).json({ message: "No valid user session" });
      }

      console.log("Processing verification:", {
        isAuthenticated: req.isAuthenticated(),
        userId,
        type,
        code
      });

      await verifyContactAndUpdateUser(userId, type, code);

      if (req.isAuthenticated()) {
        const updatedUser = await storage.getUser(userId);
        if (!updatedUser) {
          throw new Error("Failed to retrieve updated user");
        }

        req.login(updatedUser, (err) => {
          if (err) {
            console.error("Error updating user session:", err);
            return res.status(500).json({ message: "Failed to update session" });
          }
          res.json({ message: "Verification successful", user: updatedUser });
        });
      } else {
        res.json({ message: "Verification successful" });
      }
    } catch (error) {
      console.error("Verification error:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Verification failed" });
    }
  });

  app.post("/api/initiate-verification", async (req, res) => {
    try {
      const { email, phone, type } = req.body;
      const contact = type === 'email' ? email : phone;

      if (!contact) {
        throw new Error(`${type === 'email' ? 'Email' : 'Phone number'} is required`);
      }

      const verificationCode = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Use existing tempUserId from session or create new one
      const tempUserId = req.session.tempUserId || (Math.floor(Math.random() * 100000) + 1);

      // Store or update tempUserId in session
      req.session.tempUserId = tempUserId;

      console.log("Using temporary user ID for verification:", {
        tempUserId,
        type,
        isNewId: !req.session.tempUserId
      });

      await storage.createContactVerification({
        userId: tempUserId,
        type,
        code: verificationCode,
        expiresAt,
      });

      console.log(`Initiating ${type} verification for:`, contact);

      const messageSent = await sendVerificationMessage(
        type,
        contact,
        verificationCode
      );

      if (!messageSent) {
        throw new Error(`Failed to send ${type} verification code`);
      }

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

  app.post("/api/logout", (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('connect.sid');
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
}