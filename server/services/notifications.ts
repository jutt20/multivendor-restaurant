import twilio from 'twilio';
import { storage } from '../storage';

export class NotificationService {
  private twilioClient: twilio.Twilio | null = null;

  async initialize() {
    const config = await storage.getConfig('twilio_enabled');
    
    if (config?.isEnabled) {
      const configValue = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
      const accountSid = process.env.TWILIO_ACCOUNT_SID || configValue?.accountSid;
      const authToken = process.env.TWILIO_AUTH_TOKEN || configValue?.authToken;
      
      if (accountSid && authToken) {
        this.twilioClient = twilio(accountSid, authToken);
      }
    }
  }

  async isEnabled(): Promise<boolean> {
    const config = await storage.getConfig('twilio_enabled');
    return config?.isEnabled || false;
  }

  async sendSMS(to: string, message: string): Promise<boolean> {
    try {
      if (!this.twilioClient) {
        await this.initialize();
      }

      if (!this.twilioClient) {
        console.log('Twilio not configured, SMS not sent');
        return false;
      }

      const config = await storage.getConfig('twilio_enabled');
      const configValue = typeof config?.value === 'string' ? JSON.parse(config.value) : config?.value;
      const phoneNumber = process.env.TWILIO_PHONE_NUMBER || configValue?.phoneNumber;

      if (!phoneNumber) {
        console.error('Twilio phone number not configured');
        return false;
      }

      await this.twilioClient.messages.create({
        body: message,
        from: phoneNumber,
        to: to,
      });

      console.log(`SMS sent to ${to}: ${message}`);
      return true;
    } catch (error) {
      console.error('Error sending SMS:', error);
      return false;
    }
  }

  async sendOrderNotification(customerPhone: string, orderStatus: string, restaurantName: string) {
    const messages: { [key: string]: string } = {
      accepted: `Your order at ${restaurantName} has been accepted!`,
      preparing: `Your order at ${restaurantName} is being prepared.`,
      ready: `Your order at ${restaurantName} is ready!`,
      delivered: `Your order at ${restaurantName} has been delivered. Enjoy your meal!`,
    };

    const message = messages[orderStatus];
    if (message && customerPhone) {
      await this.sendSMS(customerPhone, message);
    }
  }

  async sendVendorApprovalNotification(phone: string, status: string, restaurantName: string) {
    const messages: { [key: string]: string } = {
      approved: `Congratulations! Your restaurant "${restaurantName}" has been approved on QuickBiteQR. You can now start taking orders.`,
      rejected: `We regret to inform you that your restaurant "${restaurantName}" application has been rejected. Please contact support for more details.`,
    };

    const message = messages[status];
    if (message && phone) {
      await this.sendSMS(phone, message);
    }
  }
}

export const notificationService = new NotificationService();
