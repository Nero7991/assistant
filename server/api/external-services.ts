import { Express, Request, Response } from 'express';
import { db } from '../db';
import { 
  externalServices, 
  externalServiceMessages, 
  messageHistory,
  users,
  insertExternalServiceSchema,
  updateExternalServiceSchema
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { randomBytes, createHash } from 'crypto';
import { z } from 'zod';
import { messagingService } from '../services/messaging';
import { MailService } from '@sendgrid/mail';
import twilio from 'twilio';

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Initialize SendGrid
const mailService = new MailService();
if (process.env.SENDGRID_API_KEY) {
  mailService.setApiKey(process.env.SENDGRID_API_KEY);
}

// Helper function to send email
async function sendEmail(to: string, subject: string, text: string, html: string): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('[DEV] Would send email:', { to, subject, text });
    return;
  }

  await mailService.send({
    to,
    from: process.env.FROM_EMAIL || 'kona@orencollaco.com',
    subject,
    text,
    html
  });
}

// Helper function to generate URL-safe slug
function generateSlug(serviceName: string, userId: number): string {
  const baseSlug = serviceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${baseSlug}-${userId}-${randomBytes(4).toString('hex')}`;
}

// Helper function to hash access tokens
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Rate limiting helper
const rateLimitCache = new Map<number, { count: number; resetTime: Date }>();

function checkRateLimit(serviceId: number, limit: number): boolean {
  const now = new Date();
  const cached = rateLimitCache.get(serviceId);
  
  if (!cached || cached.resetTime < now) {
    // Reset rate limit
    rateLimitCache.set(serviceId, {
      count: 1,
      resetTime: new Date(now.getTime() + 60 * 60 * 1000) // 1 hour from now
    });
    return true;
  }
  
  if (cached.count >= limit) {
    return false;
  }
  
  cached.count++;
  return true;
}

// Reset rate limit for testing purposes
function resetRateLimit(serviceId: number): void {
  rateLimitCache.delete(serviceId);
}

// Webhook payload schema
const webhookPayloadSchema = z.object({
  message: z.string().min(1, "Message is required"),
  deliveryMethod: z.enum(['text', 'whatsapp', 'email', 'all']).optional().default('all')
});

export function registerExternalServicesAPI(app: Express) {
  // Create a new external service
  app.post('/api/external-services', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const validationResult = insertExternalServiceSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: 'Invalid service data', 
          details: validationResult.error.flatten() 
        });
      }

      const { serviceName, rateLimit, metadata } = validationResult.data;
      const userId = req.user!.id;

      // Check if service name already exists for this user
      const existingService = await db
        .select()
        .from(externalServices)
        .where(and(
          eq(externalServices.userId, userId),
          eq(externalServices.serviceName, serviceName)
        ))
        .limit(1);

      if (existingService.length > 0) {
        return res.status(409).json({ 
          error: 'Service with this name already exists' 
        });
      }

      // Generate unique slug and access token
      const serviceSlug = generateSlug(serviceName, userId);
      const accessToken = randomBytes(32).toString('hex');
      const accessTokenHash = hashToken(accessToken);

      // Create the service
      const [newService] = await db
        .insert(externalServices)
        .values({
          userId,
          serviceName,
          serviceSlug,
          accessTokenHash,
          rateLimit: rateLimit || 100,
          metadata,
          updatedAt: new Date()
        })
        .returning();

      // Return service info with the unhashed access token (only shown once)
      res.status(201).json({
        id: newService.id,
        serviceName: newService.serviceName,
        serviceSlug: newService.serviceSlug,
        webhookUrl: `${process.env.APP_URL || 'http://localhost:5000'}/api/webhooks/external/${newService.serviceSlug}`,
        accessToken, // Only returned on creation
        rateLimit: newService.rateLimit,
        isActive: newService.isActive,
        createdAt: newService.createdAt
      });
    } catch (error) {
      console.error('Error creating external service:', error);
      res.status(500).json({ error: 'Failed to create service' });
    }
  });

  // List user's external services
  app.get('/api/external-services', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const services = await db
        .select({
          id: externalServices.id,
          serviceName: externalServices.serviceName,
          serviceSlug: externalServices.serviceSlug,
          webhookUrl: externalServices.serviceSlug,
          rateLimit: externalServices.rateLimit,
          isActive: externalServices.isActive,
          lastUsedAt: externalServices.lastUsedAt,
          createdAt: externalServices.createdAt,
          updatedAt: externalServices.updatedAt
        })
        .from(externalServices)
        .where(eq(externalServices.userId, req.user!.id))
        .orderBy(desc(externalServices.createdAt));

      // Format webhook URLs
      const formattedServices = services.map(service => ({
        ...service,
        webhookUrl: `${process.env.APP_URL || 'http://localhost:5000'}/api/webhooks/external/${service.serviceSlug}`
      }));

      res.json(formattedServices);
    } catch (error) {
      console.error('Error fetching external services:', error);
      res.status(500).json({ error: 'Failed to fetch services' });
    }
  });

  // Update an external service
  app.put('/api/external-services/:id', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const serviceId = parseInt(req.params.id);
      const validationResult = updateExternalServiceSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: 'Invalid update data', 
          details: validationResult.error.flatten() 
        });
      }

      // Check if service belongs to user
      const [service] = await db
        .select()
        .from(externalServices)
        .where(and(
          eq(externalServices.id, serviceId),
          eq(externalServices.userId, req.user!.id)
        ))
        .limit(1);

      if (!service) {
        return res.status(404).json({ error: 'Service not found' });
      }

      // Update the service
      const [updatedService] = await db
        .update(externalServices)
        .set({
          ...validationResult.data,
          updatedAt: new Date()
        })
        .where(eq(externalServices.id, serviceId))
        .returning();

      // Reset rate limit cache when rate limit is updated
      if (validationResult.data.rateLimit !== undefined) {
        resetRateLimit(serviceId);
      }

      res.json({
        id: updatedService.id,
        serviceName: updatedService.serviceName,
        serviceSlug: updatedService.serviceSlug,
        webhookUrl: `${process.env.APP_URL || 'http://localhost:5000'}/api/webhooks/external/${updatedService.serviceSlug}`,
        rateLimit: updatedService.rateLimit,
        isActive: updatedService.isActive,
        updatedAt: updatedService.updatedAt
      });
    } catch (error) {
      console.error('Error updating external service:', error);
      res.status(500).json({ error: 'Failed to update service' });
    }
  });

  // Delete an external service
  app.delete('/api/external-services/:id', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const serviceId = parseInt(req.params.id);

      // Check if service belongs to user
      const [service] = await db
        .select()
        .from(externalServices)
        .where(and(
          eq(externalServices.id, serviceId),
          eq(externalServices.userId, req.user!.id)
        ))
        .limit(1);

      if (!service) {
        return res.status(404).json({ error: 'Service not found' });
      }

      // Delete the service (messages will be cascade deleted)
      await db
        .delete(externalServices)
        .where(eq(externalServices.id, serviceId));

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting external service:', error);
      res.status(500).json({ error: 'Failed to delete service' });
    }
  });

  // Regenerate access token
  app.post('/api/external-services/:id/regenerate-token', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const serviceId = parseInt(req.params.id);

      // Check if service belongs to user
      const [service] = await db
        .select()
        .from(externalServices)
        .where(and(
          eq(externalServices.id, serviceId),
          eq(externalServices.userId, req.user!.id)
        ))
        .limit(1);

      if (!service) {
        return res.status(404).json({ error: 'Service not found' });
      }

      // Generate new token
      const newAccessToken = randomBytes(32).toString('hex');
      const newAccessTokenHash = hashToken(newAccessToken);

      // Update the service
      await db
        .update(externalServices)
        .set({
          accessTokenHash: newAccessTokenHash,
          updatedAt: new Date()
        })
        .where(eq(externalServices.id, serviceId));

      // Reset rate limit cache when token is regenerated (for testing purposes)
      resetRateLimit(serviceId);

      res.json({
        accessToken: newAccessToken,
        message: 'Access token regenerated successfully'
      });
    } catch (error) {
      console.error('Error regenerating token:', error);
      res.status(500).json({ error: 'Failed to regenerate token' });
    }
  });

  // Webhook endpoint for external services
  app.post('/api/webhooks/external/:serviceSlug', async (req: Request, res: Response) => {
    try {
      const { serviceSlug } = req.params;
      const authHeader = req.headers.authorization;

      // Validate authorization header
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const token = authHeader.substring(7);
      const tokenHash = hashToken(token);

      // Find service by slug and validate token
      const [service] = await db
        .select()
        .from(externalServices)
        .where(and(
          eq(externalServices.serviceSlug, serviceSlug),
          eq(externalServices.accessTokenHash, tokenHash)
        ))
        .limit(1);

      if (!service) {
        return res.status(401).json({ error: 'Invalid service or token' });
      }

      if (!service.isActive) {
        return res.status(403).json({ error: 'Service is disabled' });
      }

      // Check rate limit
      if (!checkRateLimit(service.id, service.rateLimit)) {
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }

      // Validate payload
      const validationResult = webhookPayloadSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: 'Invalid payload', 
          details: validationResult.error.flatten() 
        });
      }

      const { message, deliveryMethod } = validationResult.data;

      // Get user details
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, service.userId))
        .limit(1);

      if (!user || !user.isActive) {
        return res.status(404).json({ error: 'User not found or inactive' });
      }

      // Format message with service attribution
      const formattedMessage = `Message from ${service.serviceName}: "${message}"`;

      // Create message record
      const [messageRecord] = await db
        .insert(externalServiceMessages)
        .values({
          serviceId: service.id,
          userId: user.id,
          messageContent: message,
          deliveryMethod,
          deliveryStatus: 'pending'
        })
        .returning();

      // Update last used timestamp
      await db
        .update(externalServices)
        .set({ lastUsedAt: new Date() })
        .where(eq(externalServices.id, service.id));

      // Send message based on delivery method
      let deliveryStatus = 'sent';
      let errorMessage: string | null = null;

      try {
        switch (deliveryMethod) {
          case 'text':
            if (user.phoneNumber && user.isPhoneVerified && user.allowPhoneNotifications) {
              await sendSMS(user.phoneNumber, formattedMessage);
            } else {
              throw new Error('SMS not available for user');
            }
            break;

          case 'whatsapp':
            if (user.phoneNumber && user.isPhoneVerified && user.allowPhoneNotifications && user.contactPreference === 'whatsapp') {
              await sendWhatsApp(user.phoneNumber, formattedMessage);
            } else {
              throw new Error('WhatsApp not available for user');
            }
            break;

          case 'email':
            if (user.email && user.isEmailVerified && user.allowEmailNotifications) {
              await sendEmail(
                user.email,
                `Message from ${service.serviceName}`,
                formattedMessage,
                `<p>${formattedMessage}</p>`
              );
            } else {
              throw new Error('Email not available for user');
            }
            break;

          case 'all':
          default:
            // Try all available methods
            const errors: string[] = [];
            
            // Try SMS/WhatsApp
            if (user.phoneNumber && user.isPhoneVerified && user.allowPhoneNotifications) {
              try {
                if (user.contactPreference === 'whatsapp') {
                  await sendWhatsApp(user.phoneNumber, formattedMessage);
                } else {
                  await sendSMS(user.phoneNumber, formattedMessage);
                }
              } catch (e) {
                errors.push(`Phone: ${e instanceof Error ? e.message : 'Unknown error'}`);
              }
            }

            // Try Email
            if (user.email && user.isEmailVerified && user.allowEmailNotifications) {
              try {
                await sendEmail(
                  user.email,
                  `Message from ${service.serviceName}`,
                  formattedMessage,
                  `<p>${formattedMessage}</p>`
                );
              } catch (e) {
                errors.push(`Email: ${e instanceof Error ? e.message : 'Unknown error'}`);
              }
            }

            if (errors.length > 0) {
              errorMessage = errors.join('; ');
            }
            break;
        }

        // Store in message history
        await db.insert(messageHistory).values({
          userId: user.id,
          content: formattedMessage,
          type: 'external_service',
          status: 'sent',
          metadata: {
            serviceId: service.id,
            serviceName: service.serviceName,
            originalMessage: message
          }
        });
      } catch (error) {
        deliveryStatus = 'failed';
        errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error sending external service message:', error);
      }

      // Update message record with delivery status
      await db
        .update(externalServiceMessages)
        .set({
          deliveryStatus,
          errorMessage,
          sentAt: deliveryStatus === 'sent' ? new Date() : null
        })
        .where(eq(externalServiceMessages.id, messageRecord.id));

      res.json({
        success: deliveryStatus === 'sent',
        messageId: messageRecord.id,
        deliveryStatus,
        error: errorMessage
      });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

// Helper functions for sending messages
async function sendSMS(phoneNumber: string, message: string): Promise<void> {
  const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
  
  await twilioClient.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: formattedNumber
  });
}

async function sendWhatsApp(phoneNumber: string, message: string): Promise<void> {
  const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
  
  await twilioClient.messages.create({
    body: message,
    from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
    to: `whatsapp:${formattedNumber}`
  });
}