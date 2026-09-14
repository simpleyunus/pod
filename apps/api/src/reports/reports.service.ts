import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assessMovement } from '../deals/movement';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // FX_RATES_USD: how many units of each currency equal 1 USD,
  // e.g. {"USD":1,"ZAR":18.5,"BWP":13.6,"ZWL":30000}
  private fxRates(): Record<string, number> {
    try {
      const parsed = JSON.parse(this.config.get('FX_RATES_USD', '{"USD":1}'));
      return { USD: 1, ...parsed };
    } catch {
      return { USD: 1 };
    }
  }

  private toUsd(amount: number, currency: string | null, rates: Record<string, number>) {
    if (!currency || !rates[currency]) return null;
    return amount / rates[currency];
  }

  private monthKey(d: Date) {
    return d.toISOString().slice(0, 7);
  }

  async summary(months = 12) {
    const rates = this.fxRates();

    // period = the last N calendar months, inclusive of the current one.
    // All month math in UTC — monthKey() uses toISOString.
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));

    const [statuses, deals, payments, users, deliveredEvents] = await Promise.all([
      this.prisma.dealStatus.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.deal.findMany({
        include: {
          client: { select: { fullName: true } },
          currentStatus: true,
          payments: { select: { amount: true, currency: true } },
        },
      }),
      this.prisma.payment.findMany({ orderBy: { paidAt: 'asc' } }),
      this.prisma.user.findMany({ where: { active: true }, select: { id: true, fullName: true } }),
      // when did each car first reach a terminal stage?
      this.prisma.timelineEvent.findMany({
        where: { type: 'STATUS_CHANGE', status: { isTerminal: true } },
        orderBy: { createdAt: 'asc' },
        select: { dealId: true, createdAt: true },
      }),
    ]);

    const active = deals.filter((d) => !d.archivedAt);
    const firstDelivered = new Map<string, Date>();
    for (const ev of deliveredEvents) {
      if (!firstDelivered.has(ev.dealId)) firstDelivered.set(ev.dealId, ev.createdAt);
    }

    // ── funnel tiles (period-scoped) ────────────────────────────────
    const createdInPeriod = deals.filter((d) => d.createdAt >= periodStart);
    const deliveredInPeriod = [...firstDelivered.values()].filter((at) => at >= periodStart).length;
    const lost = deals.filter(
      (d) =>
        d.leadStage === 'CLOSED_LOST' ||
        (d.archivedAt && !firstDelivered.has(d.id) && (d.archivedAt >= periodStart)),
    ).length;
    const inProgress = active.filter((d) => !d.currentStatus?.isTerminal).length;
    const conversionRate = createdInPeriod.length
      ? Math.round((deliveredInPeriod / createdInPeriod.length) * 100)
      : null;

    // ── month-on-month series ───────────────────────────────────────
    const series = new Map<
      string,
      { newCars: number; delivered: number; invoiced: Record<string, number>; received: Record<string, number> }
    >();
    for (let i = 0; i < months; i++) {
      const d = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + i, 1));
      series.set(this.monthKey(d), { newCars: 0, delivered: 0, invoiced: {}, received: {} });
    }
    for (const d of deals) {
      const bucket = series.get(this.monthKey(d.createdAt));
      if (!bucket) continue;
      bucket.newCars++;
      if (d.sellingPrice && d.sellingCurrency) {
        bucket.invoiced[d.sellingCurrency] =
          (bucket.invoiced[d.sellingCurrency] ?? 0) + Number(d.sellingPrice);
      }
    }
    for (const [dealId, at] of firstDelivered) {
      const bucket = series.get(this.monthKey(at));
      if (bucket) bucket.delivered++;
    }
    for (const p of payments) {
      const bucket = series.get(this.monthKey(p.paidAt));
      if (bucket) bucket.received[p.currency] = (bucket.received[p.currency] ?? 0) + Number(p.amount);
    }
    const monthly = [...series.entries()].map(([month, v]) => ({ month, ...v }));

    // ── team performance (period-scoped by deal creation) ──────────
    const team = new Map<
      string,
      { name: string; cars: number; delivered: number; invoiced: Record<string, number>; received: Record<string, number> }
    >();
    const teamKey = (id: string | null) => id ?? 'unassigned';
    for (const d of createdInPeriod) {
      const key = teamKey(d.consultantId);
      const entry = team.get(key) ?? {
        name: d.consultantId ? users.find((u) => u.id === d.consultantId)?.fullName ?? 'Unknown' : 'Unassigned',
        cars: 0,
        delivered: 0,
        invoiced: {},
        received: {},
      };
      entry.cars++;
      if (firstDelivered.has(d.id)) entry.delivered++;
      if (d.sellingPrice && d.sellingCurrency) {
        entry.invoiced[d.sellingCurrency] = (entry.invoiced[d.sellingCurrency] ?? 0) + Number(d.sellingPrice);
      }
      const paid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
      if (paid && d.sellingCurrency) {
        // payments keep their own currency; use per-payment currency
      }
      team.set(key, entry);
    }
    const dealById = new Map(deals.map((d) => [d.id, d]));
    for (const p of payments) {
      const deal = dealById.get(p.dealId);
      if (!deal || deal.createdAt < periodStart) continue;
      const entry = team.get(teamKey(deal.consultantId));
      if (entry) entry.received[p.currency] = (entry.received[p.currency] ?? 0) + Number(p.amount);
    }
    const teamPerformance = [...team.values()].sort((a, b) => b.cars - a.cars);

    // ── existing point-in-time breakdowns ───────────────────────────
    const stageCounts = new Map<string, number>();
    for (const d of active) {
      const key = d.currentStatusId ?? 'none';
      stageCounts.set(key, (stageCounts.get(key) ?? 0) + 1);
    }
    const byStage = [
      ...(stageCounts.get('none') ? [{ name: 'No stage', count: stageCounts.get('none')! }] : []),
      ...statuses.map((s) => ({ name: s.name, count: stageCounts.get(s.id) ?? 0 })),
    ];

    const countryCounts = new Map<string, number>();
    for (const d of active) {
      const key = d.destinationCountry ?? 'Unknown';
      countryCounts.set(key, (countryCounts.get(key) ?? 0) + 1);
    }
    const byCountry = [...countryCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const money: Record<string, { invoiced: number; received: number; balance: number }> = {};
    for (const d of active) {
      if (d.sellingPrice && d.sellingCurrency) {
        const m = (money[d.sellingCurrency] ??= { invoiced: 0, received: 0, balance: 0 });
        m.invoiced += Number(d.sellingPrice);
      }
    }
    for (const p of payments) {
      const m = (money[p.currency] ??= { invoiced: 0, received: 0, balance: 0 });
      m.received += Number(p.amount);
    }
    let invoicedUsd = 0;
    let receivedUsd = 0;
    let usdComplete = true;
    for (const [ccy, m] of Object.entries(money)) {
      m.balance = m.invoiced - m.received;
      const inv = this.toUsd(m.invoiced, ccy, rates);
      const rec = this.toUsd(m.received, ccy, rates);
      if (inv === null || rec === null) usdComplete = false;
      invoicedUsd += inv ?? 0;
      receivedUsd += rec ?? 0;
    }

    // Same assessment the board and the nudge sweep use, so all three agree.
    const stalled = active
      .map((d) => ({ deal: d, movement: assessMovement(d) }))
      .filter(({ movement }) => movement.state === 'STALLED')
      .map(({ deal: d, movement }) => ({
        id: d.id,
        reference: d.reference,
        client: d.client.fullName,
        stage: d.currentStatus?.name ?? 'No stage',
        days: movement.idleDays,
        stalledAfter: movement.stalledAfter,
        reason: movement.reason,
      }))
      .sort((a, b) => b.days - a.days);

    return {
      generatedAt: new Date().toISOString(),
      periodMonths: months,
      totals: {
        deals: active.length,
        inProgress,
        delivered: firstDelivered.size,
        stalled: stalled.length,
      },
      funnel: {
        newCars: createdInPeriod.length,
        delivered: deliveredInPeriod,
        inProgress,
        lost,
        conversionRate,
      },
      monthly,
      teamPerformance,
      byStage,
      byCountry,
      money,
      moneyUsd: { invoiced: invoicedUsd, received: receivedUsd, complete: usdComplete, rates },
      stalled: stalled.slice(0, 20),
    };
  }
}
