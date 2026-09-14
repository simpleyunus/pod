import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assessMovement } from '../deals/movement';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingService } from '../tracking/tracking.service';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from './whatsapp.provider';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tracking: TrackingService,
    private readonly config: ConfigService,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppProvider,
  ) {}

  get providerMode() {
    return this.whatsapp.mode;
  }

  private webOrigin() {
    return (this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3002').split(',')[0];
  }

  private trackUrl(token: string) {
    return `${this.webOrigin()}/track/${token}`;
  }

  buildStatusMessage(deal: any, trackToken: string) {
    const first = deal.client.fullName.split(' ')[0];
    const car = `${deal.make} ${deal.model}`;
    const stage = deal.currentStatus?.name ?? 'in progress';
    const where = deal.currentLocation ? ` (${deal.currentLocation.name})` : '';
    return (
      `Hi ${first} 👋 An update on your ${car} — it is now *${stage}*${where}. ` +
      `You can follow it live anytime: ${this.trackUrl(trackToken)}`
    );
  }

  // The one path every WhatsApp update goes through: builds the message,
  // asks the provider to send, records the outcome as a Notification row.
  async notifyDealUpdate(dealId: string, opts: { force?: boolean } = {}) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        client: true,
        currentStatus: true,
        currentLocation: true,
      },
    });
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);

    const record = (data: Partial<Parameters<typeof this.prisma.notification.create>[0]['data']>) =>
      this.prisma.notification.create({
        data: {
          dealId: deal.id,
          clientId: deal.clientId,
          channel: 'WHATSAPP',
          toPhone: deal.client.phoneE164,
          template: 'status-update',
          body: '',
          ...data,
        } as any,
      });

    if (!deal.client.phoneE164) {
      return record({ status: 'SKIPPED', error: 'Client has no phone number' });
    }
    if (!deal.client.whatsappOptIn && !opts.force) {
      return record({ status: 'SKIPPED', error: 'Client has not opted in to WhatsApp' });
    }

    const link = await this.tracking.getOrCreate(deal.id);
    const body = this.buildStatusMessage(deal, link.token);
    const result = await this.whatsapp.send(deal.client.phoneE164, body);

    return record({
      body,
      status: result.ok ? (result.logged ? 'LOGGED' : 'SENT') : 'FAILED',
      providerMessageId: result.providerMessageId,
      error: result.error,
      sentAt: result.ok && !result.logged ? new Date() : null,
    });
  }

  listForDeal(dealId: string) {
    return this.prisma.notification.findMany({
      where: { dealId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  listRecent(limit = 20) {
    return this.prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(50, limit),
      include: {
        deal: { select: { id: true, reference: true } },
        client: { select: { fullName: true } },
      },
    });
  }

  // ── Two-way: inbound WhatsApp messages ──────────────────────────────
  // "status" / "where is my car" → automatic reply with the live position.
  async handleInbound(fromPhoneRaw: string, text: string, raw?: unknown) {
    const fromPhone = fromPhoneRaw.startsWith('+') ? fromPhoneRaw : `+${fromPhoneRaw}`;
    const client = await this.prisma.client.findFirst({ where: { phoneE164: fromPhone } });

    const inbound = await this.prisma.inboundMessage.create({
      data: { fromPhone, body: text, clientId: client?.id, raw: raw as any },
    });

    const asksStatus = /\b(status|update|where|progress|track)\b/i.test(text);
    if (!asksStatus) return { inboundId: inbound.id, handled: false };

    let reply: string;
    if (!client) {
      reply =
        'Hi! We could not find a car linked to this number. ' +
        'Please contact your POD consultant and we will sort it out.';
    } else {
      const deal = await this.prisma.deal.findFirst({
        where: { clientId: client.id, archivedAt: null },
        orderBy: { updatedAt: 'desc' },
        include: { currentStatus: true, currentLocation: true },
      });
      if (!deal) {
        reply = `Hi ${client.fullName.split(' ')[0]}! We could not find an active car for you right now.`;
      } else {
        const link = await this.tracking.getOrCreate(deal.id);
        const stage = deal.currentStatus?.name ?? 'in progress';
        const where = deal.currentLocation ? ` (${deal.currentLocation.name})` : '';
        const eta = deal.expectedDeliveryDate
          ? ` Expected delivery around ${new Date(deal.expectedDeliveryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`
          : '';
        reply =
          `Hi ${client.fullName.split(' ')[0]} 👋 Your ${deal.make} ${deal.model} is currently *${stage}*${where}.${eta} ` +
          `Follow it live: ${this.trackUrl(link.token)}`;
      }
    }

    const result = await this.whatsapp.send(fromPhone, reply);
    await this.prisma.$transaction([
      this.prisma.inboundMessage.update({
        where: { id: inbound.id },
        data: { handled: true, reply },
      }),
      this.prisma.notification.create({
        data: {
          clientId: client?.id,
          channel: 'WHATSAPP',
          toPhone: fromPhone,
          template: 'status-reply',
          body: reply,
          status: result.ok ? (result.logged ? 'LOGGED' : 'SENT') : 'FAILED',
          providerMessageId: result.providerMessageId,
          error: result.error,
          sentAt: result.ok && !result.logged ? new Date() : null,
        },
      }),
    ]);

    return { inboundId: inbound.id, handled: true, reply };
  }

  // ── Stalled-deal reminders (internal channel) ───────────────────────
  async createStalledReminders() {
    // Stages set their own patience and an overdue promise can flag a deal
    // that has been touched today, so no single SQL predicate expresses the
    // rule. Fetch the open deals and apply assessMovement — the same function
    // the board uses, so the two cannot drift on what "stalled" means.
    //
    // A coarse pre-filter keeps this honest at volume: nothing can be stalled
    // before the most impatient stage could have expired, unless its delivery
    // date has already passed.
    const stages = await this.prisma.dealStatus.findMany({
      select: { stalledAfterDays: true },
    });
    const soonest = Math.max(
      2,
      Math.floor(Math.min(...stages.map((s) => s.stalledAfterDays), 10) / 2),
    );
    const coarse = new Date(Date.now() - soonest * 86_400_000);

    const candidates = await this.prisma.deal.findMany({
      where: {
        archivedAt: null,
        OR: [{ currentStatusId: null }, { currentStatus: { isTerminal: false } }],
        AND: [
          {
            OR: [
              { lastProgressAt: { lt: coarse } },
              { lastProgressAt: null, createdAt: { lt: coarse } },
              { expectedDeliveryDate: { lt: new Date() } },
            ],
          },
        ],
      },
      include: { client: { select: { fullName: true } }, currentStatus: true },
    });

    // Only red deals get chased. Amber is for the board to show, not to nag.
    const stalled = candidates.filter((d) => assessMovement(d).state === 'STALLED');

    let created = 0;
    for (const deal of stalled) {
      // one nudge per deal per day
      const recent = await this.prisma.notification.findFirst({
        where: {
          dealId: deal.id,
          channel: 'INTERNAL',
          createdAt: { gt: new Date(Date.now() - 20 * 3_600_000) },
        },
      });
      if (recent) continue;
      const movement = assessMovement(deal);
      await this.prisma.notification.create({
        data: {
          dealId: deal.id,
          clientId: deal.clientId,
          channel: 'INTERNAL',
          template: 'stalled-deal',
          body: `${deal.reference} (${deal.client.fullName}): ${movement.reason} — still "${deal.currentStatus?.name ?? 'no stage'}"`,
          status: 'LOGGED',
        },
      });
      created++;
    }
    return { stalled: stalled.length, remindersCreated: created };
  }
}
