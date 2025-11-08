import { Client, GeocodeResult } from '@googlemaps/google-maps-services-js';
import { storage } from '../storage';

export class MapsService {
  private client: Client | null = null;
  private apiKey: string | null = null;

  async initialize() {
    const config = await storage.getConfig('maps_enabled');
    
    if (config?.isEnabled) {
      const configValue = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
      this.apiKey = process.env.GOOGLE_MAPS_API_KEY || configValue?.apiKey;
      if (this.apiKey) {
        this.client = new Client({});
        console.log('Google Maps initialized successfully');
      }
    }
  }

  async isEnabled(): Promise<boolean> {
    const config = await storage.getConfig('maps_enabled');
    return config?.isEnabled || false;
  }

  async geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    try {
      if (!this.client || !this.apiKey) {
        await this.initialize();
      }

      if (!this.client || !this.apiKey) {
        console.log('Google Maps not configured');
        return null;
      }

      const response = await this.client.geocode({
        params: {
          address,
          key: this.apiKey,
        },
      });

      if (response.data.results.length > 0) {
        const location = response.data.results[0].geometry.location;
        return { lat: location.lat, lng: location.lng };
      }

      return null;
    } catch (error) {
      console.error('Error geocoding address:', error);
      return null;
    }
  }

  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
      if (!this.client || !this.apiKey) {
        await this.initialize();
      }

      if (!this.client || !this.apiKey) {
        console.log('Google Maps not configured');
        return null;
      }

      const response = await this.client.reverseGeocode({
        params: {
          latlng: { lat, lng },
          key: this.apiKey,
        },
      });

      if (response.data.results.length > 0) {
        return response.data.results[0].formatted_address;
      }

      return null;
    } catch (error) {
      console.error('Error reverse geocoding:', error);
      return null;
    }
  }

  async validateLocation(lat: number, lng: number): Promise<boolean> {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }
}

export const mapsService = new MapsService();
