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

  /**
   * R17 Safety Performance Report. The manual (4.15) lists exactly what is
   * monitored, and R17's columns are those six counts — so this returns them
   * under those names, and the register prints them straight out.
   *
   *   Number of accidents/incidents · Number of Speed violations ·
   *   Number of traffic fines · Number of excessive hours (shift/driving) ·
   *   Number of service overruns · Number of overloads
   */
  async metricsFor(periodMonth: string) {
    const [y, m] = periodMonth.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    const range = { gte: start, lt: end };

    const [mass, incidents, fines, speedTrends, workOrders, inspections, trips, plans, duty, items] =
      await Promise.all([
        this.prisma.tripMassRecord.findMany({ where: { date: range } }),
        this.prisma.incident.findMany({ where: { date: range }, include: { actions: true } }),
        this.prisma.fine.findMany({ where: { date: range } }),
        this.prisma.speedTrend.findMany({ where: { date: range } }),
        this.prisma.workOrder.findMany({ where: { requestedAt: range }, include: { status: true } }),
        this.prisma.inspection.findMany({ where: { performedAt: range } }),
        this.prisma.assignment.findMany({ where: { createdAt: range }, include: { status: true } }),
        this.prisma.maintenancePlan.findMany({ where: { active: true }, include: { asset: true } }),
        this.prisma.driverDutyRecord.findMany({ where: { onDutyAt: range } }),
        this.prisma.complianceItem.findMany({ where: { archivedAt: null } }),
      ]);

    // "Excessive hours (shift/driving)" — P2's limits: over 15h in a shift,
    // or a shift that owed a 30-minute break per 4h of driving and did not
    // record one.
    const excessiveHours = duty.filter((d) => {
      const end2 = d.offDutyAt ?? new Date();
      const shiftMinutes = (end2.getTime() - d.onDutyAt.getTime()) / 60_000;
      const owedBreaks = Math.floor(d.drivingMinutes / 240) * 30;
      return shiftMinutes > 15 * 60 || owedBreaks > d.breakMinutes;
    }).length;

    // "Service overruns" — a plan past its due date or due kilometres.
    const serviceOverruns = plans.filter(
      (p2) =>
        (p2.nextDueDate !== null && p2.nextDueDate < end) ||
        (p2.nextDueOdoKm !== null && p2.asset.odometerKm >= p2.nextDueOdoKm),
    ).length;

    const overloads = mass.filter((r) => r.overloaded).length;

    return {
      periodMonth,
      // ── The six R17 columns, in the register's order ──────────────────
      r17: {
        accidentsIncidents: incidents.length,
        speedViolations: speedTrends.length,
        trafficFines: fines.length,
        excessiveHours,
        serviceOverruns,
        overloads,
      },
      // ── Supporting detail for the dashboard and the review record ────
      load: {
        tripsRecorded: mass.length,
        overloaded: overloads,
        // R4 Monthly Overloading Report.
        overloadingPct: mass.length ? Number(((overloads / mass.length) * 100).toFixed(2)) : 0,
      },
      incidents: {
        total: incidents.length,
        nearMisses: incidents.filter((i) => i.isNearMiss).length,
        withInjuries: incidents.filter((i) => i.injuries > 0).length,
        openCorrectiveActions: incidents
          .flatMap((i) => i.actions)
          .filter((a) => a.status === 'OPEN' || a.status === 'IN_PROGRESS').length,
      },
      maintenance: {
        workOrdersRaised: workOrders.length,
        workOrdersClosed: workOrders.filter((w) => w.status.isTerminal).length,
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
      SPEED_VIOLATIONS: metrics.r17.speedViolations,
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
