import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ComplianceService } from './compliance.service';

// RTMS element 8. Produces the monthly safety-performance / management-review
// record: the numbers management is required to look at, captured once per
// month so the trend is auditable rather than recomputed from today's data.
@Injectable()
export class MonthlyReviewService {
  private readonly logger = new Logger(MonthlyReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
  ) {}

  monthKey(d: Date) {
    return d.toISOString().slice(0, 7);
  }

  async metricsFor(periodMonth: string) {
    const [y, m] = periodMonth.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    const range = { gte: start, lt: end };

    const [mass, incidents, fines, workOrders, inspections, trips, speedEvents, items] =
      await Promise.all([
        this.prisma.tripMassRecord.findMany({ where: { measuredAt: range } }),
        this.prisma.incident.findMany({ where: { occurredAt: range }, include: { actions: true } }),
        this.prisma.fine.findMany({ where: { issuedOn: range } }),
        this.prisma.workOrder.findMany({ where: { requestedAt: range }, include: { status: true } }),
        this.prisma.inspection.findMany({ where: { performedAt: range } }),
        this.prisma.assignment.findMany({ where: { createdAt: range }, include: { status: true } }),
        this.prisma.speedEvent.findMany({ where: { occurredAt: range } }),
        this.prisma.complianceItem.findMany({ where: { archivedAt: null } }),
      ]);

    const overloaded = mass.filter((r) => r.overloaded).length;
    const maintenanceSpend = workOrders.reduce(
      (s, w) => s + Number(w.partsCost ?? 0) + Number(w.labourCost ?? 0),
      0,
    );

    return {
      periodMonth,
      load: {
        tripsWeighed: mass.length,
        overloaded,
        overloadingPct: mass.length ? Number(((overloaded / mass.length) * 100).toFixed(2)) : 0,
      },
      incidents: {
        total: incidents.length,
        withInjuries: incidents.filter((i) => i.injuries > 0).length,
        openCorrectiveActions: incidents.flatMap((i) => i.actions).filter((a) => a.status === 'OPEN' || a.status === 'IN_PROGRESS').length,
      },
      fines: {
        count: fines.length,
        totalAmount: fines.reduce((s, f) => s + Number(f.amount), 0),
        unpaid: fines.filter((f) => f.status === 'UNPAID').length,
      },
      maintenance: {
        workOrdersRaised: workOrders.length,
        workOrdersClosed: workOrders.filter((w) => w.status.isTerminal).length,
        spend: Number(maintenanceSpend.toFixed(2)),
      },
      inspections: {
        performed: inspections.length,
        failed: inspections.filter((i) => !i.passed).length,
      },
      trips: {
        total: trips.length,
        delivered: trips.filter((t) => t.status.isTerminal).length,
        gateBlocked: trips.filter((t) => t.gateDecision === 'FAIL').length,
        gateOverridden: trips.filter((t) => t.gateDecision === 'OVERRIDDEN').length,
      },
      speed: {
        events: speedEvents.length,
        worstOverKph: speedEvents.reduce((max, e) => Math.max(max, e.overByKph), 0),
      },
      compliance: {
        total: items.length,
        valid: items.filter((i) => i.status === 'VALID').length,
        dueSoon: items.filter((i) => i.status === 'DUE_SOON').length,
        expired: items.filter((i) => i.status === 'EXPIRED').length,
      },
    };
  }

  // Idempotent per month: re-running refreshes the snapshot rather than
  // creating a second review for the same period.
  async generate(periodMonth?: string) {
    const now = new Date();
    const key =
      periodMonth ??
      this.monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));

    const metrics = await this.metricsFor(key);
    const review = await this.prisma.managementReview.upsert({
      where: { periodMonth: key },
      update: { metrics: metrics as any, generatedAt: new Date() },
      create: { periodMonth: key, metrics: metrics as any },
    });

    // Score the objectives that this month's numbers speak to.
    await this.scoreObjectives(metrics);

    this.logger.log(`management review ${key} generated`);
    return review;
  }

  private async scoreObjectives(metrics: any) {
    const objectives = await this.prisma.safetyObjective.findMany();
    const actuals: Record<string, number> = {
      OVERLOADING_PCT: metrics.load.overloadingPct,
      FATAL_INCIDENTS: metrics.incidents.withInjuries,
      COMPLIANCE_PCT: metrics.compliance.total
        ? Number(((metrics.compliance.valid / metrics.compliance.total) * 100).toFixed(2))
        : 100,
    };
    for (const o of objectives) {
      const actual = actuals[o.metric];
      if (actual === undefined) continue;
      await this.prisma.safetyObjective.update({
        where: { id: o.id },
        data: { actualValue: actual },
      });
    }
  }
}
