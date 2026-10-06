import { PostHog } from 'posthog-node';
import { config } from '../../config/index.js';

export class PostHogClient {
  private apiKey: string;
  private host: string;
  private client: PostHog | null = null;

  constructor(opts?: { apiKey?: string; host?: string }) {
    this.apiKey = opts?.apiKey || config.posthog.apiKey || '';
    this.host = opts?.host || config.posthog.host || 'https://us.i.posthog.com';
  }

  isConfigured(): boolean {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return false;
    }
    return this.apiKey.length > 0;
  }

  private getClient(): PostHog | null {
    if (!this.isConfigured()) return null;
    if (!this.client) {
      this.client = new PostHog(this.apiKey, { host: this.host });
    }
    return this.client;
  }

  capture(
    distinctId: string,
    event: string,
    properties?: Record<string, unknown>,
  ): void {
    const client = this.getClient();
    if (!client) {
      process.stdout.write(
        JSON.stringify({
          event: 'posthog_noop_capture',
          distinctId: distinctId.slice(0, 8) + '...',
          name: event,
          timestamp: new Date().toISOString(),
        }) + '\n',
      );
      return;
    }
    client.capture({ distinctId, event, properties });
  }

  identify(distinctId: string, properties?: Record<string, unknown>): void {
    const client = this.getClient();
    if (!client) {
      process.stdout.write(
        JSON.stringify({
          event: 'posthog_noop_identify',
          distinctId: distinctId.slice(0, 8) + '...',
          timestamp: new Date().toISOString(),
        }) + '\n',
      );
      return;
    }
    client.identify({ distinctId, properties });
  }

  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.shutdown();
      this.client = null;
    }
  }
}

export const posthogClient = new PostHogClient();

/** Object-style capture used by auth routes */
export const posthog = {
  capture(args: { distinctId: string; event: string; properties?: Record<string, unknown> }) {
    posthogClient.capture(args.distinctId, args.event, args.properties);
  },
  identify(args: { distinctId: string; properties?: Record<string, unknown> }) {
    posthogClient.identify(args.distinctId, args.properties);
  },
};
