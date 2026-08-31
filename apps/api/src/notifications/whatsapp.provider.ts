import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WhatsAppSendResult {
  ok: boolean;
  providerMessageId?: string;
  logged?: boolean; // true when the stub provider recorded instead of sending
  error?: string;
}

export interface WhatsAppProvider {
  readonly mode: 'log' | 'meta';
  send(toE164: string, body: string): Promise<WhatsAppSendResult>;
}

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

// Stub provider: every send is recorded as a Notification row with status
// LOGGED, so the whole pipeline is demonstrable without a Meta account.
@Injectable()
export class LogWhatsAppProvider implements WhatsAppProvider {
  readonly mode = 'log' as const;
  private readonly logger = new Logger('WhatsApp(log)');

  async send(toE164: string, body: string): Promise<WhatsAppSendResult> {
    this.logger.log(`[would send] to=${toE164} :: ${body.slice(0, 120)}`);
    return { ok: true, logged: true };
  }
}

// Real provider: Meta WhatsApp Cloud API. Activates when
// WHATSAPP_MODE=meta + WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID are set.
@Injectable()
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly mode = 'meta' as const;
  private readonly logger = new Logger('WhatsApp(meta)');

  constructor(private readonly config: ConfigService) {}

  async send(toE164: string, body: string): Promise<WhatsAppSendResult> {
    const token = this.config.get<string>('WHATSAPP_TOKEN');
    const phoneId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    if (!token || !phoneId) {
      return { ok: false, error: 'WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not configured' };
    }
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toE164.replace(/^\+/, ''),
          type: 'text',
          text: { preview_url: true, body },
        }),
      });
      const data: any = await res.json();
      if (!res.ok) {
        this.logger.error(`send failed: ${JSON.stringify(data?.error ?? data).slice(0, 300)}`);
        return { ok: false, error: data?.error?.message ?? `HTTP ${res.status}` };
      }
      return { ok: true, providerMessageId: data?.messages?.[0]?.id };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
}

export const whatsAppProviderFactory = {
  provide: WHATSAPP_PROVIDER,
  useFactory: (config: ConfigService): WhatsAppProvider =>
    config.get('WHATSAPP_MODE', 'log') === 'meta'
      ? new MetaWhatsAppProvider(config)
      : new LogWhatsAppProvider(),
  inject: [ConfigService],
};
