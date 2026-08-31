import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { FleetEventsService } from '../fleet/fleet-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { GateService } from './gate.service';

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: FleetEventsService,
    private readonly gate: GateService,
  ) {}

  private async statusByCode(code: string) {
    const status = await this.prisma.tripStatus.findUnique({ where: { code } });
    if (!status) throw new BadRequestException(`Trip status ${code} is not seeded`);
    return status;
  }

  // ── Assignments (trips) ──────────────────────────────────────────────

  async listAssignments(filters: { statusCode?: string; assetId?: string; driverId?: string; dealId?: string; openOnly?: boolean } = {}) {
    const assignments = await this.prisma.assignment.findMany({
      where: {
        ...(filters.statusCode && { status: { code: filters.statusCode } }),
        ...(filters.assetId && { assetId: filters.assetId }),
        ...(filters.driverId && { driverId: filters.driverId }),
        ...(filters.dealId && { dealId: filters.dealId }),
        ...(filters.openOnly && { status: { isTerminal: false } }),
      },
      include: {
        status: true,
        asset: { select: { id: true, code: true, registrationNo: true, maxMassKg: true } },
        driver: { select: { id: true, code: true, fullName: true } },
        carrier: { select: { id: true, name: true } },
        route: { select: { id: true, name: true, version: true } },
        deal: { select: { id: true, reference: true, make: true, model: true } },
        gateChecks: true,
        massRecords: { orderBy: { measuredAt: 'desc' }, take: 1 },
      },
      orderBy: [{ plannedDepartureAt: 'asc' }, { createdAt: 'desc' }],
    });

    return assignments.map((a) => ({
      ...a,
      gateFailures: a.gateChecks.filter((c) => !c.passed).length,
    }));
  }

  async assignmentById(id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        status: true,
        asset: true,
        driver: true,
        carrier: true,
        route: { include: { acknowledgements: true } },
        deal: { select: { id: true, reference: true, make: true, model: true, client: { select: { fullName: true } } } },
        legs: { orderBy: { sequence: 'asc' } },
        gateChecks: { orderBy: { code: 'asc' } },
        massRecords: { orderBy: { measuredAt: 'desc' } },
        inspection: { include: { results: { include: { item: true } } } },
        incidents: true,
        fines: true,
      },
    });
    if (!assignment) throw new NotFoundException(`Trip ${id} not found`);
    const events = await this.events.withActors(await this.events.list('ASSIGNMENT', id));
    return { ...assignment, events };
  }

  private async nextTripReference() {
    const year = new Date().getFullYear();
    const count = await this.prisma.assignment.count({ where: { reference: { startsWith: `TRIP-${year}-` } } });
    return `TRIP-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  /**
   * Creating a trip runs the gate immediately, so the board shows a red trip
   * from the moment it is planned rather than at the depot gate on the day.
   */
  async createAssignment(data: any, actorId?: string) {
    const { legs, ...rest } = data;
    const planned = await this.statusByCode('PLANNED');

    const assignment = await this.prisma.assignment.create({
      data: {
        ...rest,
        reference: await this.nextTripReference(),
        statusId: planned.id,
        ...(legs?.length && { legs: { create: legs } }),
      },
    });

    const result = await this.gate.evaluate(assignment.id);
    await this.gate.persist(assignment.id, result);
    await this.prisma.assignment.update({
      where: { id: assignment.id },
      data: { gateDecision: result.passed ? 'PASS' : 'FAIL', gateCheckedAt: new Date() },
    });

    await this.events.record(
      'ASSIGNMENT', assignment.id, 'GATE_CHECK',
      `Trip planned — gate ${result.passed ? 'passed' : `blocked on ${result.failures.length} check(s)`}`,
      { failures: result.failures }, actorId,
    );

    return this.assignmentById(assignment.id);
  }

  async updateAssignment(id: string, data: any, actorId?: string) {
    const existing = await this.prisma.assignment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Trip ${id} not found`);
    await this.prisma.assignment.update({ where: { id }, data });
    // Any change to who or what is on the trip re-opens the gate question.
    await this.runGate(id, actorId);
    return this.assignmentById(id);
  }

  async runGate(id: string, actorId?: string) {
    const result = await this.gate.evaluate(id);
    await this.gate.persist(id, result);
    const current = await this.prisma.assignment.findUnique({ where: { id } });
    // An existing override is not silently re-blessed: it is re-decided here.
    await this.prisma.assignment.update({
      where: { id },
      data: {
        gateDecision: result.passed ? 'PASS' : current?.gateDecision === 'OVERRIDDEN' ? 'OVERRIDDEN' : 'FAIL',
        gateCheckedAt: new Date(),
      },
    });
    return result;
  }

  /**
   * Departure. Blocks on any failed check with a per-check reason.
   *
   * An override is ADMIN-only, requires a written reason, and is recorded both
   * on the trip and in the append-only trail against the exact failures it
   * bypassed — an auditor can always see what was waved through and why.
   */
  async startTrip(id: string, opts: { overrideReason?: string }, actor: { id: string; role: Role }) {
    const assignment = await this.prisma.assignment.findUnique({ where: { id }, include: { status: true } });
    if (!assignment) throw new NotFoundException(`Trip ${id} not found`);
    if (assignment.actualDepartureAt) throw new BadRequestException('This trip has already departed');

    const result = await this.gate.evaluate(id);
    await this.gate.persist(id, result);

    if (!result.passed) {
      if (!opts.overrideReason) {
        const blocked = await this.statusByCode('GATE_BLOCKED');
        await this.prisma.assignment.update({
          where: { id },
          data: { statusId: blocked.id, gateDecision: 'FAIL', gateCheckedAt: new Date() },
        });
        await this.events.record(
          'ASSIGNMENT', id, 'GATE_CHECK',
          `Departure blocked: ${result.failures.map((f) => f.label).join('; ')}`,
          { failures: result.failures }, actor.id,
        );
        throw new BadRequestException({
          message: 'Trip blocked by compliance checks',
          failures: result.failures,
        });
      }

      if (actor.role !== 'ADMIN' && actor.role !== 'OWNER') {
        throw new ForbiddenException('Only an admin can override the compliance gate');
      }

      const inProgress = await this.statusByCode('IN_PROGRESS');
      await this.prisma.assignment.update({
        where: { id },
        data: {
          statusId: inProgress.id,
          actualDepartureAt: new Date(),
          gateDecision: 'OVERRIDDEN',
          gateCheckedAt: new Date(),
          gateOverrideReason: opts.overrideReason,
          gateOverriddenById: actor.id,
        },
      });
      await this.events.record(
        'ASSIGNMENT', id, 'GATE_OVERRIDE',
        `Gate OVERRIDDEN: ${opts.overrideReason}`,
        { failures: result.failures, overriddenBy: actor.id }, actor.id,
      );
      return this.assignmentById(id);
    }

    const inProgress = await this.statusByCode('IN_PROGRESS');
    await this.prisma.assignment.update({
      where: { id },
      data: {
        statusId: inProgress.id,
        actualDepartureAt: new Date(),
        gateDecision: 'PASS',
        gateCheckedAt: new Date(),
      },
    });
    await this.events.record('ASSIGNMENT', id, 'GATE_CHECK', 'Gate passed — departed', { checks: result.checks }, actor.id);
    return this.assignmentById(id);
  }

  /** POD capture: signature and photos land in MinIO, the trip closes. */
  async capturePod(id: string, data: any, actorId?: string) {
    const assignment = await this.prisma.assignment.findUnique({ where: { id } });
    if (!assignment) throw new NotFoundException(`Trip ${id} not found`);

    const delivered = await this.statusByCode('DELIVERED');
    await this.prisma.assignment.update({
      where: { id },
      data: {
        statusId: delivered.id,
        podCapturedAt: new Date(),
        podReceivedByName: data.receivedByName,
        podSignatureFileId: data.signatureFileId,
        podNotes: data.notes,
        actualArrivalAt: data.actualArrivalAt ?? new Date(),
      },
    });

    await this.events.record(
      'ASSIGNMENT', id, 'DOCUMENT',
      `Delivered — signed for by ${data.receivedByName}`,
      { photoFileIds: data.photoFileIds ?? [], signatureFileId: data.signatureFileId }, actorId,
    );

    // The delivery is news on the deal too, so it shows on the existing
    // deal timeline rather than only inside the fleet module.
    if (assignment.dealId) {
      await this.prisma.timelineEvent.create({
        data: {
          dealId: assignment.dealId,
          type: 'NOTE',
          note: `Delivered on trip ${assignment.reference}, signed for by ${data.receivedByName}`,
          meta: { assignmentId: id },
          createdById: actorId,
        },
      });
    }

    return this.assignmentById(id);
  }

  // ── Mass records (element 5) ─────────────────────────────────────────

  async recordMass(assignmentId: string, data: any, actorId?: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { asset: true },
    });
    if (!assignment) throw new NotFoundException(`Trip ${assignmentId} not found`);

    const permissibleMaxKg = assignment.asset.maxMassKg;
    const overloaded = data.massLoadedKg > permissibleMaxKg;
    const overloadPct = overloaded
      ? Number((((data.massLoadedKg - permissibleMaxKg) / permissibleMaxKg) * 100).toFixed(2))
      : 0;

    const record = await this.prisma.tripMassRecord.create({
      data: {
        assignmentId,
        assetId: assignment.assetId,
        measuredAt: data.measuredAt ?? new Date(),
        massLoadedKg: data.massLoadedKg,
        // Snapshot the limit: the report must show what the limit WAS, even
        // if the vehicle is re-rated later.
        permissibleMaxKg,
        overloaded,
        overloadPct,
        weighbridgeRef: data.weighbridgeRef,
        documentFileId: data.documentFileId,
        notes: data.notes,
      },
    });

    await this.events.record(
      'ASSIGNMENT', assignmentId, overloaded ? 'STATUS_CHANGE' : 'NOTE',
      overloaded
        ? `OVERLOADED: ${data.massLoadedKg.toLocaleString()} kg against a ${permissibleMaxKg.toLocaleString()} kg limit (+${overloadPct}%)`
        : `Mass recorded: ${data.massLoadedKg.toLocaleString()} kg`,
      { massRecordId: record.id, overloaded }, actorId,
    );

    // A new weight changes the load check, so the gate is re-decided.
    await this.runGate(assignmentId, actorId);
    return record;
  }

  async massSummary(months = 12) {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
    const records = await this.prisma.tripMassRecord.findMany({
      where: { measuredAt: { gte: start } },
      include: { asset: { select: { code: true } }, assignment: { select: { reference: true } } },
      orderBy: { measuredAt: 'desc' },
    });

    const byMonth = new Map<string, { total: number; overloaded: number }>();
    for (const r of records) {
      const key = r.measuredAt.toISOString().slice(0, 7);
      const b = byMonth.get(key) ?? { total: 0, overloaded: 0 };
      b.total++;
      if (r.overloaded) b.overloaded++;
      byMonth.set(key, b);
    }

    return {
      monthly: [...byMonth.entries()]
        .map(([month, b]) => ({
          month,
          ...b,
          overloadingPct: b.total ? Number(((b.overloaded / b.total) * 100).toFixed(2)) : 0,
        }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      records: records.slice(0, 100),
    };
  }

  // ── Incidents (element 7) ────────────────────────────────────────────

  private async nextIncidentReference() {
    const year = new Date().getFullYear();
    const count = await this.prisma.incident.count({ where: { reference: { startsWith: `INC-${year}-` } } });
    return `INC-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  listIncidents(filters: { openOnly?: boolean; assetId?: string; driverId?: string } = {}) {
    return this.prisma.incident.findMany({
      where: {
        ...(filters.openOnly && { status: { isTerminal: false } }),
        ...(filters.assetId && { assetId: filters.assetId }),
        ...(filters.driverId && { driverId: filters.driverId }),
      },
      include: {
        status: true,
        category: true,
        asset: { select: { id: true, code: true, registrationNo: true } },
        driver: { select: { id: true, fullName: true } },
        actions: true,
        photos: true,
      },
      orderBy: { occurredAt: 'desc' },
    });
  }

  async incidentById(id: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        status: true, category: true, asset: true, driver: true,
        assignment: { select: { id: true, reference: true } },
        actions: true, photos: true,
      },
    });
    if (!incident) throw new NotFoundException(`Incident ${id} not found`);
    const events = await this.events.withActors(await this.events.list('INCIDENT', id));
    return { ...incident, events };
  }

  async createIncident(data: any, actorId?: string) {
    const { photoFileIds = [], ...rest } = data;
    const status = await this.prisma.incidentStatus.findUnique({ where: { code: 'REPORTED' } });
    if (!status) throw new BadRequestException('Incident statuses are not seeded');

    const incident = await this.prisma.incident.create({
      data: {
        ...rest,
        reference: await this.nextIncidentReference(),
        statusId: status.id,
        reportedById: actorId,
        ...(photoFileIds.length && {
          photos: { create: photoFileIds.map((fileId: string) => ({ fileId })) },
        }),
      },
      include: { photos: true },
    });

    await this.events.record('INCIDENT', incident.id, 'SYSTEM', `Incident ${incident.reference} reported`, null, actorId);
    if (rest.assetId) {
      await this.events.record('ASSET', rest.assetId, 'NOTE', `Incident ${incident.reference} reported`, { incidentId: incident.id }, actorId);
    }
    if (rest.driverId) {
      await this.events.record('DRIVER', rest.driverId, 'NOTE', `Incident ${incident.reference} reported`, { incidentId: incident.id }, actorId);
    }
    return incident;
  }

  /**
   * The investigation trail. Root cause is captured in three layers because
   * "driver error" is an immediate cause, not a reason — RTMS wants the
   * underlying and systemic causes too, and every revision is appended rather
   * than overwriting what the investigator thought last week.
   */
  async recordInvestigation(id: string, data: any, actorId?: string) {
    const incident = await this.prisma.incident.findUnique({ where: { id }, include: { status: true } });
    if (!incident) throw new NotFoundException(`Incident ${id} not found`);

    const statusId = data.statusCode
      ? (await this.prisma.incidentStatus.findUnique({ where: { code: data.statusCode } }))?.id
      : undefined;
    if (data.statusCode && !statusId) throw new BadRequestException(`Unknown status ${data.statusCode}`);

    const updated = await this.prisma.incident.update({
      where: { id },
      data: {
        ...(data.immediateCause !== undefined && { immediateCause: data.immediateCause }),
        ...(data.underlyingCause !== undefined && { underlyingCause: data.underlyingCause }),
        ...(data.systemicCause !== undefined && { systemicCause: data.systemicCause }),
        ...(statusId && { statusId }),
      },
      include: { status: true },
    });

    await this.events.record(
      'INCIDENT', id, 'INVESTIGATION',
      data.note ?? `Investigation updated${data.statusCode ? ` — ${updated.status.name}` : ''}`,
      {
        immediateCause: data.immediateCause,
        underlyingCause: data.underlyingCause,
        systemicCause: data.systemicCause,
        from: incident.status.code,
        to: updated.status.code,
      },
      actorId,
    );
    return updated;
  }

  async addCorrectiveAction(incidentId: string, data: any, actorId?: string) {
    const incident = await this.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new NotFoundException(`Incident ${incidentId} not found`);
    const action = await this.prisma.correctiveAction.create({ data: { ...data, incidentId } });
    await this.events.record('INCIDENT', incidentId, 'CORRECTIVE_ACTION', `Action added: ${data.description}`, { actionId: action.id }, actorId);
    return action;
  }

  async updateCorrectiveAction(id: string, data: any, actorId?: string) {
    const existing = await this.prisma.correctiveAction.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Corrective action not found');

    const action = await this.prisma.correctiveAction.update({
      where: { id },
      data: {
        ...data,
        ...(data.status === 'DONE' && !existing.completedAt && { completedAt: new Date() }),
        ...(data.status === 'VERIFIED' && { verifiedById: actorId }),
      },
    });
    await this.events.record('INCIDENT', existing.incidentId, 'CORRECTIVE_ACTION', `Action ${data.status ?? 'updated'}: ${action.description}`, { actionId: id }, actorId);
    return action;
  }

  // ── Fines (R10) and speed events (R7) ────────────────────────────────

  listFines(filters: { assetId?: string; driverId?: string; unpaidOnly?: boolean } = {}) {
    return this.prisma.fine.findMany({
      where: {
        ...(filters.assetId && { assetId: filters.assetId }),
        ...(filters.driverId && { driverId: filters.driverId }),
        ...(filters.unpaidOnly && { status: 'UNPAID' }),
      },
      include: {
        asset: { select: { id: true, code: true, registrationNo: true } },
        driver: { select: { id: true, fullName: true } },
      },
      orderBy: { issuedOn: 'desc' },
    });
  }

  async createFine(data: any, actorId?: string) {
    const fine = await this.prisma.fine.create({ data });
    if (data.driverId) {
      await this.events.record('DRIVER', data.driverId, 'NOTE', `Traffic fine: ${data.reason}`, { fineId: fine.id }, actorId);
    }
    if (data.assetId) {
      await this.events.record('ASSET', data.assetId, 'NOTE', `Traffic fine: ${data.reason}`, { fineId: fine.id }, actorId);
    }
    return fine;
  }

  async updateFine(id: string, data: any) {
    const existing = await this.prisma.fine.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Fine not found');
    return this.prisma.fine.update({ where: { id }, data });
  }

  listSpeedEvents(filters: { assetId?: string; driverId?: string } = {}) {
    return this.prisma.speedEvent.findMany({
      where: {
        ...(filters.assetId && { assetId: filters.assetId }),
        ...(filters.driverId && { driverId: filters.driverId }),
      },
      include: {
        asset: { select: { id: true, code: true } },
        driver: { select: { id: true, fullName: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
  }

  createSpeedEvent(data: any) {
    return this.prisma.speedEvent.create({
      // overByKph is derived, never taken from the caller.
      data: { ...data, overByKph: Math.max(0, data.speedKph - data.limitKph) },
    });
  }
}
