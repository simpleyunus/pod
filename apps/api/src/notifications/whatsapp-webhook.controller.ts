import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators';
import { NotificationsService } from './notifications.service';

// Meta Cloud API webhook. Both endpoints are public by design:
// GET is Meta's subscription handshake, POST carries inbound messages.
// For local testing, POST also accepts a plain { from, body } payload.
@Controller('whatsapp')
export class WhatsAppWebhookController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('webhook')
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    const expected = this.config.get('WHATSAPP_VERIFY_TOKEN', 'pod-verify-token');
    if (mode === 'subscribe' && token === expected) return challenge;
    throw new ForbiddenException('Verification failed');
  }

  @Public()
  @Post('webhook')
  async receive(@Body() body: any) {
    // Simple shape for local testing: { "from": "+263...", "body": "status" }
    if (body?.from && typeof body?.body === 'string') {
      return this.notifications.handleInbound(body.from, body.body, body);
    }

    // Meta Cloud API shape
    const results: unknown[] = [];
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        for (const msg of change?.value?.messages ?? []) {
          if (msg?.type === 'text' && msg?.from) {
            results.push(await this.notifications.handleInbound(msg.from, msg.text?.body ?? '', msg));
          }
        }
      }
    }
    if (!results.length && !body?.entry) throw new BadRequestException('Unrecognised payload');
    return { received: results.length };
  }
}
