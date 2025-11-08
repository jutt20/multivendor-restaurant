import admin from 'firebase-admin';
import { storage } from '../storage';

export class FirebaseService {
  private app: admin.app.App | null = null;

  async initialize() {
    const config = await storage.getConfig('firebase_enabled');
    
    if (config?.isEnabled && !this.app) {
      try {
        const configValue = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
        const projectId = process.env.FIREBASE_PROJECT_ID || configValue?.projectId;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || configValue?.privateKey;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || configValue?.clientEmail;

        if (projectId && privateKey && clientEmail) {
          this.app = admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              privateKey,
              clientEmail,
            }),
          });
          console.log('Firebase initialized successfully');
        }
      } catch (error) {
        console.error('Error initializing Firebase:', error);
      }
    }
  }

  async isEnabled(): Promise<boolean> {
    const config = await storage.getConfig('firebase_enabled');
    return config?.isEnabled || false;
  }

  async sendPushNotification(token: string, title: string, body: string, data?: any): Promise<boolean> {
    try {
      if (!this.app) {
        await this.initialize();
      }

      if (!this.app) {
        console.log('Firebase not configured, push notification not sent');
        return false;
      }

      const message: admin.messaging.Message = {
        notification: {
          title,
          body,
        },
        data: data || {},
        token,
      };

      await admin.messaging().send(message);
      console.log(`Push notification sent to ${token}`);
      return true;
    } catch (error) {
      console.error('Error sending push notification:', error);
      return false;
    }
  }

  async sendOrderUpdateNotification(fcmToken: string, orderStatus: string, restaurantName: string) {
    const titles: { [key: string]: string } = {
      accepted: 'Order Accepted',
      preparing: 'Order Being Prepared',
      ready: 'Order Ready',
      delivered: 'Order Delivered',
    };

    const title = titles[orderStatus] || 'Order Update';
    const body = `Your order at ${restaurantName} status: ${orderStatus}`;
    
    if (fcmToken) {
      await this.sendPushNotification(fcmToken, title, body, { status: orderStatus });
    }
  }
}

export const firebaseService = new FirebaseService();
