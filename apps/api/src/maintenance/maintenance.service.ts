import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FleetEventsService } from '../fleet/fleet-events.service';

const DAY_MS = 86_400_000;
const MONTH_MS = 30 * DAY_MS;

// A service becomes amber once the vehicle is within this fraction of the km
// interval — the distance equivalent of the date-based lead time.
const KM_LEAD_FRACTION = 0.1;

// Allowed lifecycle moves. DONE→IN_PROGRESS exists because work reopens.
const TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ['APPROVED', 'CLOSED'],
  APPROVED: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['AWAITING_PARTS', 'DONE', 'CLOSED'],
  AWAITING_PARTS: ['IN_PROGRESS', 'DONE', 'CLOSED'],
  DONE: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: FleetEventsService,
  ) {}

  // ── Plans ────────────────────────────────────────────────────────────

  /**
   * Interval by km AND/OR months, whichever falls first.
   *
   * km is resolved into a *date* rather than tracked separately, because the
   * module's rule is that one field — ComplianceItem.expiresOn — decides every
   * RAG colour. A vehicle already past its km interval gets an expiry of today
   * (so it reads EXPIRED); one inside the lead fraction gets an expiry that
   * puts it in the amber window.
   */
  computeDue(
    plan: { intervalKm: number | null; intervalMonths: number | null; lastServiceOdoKm: number | null; lastServiceDate: Date | null },
    odometerKm: number,
    now = new Date(),
  ) {
    const nextDueOdoKm =
      plan.intervalKm != null && plan.lastServiceOdoKm != null
        ? plan.lastServiceOdoKm + plan.intervalKm
        : null;
    const nextDueDate =
      plan.intervalMonths != null && plan.lastServiceDate
        ? new Date(plan.lastServiceDate.getTime() + plan.intervalMonths * MONTH_MS)
        : null;

    let effectiveExpiry = nextDueDate;
    if (nextDueOdoKm != null) {
      const kmRemaining = nextDueOdoKm - odometerKm;
      const leadKm = (plan.intervalKm ?? 0) * KM_LEAD_FRACTION;
      const kmExpiry =
        kmRemaining <= 0
          ? now // already due on distance
          : kmRemaining <= leadKm
            ? new Date(now.getTime() + 7 * DAY_MS) // inside the amber window
            : null;
      // "Whichever comes first" — the earlier of the two triggers wins.
      if (kmExpiry && (!effectiveExpiry || kmExpiry < effectiveExpiry)) effectiveExpiry = kmExpiry;
    }

    return { nextDueOdoKm, nextDueDate, effectiveExpiry };
  }

  listPlans(assetId?: string) {
    return this.prisma.maintenancePlan.findMany({
      where: { ...(assetId && { assetId }), active: true },
      include: { asset: { select: { id: true, code: true, registrationNo: true, odometerKm: true } } },
      orderBy: { nextDueDate: 'asc' },
    });
  }

  async createPlan(data: any, actorId?: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: data.assetId } });
    if (!asset) throw new NotFoundException('Asset not found');

    const plan = await this.prisma.maintenancePlan.create({ data });
    await this.syncPlan(plan.id);
    await this.events.record('ASSET', data.assetId, 'SYSTEM', `Maintenance plan "${plan.name}" created`, { planId: plan.id }, actorId);
    return this.prisma.maintenancePlan.findUnique({ where: { id: plan.id } });
  }

  async updatePlan(id: string, data: any) {
    const existing = await this.prisma.maintenancePlan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Maintenance plan not found');
    await this.prisma.maintenancePlan.update({ where: { id }, data });
    return this.syncPlan(id);
  }

  /**
   * Recompute one plan's due points and mirror them into the asset's
   * SERVICE_DUE ComplianceItem, so an overdue service shows up in the same RAG
   * dashboard, the same reminders and the same audit reports as an expired
   * licence — no second notification path.
   */
  async syncPlan(planId: string, now = new Date()) {
    const plan = await this.prisma.maintenancePlan.findUnique({
      where: { id: planId },
      include: { asset: true },
    });
    if (!plan) throw new NotFoundException('Maintenance plan not found');

    const { nextDueOdoKm, nextDueDate, effectiveExpiry } = this.computeDue(plan, plan.asset.odometerKm, now);

    const updated = await this.prisma.maintenancePlan.update({
      where: { id: planId },
      data: { nextDueOdoKm, nextDueDate },
    });

    const kind = await this.prisma.complianceKind.findUnique({ where: { code: 'SERVICE_DUE' } });
    if (!kind) {
      this.logger.warn('SERVICE_DUE compliance kind is missing — run the seed');
      return updated;
    }

    const existing = await this.prisma.complianceItem.findFirst({
      where: { assetId: plan.assetId, kindId: kind.id, archivedAt: null },
    });

    const payload = {
      reference: plan.name,
      expiresOn: effectiveExpiry,
      notes:
        [
          nextDueOdoKm != null ? `Due at ${nextDueOdoKm.toLocaleString()} km` : null,
          nextDueDate ? `or ${nextDueDate.toISOString().slice(0, 10)}` : null,
        ].filter(Boolean).join(' ') || null,
    };

    if (existing) {
      await this.prisma.complianceItem.update({ where: { id: existing.id }, data: payload });
    } else {
      await this.prisma.complianceItem.create({
        data: { ownerType: 'ASSET', assetId: plan.assetId, kindId: kind.id, ...payload },
      });
    }
    return updated;
  }

  // Nightly, and after every odometer reading: keeps SERVICE_DUE honest.
  async syncAllPlans(now = new Date()) {
    const plans = await this.prisma.maintenancePlan.findMany({ where: { active: true } });
    for (const p of plans) await this.syncPlan(p.id, now);
    return { synced: plans.length };
  }

  private async syncPlansForAsset(assetId: string) {
    const plans = await this.prisma.maintenancePlan.findMany({ where: { assetId, active: true } });
    for (const p of plans) await this.syncPlan(p.id);
  }

  // ── Work orders ──────────────────────────────────────────────────────

  listWorkOrders(filters: { assetId?: string; statusCode?: string; openOnly?: boolean } = {}) {
    return this.prisma.workOrder.findMany({
      where: {
        ...(filters.assetId && { assetId: filters.assetId }),
        ...(filters.statusCode && { status: { code: filters.statusCode } }),
        ...(filters.openOnly && { status: { isTerminal: false } }),
      },
      include: {
        status: true,
        asset: { select: { id: true, code: true, registrationNo: true } },
        inspectionResults: { include: { item: true } },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  private async nextWorkOrderNumber() {
    const year = new Date().getFullYear();
    const count = await this.prisma.workOrder.count({
      where: { number: { startsWith: `WO-${year}-` } },
    });
    return `WO-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async createWorkOrder(data: any, actorId?: string) {
    const status = await this.prisma.workOrderStatus.findUnique({ where: { code: 'REQUESTED' } });
    if (!status) throw new BadRequestException('Work order statuses are not seeded');

    const workOrder = await this.prisma.workOrder.create({
      data: { ...data, number: await this.nextWorkOrderNumber(), statusId: status.id, requestedById: actorId },
      include: { status: true, asset: true },
    });

    await this.events.record('ASSET', data.assetId, 'STATUS_CHANGE', `Work order ${workOrder.number} raised: ${workOrder.title}`, { workOrderId: workOrder.id }, actorId);
    await this.events.record('WORK_ORDER', workOrder.id, 'STATUS_CHANGE', 'Requested', null, actorId);
    return workOrder;
  }

  async updateWorkOrder(id: string, data: any) {
    const existing = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Work order not found');
    return this.prisma.workOrder.update({ where: { id }, data, include: { status: true } });
  }

  async transitionWorkOrder(id: string, body: any, actorId?: string) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id },
      include: { status: true, asset: true },
    });
    if (!workOrder) throw new NotFoundException('Work order not found');

    const allowed = TRANSITIONS[workOrder.status.code] ?? [];
    if (!allowed.includes(body.statusCode)) {
      throw new BadRequestException(
        `Cannot move a work order from ${workOrder.status.code} to ${body.statusCode}. ` +
          `Allowed: ${allowed.join(', ') || 'none — it is closed'}`,
      );
    }

    const next = await this.prisma.workOrderStatus.findUnique({ where: { code: body.statusCode } });
    if (!next) throw new BadRequestException(`Unknown status ${body.statusCode}`);

    const now = new Date();
    const stamps: Record<string, any> = {
      APPROVED: { approvedAt: now, approvedById: actorId },
      IN_PROGRESS: { startedAt: workOrder.startedAt ?? now },
      DONE: { completedAt: now },
      CLOSED: { closedAt: now, completedAt: workOrder.completedAt ?? now },
    };

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        statusId: next.id,
        ...(stamps[body.statusCode] ?? {}),
        ...(body.partsCost !== undefined && body.partsCost !== null && { partsCost: body.partsCost }),
        ...(body.labourCost !== undefined && body.labourCost !== null && { labourCost: body.labourCost }),
      },
      include: { status: true, asset: true },
    });

    await this.events.record('WORK_ORDER', id, 'STATUS_CHANGE', `${workOrder.status.name} → ${next.name}${body.note ? `: ${body.note}` : ''}`, { from: workOrder.status.code, to: next.code }, actorId);
    await this.events.record('ASSET', workOrder.assetId, 'STATUS_CHANGE', `Work order ${workOrder.number}: ${next.name}`, { workOrderId: id }, actorId);

    // Completing a job is what advances the maintenance plan — the plan is
    // never edited by hand to claim a service happened.
    if (body.statusCode === 'DONE' || body.statusCode === 'CLOSED') {
      const odo = body.completedOdometerKm ?? workOrder.odometerKm ?? workOrder.asset.odometerKm;
      if (odo > workOrder.asset.odometerKm) {
        await this.prisma.asset.update({ where: { id: workOrder.assetId }, data: { odometerKm: odo } });
      }
      const plans = await this.prisma.maintenancePlan.findMany({
        where: { assetId: workOrder.assetId, active: true },
      });
      for (const plan of plans) {
        await this.prisma.maintenancePlan.update({
          where: { id: plan.id },
          data: { lastServiceOdoKm: odo, lastServiceDate: now },
        });
        await this.syncPlan(plan.id);
      }
    }

    return updated;
  }

  async workOrderById(id: string) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id },
      include: {
        status: true,
        asset: { select: { id: true, code: true, registrationNo: true } },
        inspectionResults: { include: { item: true, inspection: true } },
      },
    });
    if (!workOrder) throw new NotFoundException('Work order not found');
    const events = await this.events.withActors(await this.events.list('WORK_ORDER', id));
    return { ...workOrder, events };
  }

  // ── Inspections (daily pre-trip) ─────────────────────────────────────

  listInspections(filters: { assetId?: string; assignmentId?: string; failedOnly?: boolean } = {}) {
    return this.prisma.inspection.findMany({
      where: {
        ...(filters.assetId && { assetId: filters.assetId }),
        ...(filters.assignmentId && { assignmentId: filters.assignmentId }),
        ...(filters.failedOnly && { passed: false }),
      },
      include: {
        asset: { select: { id: true, code: true, registrationNo: true } },
        driver: { select: { id: true, fullName: true } },
        results: { include: { item: true } },
      },
      orderBy: { performedAt: 'desc' },
      take: 100,
    });
  }

  /**
   * A checklist submission. Any FAIL fails the inspection; a failed item
   * flagged `raiseWorkOrder` opens a job against the vehicle immediately, so a
   * defect cannot be found and then lost.
   */
  async createInspection(data: any, actorId?: string) {
    const { results, ...header } = data;
    const itemIds = results.map((r: any) => r.itemId);
    const items = await this.prisma.inspectionItemDef.findMany({ where: { id: { in: itemIds } } });
    if (items.length !== new Set(itemIds).size) {
      throw new BadRequestException('One or more checklist items are unknown');
    }
    const itemById = new Map(items.map((i) => [i.id, i]));
    const failed = results.filter((r: any) => r.outcome === 'FAIL');

    const inspection = await this.prisma.inspection.create({
      data: {
        ...header,
        passed: failed.length === 0,
        results: {
          create: results.map((r: any) => ({
            itemId: r.itemId,
            outcome: r.outcome,
            note: r.note,
            photoFileId: r.photoFileId,
          })),
        },
      },
      include: { results: { include: { item: true } }, asset: true },
    });

    for (const r of results.filter((x: any) => x.outcome === 'FAIL' && x.raiseWorkOrder)) {
      const def = itemById.get(r.itemId)!;
      const workOrder = await this.createWorkOrder(
        {
          assetId: header.assetId,
          title: `Pre-trip failure: ${def.label}`,
          description: r.note ?? `Failed on the pre-trip inspection of ${new Date().toISOString().slice(0, 10)}.`,
          odometerKm: header.odometerKm ?? null,
        },
        actorId,
      );
      const resultRow = inspection.results.find((x) => x.itemId === r.itemId);
      if (resultRow) {
        await this.prisma.inspectionResult.update({
          where: { id: resultRow.id },
          data: { workOrderId: workOrder.id },
        });
      }
    }

    if (header.odometerKm && header.odometerKm > inspection.asset.odometerKm) {
      await this.prisma.asset.update({
        where: { id: header.assetId },
        data: { odometerKm: header.odometerKm },
      });
      await this.syncPlansForAsset(header.assetId);
    }

    const criticalFailures = failed
      .map((r: any) => itemById.get(r.itemId))
      .filter((i: any) => i?.critical)
      .map((i: any) => i!.label);

    await this.events.record(
      'ASSET', header.assetId, 'NOTE',
      `Pre-trip inspection ${inspection.passed ? 'passed' : `FAILED (${failed.length} item(s))`}`,
      { inspectionId: inspection.id, criticalFailures }, actorId,
    );

    return this.prisma.inspection.findUnique({
      where: { id: inspection.id },
      include: { results: { include: { item: true } }, asset: true, driver: true },
    });
  }

  // ── Overview ─────────────────────────────────────────────────────────

  async overview(now = new Date()) {
    const [plans, openWorkOrders, recentInspections] = await Promise.all([
      this.prisma.maintenancePlan.findMany({ where: { active: true }, include: { asset: true } }),
      this.prisma.workOrder.findMany({
        where: { status: { isTerminal: false } },
        include: { status: true, asset: { select: { id: true, code: true, registrationNo: true } } },
        orderBy: { requestedAt: 'asc' },
      }),
      this.prisma.inspection.findMany({
        where: { performedAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
        include: { asset: { select: { id: true, code: true } }, results: { include: { item: true } } },
        orderBy: { performedAt: 'desc' },
        take: 50,
      }),
    ]);

    const due = plans.map((p) => {
      const kmRemaining = p.nextDueOdoKm != null ? p.nextDueOdoKm - p.asset.odometerKm : null;
      const daysRemaining = p.nextDueDate
        ? Math.floor((p.nextDueDate.getTime() - now.getTime()) / DAY_MS)
        : null;
      const overdue = (kmRemaining !== null && kmRemaining <= 0) || (daysRemaining !== null && daysRemaining < 0);
      return {
        planId: p.id,
        assetId: p.assetId,
        assetCode: p.asset.code,
        registrationNo: p.asset.registrationNo,
        name: p.name,
        odometerKm: p.asset.odometerKm,
        nextDueOdoKm: p.nextDueOdoKm,
        nextDueDate: p.nextDueDate,
        kmRemaining,
        daysRemaining,
        overdue,
      };
    });

    return {
      generatedAt: now.toISOString(),
      servicesDue: due.sort((a, b) => Number(b.overdue) - Number(a.overdue)),
      overdueCount: due.filter((d) => d.overdue).length,
      openWorkOrders,
      failedInspections: recentInspections.filter((i) => !i.passed),
      inspectionsLast30Days: recentInspections.length,
    };
  }
}
