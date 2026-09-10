import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ComplianceStatus, Prisma, RtmsElement } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FleetEventsService } from '../fleet/fleet-events.service';
import { driverName } from '../fleet/naming';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from '../notifications/whatsapp.provider';
import { DAY_MS, Rag, daysUntil, deriveStatus, ragOf, worstOf, worstRag } from './compliance.engine';
import { FatigueService } from './fatigue.service';

export const RTMS_ELEMENTS: { key: RtmsElement; number: number; label: string }[] = [
  { key: 'MANAGEMENT_COMMITMENT', number: 1, label: 'Management commitment' },
  { key: 'RISK_MANAGEMENT',       number: 2, label: 'Risk management' },
  { key: 'VEHICLE_FITNESS',       number: 3, label: 'Vehicle fitness' },
  { key: 'DRIVER_WELLNESS',       number: 4, label: 'Driver wellness' },
  { key: 'LOAD_MANAGEMENT',       number: 5, label: 'Load management' },
  { key: 'JOURNEY_MANAGEMENT',    number: 6, label: 'Journey management' },
  { key: 'INCIDENT_MANAGEMENT',   number: 7, label: 'Incident management' },
  { key: 'MONITORING_REVIEW',     number: 8, label: 'Monitoring and review' },
];

interface Finding {
  label: string;
  count: number;
  rag: Rag;
  link?: string;
}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: FleetEventsService,
    private readonly fatigue: FatigueService,
    private readonly config: ConfigService,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppProvider,
  ) {}

  // ── Items ────────────────────────────────────────────────────────────

  async listItems(filters: {
    ownerType?: 'ASSET' | 'DRIVER';
    assetId?: string;
    driverId?: string;
    kindId?: string;
    status?: ComplianceStatus;
    expiringInDays?: number;
  } = {}) {
    const where: Prisma.ComplianceItemWhereInput = {
      archivedAt: null,
      ...(filters.ownerType && { ownerType: filters.ownerType }),
      ...(filters.assetId && { assetId: filters.assetId }),
      ...(filters.driverId && { driverId: filters.driverId }),
      ...(filters.kindId && { kindId: filters.kindId }),
      ...(filters.status && { status: filters.status }),
      ...(filters.expiringInDays !== undefined && {
        expiresOn: { lte: new Date(Date.now() + filters.expiringInDays * DAY_MS) },
      }),
    };

    const items = await this.prisma.complianceItem.findMany({
      where,
      include: {
        kind: true,
        asset: { select: { id: true, fleetNo: true, registrationNo: true } },
        driver: { select: { id: true, employeeNo: true, surname: true, firstName: true } },
      },
      orderBy: [{ status: 'desc' }, { expiresOn: 'asc' }],
    });

    return items.map((i) => ({ ...i, daysUntilExpiry: daysUntil(i.expiresOn) }));
  }

  async createItem(data: any, actorId?: string) {
    const kind = await this.prisma.complianceKind.findUnique({ where: { id: data.kindId } });
    if (!kind) throw new NotFoundException('Compliance kind not found');

    // status is engine-derived on write too, so a new item is never stale
    // between creation and the next nightly sweep.
    const status = deriveStatus(data.expiresOn, kind.leadDaysDueSoon);
    const item = await this.prisma.complianceItem.create({
      data: {
        ...data,
        ownerType: kind.ownerType,
        status,
        statusComputedAt: new Date(),
      },
      include: { kind: true },
    });

    await this.events.record(
      kind.ownerType === 'ASSET' ? 'ASSET' : 'DRIVER',
      (data.assetId ?? data.driverId) as string,
      'COMPLIANCE_CHANGE',
      `${kind.name} recorded${data.expiresOn ? `, expires ${new Date(data.expiresOn).toISOString().slice(0, 10)}` : ''}`,
      { complianceItemId: item.id, status },
      actorId,
    );
    return item;
  }

  async updateItem(id: string, data: any, actorId?: string) {
    const existing = await this.prisma.complianceItem.findUnique({
      where: { id },
      include: { kind: true },
    });
    if (!existing) throw new NotFoundException(`Compliance item ${id} not found`);

    const expiresOn = data.expiresOn !== undefined ? data.expiresOn : existing.expiresOn;
    const status = deriveStatus(expiresOn, existing.kind.leadDaysDueSoon);

    const item = await this.prisma.complianceItem.update({
      where: { id },
      data: { ...data, status, statusComputedAt: new Date() },
      include: { kind: true },
    });

    await this.events.record(
      existing.ownerType === 'ASSET' ? 'ASSET' : 'DRIVER',
      (existing.assetId ?? existing.driverId) as string,
      'COMPLIANCE_CHANGE',
      `${existing.kind.name} updated`,
      { complianceItemId: id, status },
      actorId,
    );
    return item;
  }

  // Renewal: the old certificate is archived rather than overwritten, so the
  // audit trail keeps every version that was ever relied on.
  async renewItem(id: string, data: { reference?: string; issuedOn?: Date; expiresOn: Date; documentFileId?: string }, actorId?: string) {
    const existing = await this.prisma.complianceItem.findUnique({
      where: { id },
      include: { kind: true },
    });
    if (!existing) throw new NotFoundException(`Compliance item ${id} not found`);

    const [, created] = await this.prisma.$transaction([
      this.prisma.complianceItem.update({ where: { id }, data: { archivedAt: new Date() } }),
      this.prisma.complianceItem.create({
        data: {
          ownerType: existing.ownerType,
          assetId: existing.assetId,
          driverId: existing.driverId,
          kindId: existing.kindId,
          reference: data.reference ?? existing.reference,
          issuedOn: data.issuedOn ?? new Date(),
          expiresOn: data.expiresOn,
          documentFileId: data.documentFileId,
          status: deriveStatus(data.expiresOn, existing.kind.leadDaysDueSoon),
          statusComputedAt: new Date(),
        },
        include: { kind: true },
      }),
    ]);

    await this.events.record(
      existing.ownerType === 'ASSET' ? 'ASSET' : 'DRIVER',
      (existing.assetId ?? existing.driverId) as string,
      'COMPLIANCE_CHANGE',
      `${existing.kind.name} renewed to ${data.expiresOn.toISOString().slice(0, 10)}`,
      { previousItemId: id, complianceItemId: created.id },
      actorId,
    );
    return created;
  }

  // ── The engine: nightly status recompute ─────────────────────────────

  async recomputeStatuses(now: Date = new Date()) {
    const items = await this.prisma.complianceItem.findMany({
      where: { archivedAt: null },
      include: { kind: true },
    });

    const changed: { id: string; from: ComplianceStatus; to: ComplianceStatus; ownerType: string; ownerId: string; kindName: string }[] = [];

    for (const item of items) {
      const next = deriveStatus(item.expiresOn, item.kind.leadDaysDueSoon, now);
      if (next !== item.status) {
        changed.push({
          id: item.id,
          from: item.status,
          to: next,
          ownerType: item.ownerType,
          ownerId: (item.assetId ?? item.driverId) as string,
          kindName: item.kind.name,
        });
      }
    }

    // One statement for the unchanged majority, individual updates only for
    // transitions — a fleet of hundreds still sweeps in a couple of queries.
    await this.prisma.$transaction([
      this.prisma.complianceItem.updateMany({
        where: { id: { in: items.map((i) => i.id) } },
        data: { statusComputedAt: now },
      }),
      ...changed.map((c) =>
        this.prisma.complianceItem.update({ where: { id: c.id }, data: { status: c.to } }),
      ),
    ]);

    for (const c of changed) {
      if (!c.ownerId) continue;
      await this.events.record(
        c.ownerType === 'ASSET' ? 'ASSET' : 'DRIVER',
        c.ownerId,
        'COMPLIANCE_CHANGE',
        `${c.kindName}: ${c.from} → ${c.to}`,
        { complianceItemId: c.id, from: c.from, to: c.to },
      );
    }

    return { checked: items.length, changed: changed.length, transitions: changed };
  }

  // ── Reminders ────────────────────────────────────────────────────────
  // Every reminder becomes a Notification row, the same table every outbound
  // message already goes through. Driver items with a phone number go out on
  // WhatsApp via the existing provider; everything else is an INTERNAL nudge
  // for the office, exactly like the stalled-deal sweep.

  async sendReminders(now: Date = new Date()) {
    const items = await this.prisma.complianceItem.findMany({
      where: { archivedAt: null, status: { in: ['DUE_SOON', 'EXPIRED'] } },
      include: {
        kind: true,
        asset: { select: { fleetNo: true, registrationNo: true } },
        driver: { select: { surname: true, firstName: true, phoneE164: true } },
      },
      orderBy: { expiresOn: 'asc' },
    });

    // One reminder per item per day, however many times the sweep runs.
    const since = new Date(now.getTime() - 20 * 3_600_000);
    let sent = 0;
    let skipped = 0;

    for (const item of items) {
      const already = await this.prisma.notification.findFirst({
        where: { template: 'compliance-expiry', body: { contains: item.id }, createdAt: { gt: since } },
      });
      if (already) { skipped++; continue; }

      const subject = item.asset
        ? `${item.asset.fleetNo} (${item.asset.registrationNo})`
        : item.driver
          ? driverName(item.driver)
          : 'Unknown';
      const days = daysUntil(item.expiresOn, now);
      const when =
        item.status === 'EXPIRED'
          ? `EXPIRED ${days === null ? '' : `${Math.abs(days)} day(s) ago`}`.trim()
          : `expires in ${days} day(s)`;
      const body =
        `⚠️ RTMS compliance — ${item.kind.name} for ${subject} ${when}` +
        `${item.expiresOn ? ` (${item.expiresOn.toISOString().slice(0, 10)})` : ''}.` +
        `${item.kind.requiredForOperation ? ' This blocks new trips.' : ''} [ref:${item.id}]`;

      const toPhone = item.ownerType === 'DRIVER' ? item.driver?.phoneE164 ?? null : null;
      if (toPhone) {
        const result = await this.whatsapp.send(toPhone, body);
        await this.prisma.notification.create({
          data: {
            channel: 'WHATSAPP',
            toPhone,
            template: 'compliance-expiry',
            body,
            status: result.ok ? (result.logged ? 'LOGGED' : 'SENT') : 'FAILED',
            providerMessageId: result.providerMessageId,
            error: result.error,
            sentAt: result.ok && !result.logged ? now : null,
          },
        });
      } else {
        await this.prisma.notification.create({
          data: { channel: 'INTERNAL', template: 'compliance-expiry', body, status: 'LOGGED' },
        });
      }
      sent++;
    }

    return { candidates: items.length, sent, skipped };
  }

  // ── RAG dashboard, one row per RTMS element ──────────────────────────

  async dashboard(now: Date = new Date()) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

    const [
      items, policies, objectives, riskAssessments, routes,
      openWorkOrders, plans, assets, massThisMonth, incidents,
      openActions, unpaidFines, lastReview, tripsAwaitingAck,
    ] = await Promise.all([
      this.prisma.complianceItem.findMany({ where: { archivedAt: null }, include: { kind: true } }),
      this.prisma.policy.findMany({ where: { supersededAt: null } }),
      this.prisma.safetyObjective.findMany({ where: { periodEnd: { gte: now } } }),
      this.prisma.riskAssessment.findMany({ where: { active: true } }),
      this.prisma.routeRiskAssessment.findMany({ where: { active: true } }),
      this.prisma.workOrder.findMany({ where: { status: { isTerminal: false } }, include: { status: true } }),
      this.prisma.maintenancePlan.findMany({ where: { active: true }, include: { asset: true } }),
      this.prisma.asset.count({ where: { active: true } }),
      this.prisma.tripMassRecord.findMany({ where: { date: { gte: monthStart } } }),
      this.prisma.incident.findMany({ where: { status: { isTerminal: false } } }),
      this.prisma.correctiveAction.findMany({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      // R10 has no payment column; the dashboard counts fines with no
      // corrective action recorded, which is the RTMS-relevant gap.
      this.prisma.fine.count({ where: { correctiveActionsTaken: null } }),
      this.prisma.managementReview.findFirst({ orderBy: { periodMonth: 'desc' } }),
      this.prisma.assignment.findMany({
        where: { routeRiskAssessmentId: { not: null }, status: { isTerminal: false } },
        include: { route: true },
      }),
    ]);

    const fatigueBreaches = await this.fatigue.breachingDrivers(now);

    // "Exists" and "done" are different questions, and several element rules
    // used to answer the first while claiming to answer the second. These are
    // the counts that tell them apart.
    const [activeDriverCount, policyAcks, departedUnweighed] = await Promise.all([
      this.prisma.driver.count({ where: { active: true } }),
      this.prisma.policyAcknowledgement.findMany({ select: { policyId: true, driverId: true } }),
      // A trip that has left with no mass record is an unanswered load
      // question, not a neutral one (see the gate's MASS_LIMIT check).
      this.prisma.assignment.findMany({
        where: { actualDepartureAt: { not: null }, massRecords: { none: {} } },
        select: { id: true },
      }),
    ]);

    // A required document with no record at all is unevidenced, which reads
    // the same as expired to an auditor. Counting only the items that exist
    // would let a vehicle with no Certificate of Fitness score green — and
    // would contradict the asset list, which already scores it red.
    const requiredKinds = await this.prisma.complianceKind.findMany({
      where: { requiredForOperation: true, active: true },
    });
    const [allAssets, allDrivers] = await Promise.all([
      this.prisma.asset.findMany({
        where: { active: true },
        select: { id: true, complianceItems: { where: { archivedAt: null }, select: { kindId: true } } },
      }),
      this.prisma.driver.findMany({
        where: { active: true },
        select: { id: true, complianceItems: { where: { archivedAt: null }, select: { kindId: true } } },
      }),
    ]);
    // How many owner/document pairs are simply not on file, per element.
    const missingByElement = new Map<RtmsElement, number>();
    for (const kind of requiredKinds) {
      if (!kind.rtmsElement) continue;
      const owners = kind.ownerType === 'ASSET' ? allAssets : allDrivers;
      const missing = owners.filter((o) => !o.complianceItems.some((i) => i.kindId === kind.id)).length;
      if (missing) {
        missingByElement.set(kind.rtmsElement, (missingByElement.get(kind.rtmsElement) ?? 0) + missing);
      }
    }

    // R9 is shared, so overdue actions are listed once on the dashboard
    // whatever raised them — an incident, an audit finding or a fine.
    const overdueActionRows = await this.prisma.correctiveAction.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, dueDate: { lt: now } },
      include: {
        incident: { select: { reference: true } },
        fine: { select: { noticeNumber: true, reason: true } },
        auditFinding: { select: { description: true, rtmsElement: true } },
        driver: { select: { surname: true, firstName: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    // Open audit non-conformances score against the element they were
    // raised on, so element 8 is not the only place an audit shows up.
    const openFindings = await this.prisma.auditFinding.findMany({
      where: {
        conformity: { in: ['MINOR_NON_CONFORMANCE', 'MAJOR_NON_CONFORMANCE'] },
        correctiveActions: { some: { status: { in: ['OPEN', 'IN_PROGRESS'] } } },
      },
    });

    const itemsByElement = (el: RtmsElement) => items.filter((i) => i.kind.rtmsElement === el);
    const countsOf = (subset: typeof items) => ({
      total: subset.length,
      VALID: subset.filter((i) => i.status === 'VALID').length,
      DUE_SOON: subset.filter((i) => i.status === 'DUE_SOON').length,
      EXPIRED: subset.filter((i) => i.status === 'EXPIRED').length,
    });

    const elements: Array<{
      element: RtmsElement; number: number; label: string; rag: Rag;
      counts: ReturnType<typeof countsOf>; findings: Finding[];
    }> = [];

    const push = (key: RtmsElement, findings: Finding[], extraRag: Rag[] = []) => {
      const meta = RTMS_ELEMENTS.find((e) => e.key === key)!;
      const subset = itemsByElement(key);
      const counts = countsOf(subset);
      const itemRag = subset.length ? ragOf(worstOf(subset.map((i) => i.status))) : 'GREEN';

      const missing = missingByElement.get(key) ?? 0;
      if (missing) {
        findings = [
          ...findings,
          {
            label: 'Required documents with no record on file',
            count: missing,
            rag: 'RED',
            link: '/compliance?tab=items',
          },
        ];
      }

      // An overdue corrective action colours the element it belongs to, not
      // only the R9 register on element 7. Element 8 cannot be green while an
      // action about monitoring and review is past its date, and the same is
      // true of every other element.
      const elementOverdue = overdueActionRows.filter((a) => a.auditFinding?.rtmsElement === key);
      if (elementOverdue.length) {
        findings = [
          ...findings,
          {
            label: 'Corrective actions overdue for this element',
            count: elementOverdue.length,
            rag: 'RED',
            link: '/audit?tab=actions',
          },
        ];
      }

      // An open audit non-conformance colours the element it was raised on.
      const elementFindings = openFindings.filter((f) => f.rtmsElement === key);
      if (elementFindings.length) {
        const major = elementFindings.some((f) => f.conformity === 'MAJOR_NON_CONFORMANCE');
        findings = [
          ...findings,
          {
            label: `Open audit ${major ? 'major' : 'minor'} non-conformance`,
            count: elementFindings.length,
            rag: major ? 'RED' : 'AMBER',
            link: '/audit',
          },
        ];
      }
      elements.push({
        element: key,
        number: meta.number,
        label: meta.label,
        rag: worstRag([itemRag, ...findings.map((f) => f.rag), ...extraRag]),
        counts,
        findings: findings.filter((f) => f.count > 0 || f.rag !== 'GREEN'),
      });
    };

    // 1 — Management commitment: policies exist AND have been signed for.
    // A policy on the shelf that no driver has acknowledged is a document,
    // not a control, and an auditor treats it as one.
    const ackPairs = new Set(policyAcks.filter((a) => a.driverId).map((a) => `${a.policyId}:${a.driverId}`));
    const ackRequired = policies.length * activeDriverCount;
    const ackMissing = Math.max(0, ackRequired - ackPairs.size);
    push('MANAGEMENT_COMMITMENT', [
      { label: 'Current policies', count: policies.length, rag: policies.length ? 'GREEN' : 'RED', link: '/compliance?tab=policies' },
      {
        label: 'Policy acknowledgements outstanding',
        count: ackMissing,
        // Some drift is normal in a live fleet; a third of the fleet unsigned
        // is a systemic failure to communicate the policies.
        rag: ackRequired === 0 ? 'GREEN' : ackMissing > ackRequired / 3 ? 'RED' : ackMissing ? 'AMBER' : 'GREEN',
        link: '/compliance?tab=policies',
      },
      { label: 'Safety objectives for this period', count: objectives.length, rag: objectives.length ? 'GREEN' : 'AMBER', link: '/compliance?tab=objectives' },
    ]);

    // 2 — Risk management: assessments in date.
    const overdueRisk = riskAssessments.filter((r) => r.reviewDueOn && r.reviewDueOn < now);
    push('RISK_MANAGEMENT', [
      { label: 'Risk assessments on file', count: riskAssessments.length, rag: riskAssessments.length ? 'GREEN' : 'RED', link: '/compliance?tab=risk' },
      { label: 'Assessments past review date', count: overdueRisk.length, rag: overdueRisk.length ? 'AMBER' : 'GREEN', link: '/compliance?tab=risk' },
    ]);

    // 3 — Vehicle fitness: licences/COF plus overdue services and open jobs.
    const overdueServices = plans.filter(
      (p) =>
        (p.nextDueDate && p.nextDueDate < now) ||
        (p.nextDueOdoKm !== null && p.asset.odometerKm >= p.nextDueOdoKm),
    );
    push('VEHICLE_FITNESS', [
      { label: 'Services overdue', count: overdueServices.length, rag: overdueServices.length ? 'RED' : 'GREEN', link: '/maintenance' },
      { label: 'Open work orders', count: openWorkOrders.length, rag: openWorkOrders.length > 0 ? 'AMBER' : 'GREEN', link: '/maintenance' },
      { label: 'Active vehicles', count: assets, rag: 'GREEN', link: '/assets' },
    ]);

    // 4 — Driver wellness: licences/PrDP/medicals plus live fatigue breaches.
    push('DRIVER_WELLNESS', [
      { label: 'Drivers over fatigue limits', count: fatigueBreaches.length, rag: fatigueBreaches.length ? 'RED' : 'GREEN', link: '/drivers' },
    ]);

    // 5 — Load management: this month's overloading rate against target.
    const overloaded = massThisMonth.filter((m) => m.overloaded).length;
    const overloadPct = massThisMonth.length ? (overloaded / massThisMonth.length) * 100 : 0;
    const target = Number(objectives.find((o) => o.metric === 'OVERLOADING_PCT')?.targetValue ?? 1);
    push('LOAD_MANAGEMENT', [
      { label: `Overloaded trips this month (${overloadPct.toFixed(1)}%, target ≤${target}%)`, count: overloaded, rag: overloadPct > target ? 'RED' : overloaded > 0 ? 'AMBER' : 'GREEN', link: '/trips?tab=mass' },
      { label: 'Trips weighed this month', count: massThisMonth.length, rag: 'GREEN', link: '/trips?tab=mass' },
      // Overloading is the most-audited RTMS item; a trip that departed with
      // no mass record is an open question, so it cannot read as green.
      { label: 'Departed trips with no mass record', count: departedUnweighed.length, rag: departedUnweighed.length ? 'AMBER' : 'GREEN', link: '/trips?tab=mass' },
    ]);

    // 6 — Journey management: route assessments and driver acknowledgement.
    const unacknowledged = tripsAwaitingAck.filter((a) => !a.actualDepartureAt).length;
    push('JOURNEY_MANAGEMENT', [
      { label: 'Route risk assessments', count: routes.length, rag: routes.length ? 'GREEN' : 'AMBER', link: '/compliance?tab=routes' },
      { label: 'Planned trips not yet departed', count: unacknowledged, rag: 'GREEN', link: '/trips' },
    ]);

    // 7 — Incident management: open incidents and overdue corrective actions.
    const overdueActions = openActions.filter((a) => a.dueDate && a.dueDate < now);
    push('INCIDENT_MANAGEMENT', [
      { label: 'Open incidents', count: incidents.length, rag: incidents.length ? 'AMBER' : 'GREEN', link: '/incidents' },
      { label: 'Corrective actions overdue (R9)', count: overdueActionRows.length, rag: overdueActionRows.length ? 'RED' : 'GREEN', link: '/audit?tab=actions' },
      { label: 'Unpaid traffic fines', count: unpaidFines, rag: unpaidFines ? 'AMBER' : 'GREEN', link: '/incidents?tab=fines' },
    ]);

    // 8 — Monitoring and review.
    //
    // This element used to go green on the existence of a ManagementReview
    // row, which meant a review nobody had read scored the same as one signed
    // off by management. Generating a report is not reviewing it: R17 exists
    // to be looked at, and the sign-off is the only evidence that happened.
    //
    // Cadence is monthly (R17 is a calendar-month table), so last month's
    // review is the one that must be complete. One month late is a slip;
    // two months late is a lapsed management-review cycle.
    const lastMonthKey = lastMonth.toISOString().slice(0, 7);
    // Cadence is monthly (R17 is a calendar-month table), so last month is the
    // period that must be signed off. The question RED answers is "has the
    // review cycle lapsed?", which is about how many periods have gone
    // unsigned — not about the age of last month, which is one month by
    // construction and made the red branch unreachable twice over.
    const monthIndex = (key: string) => {
      const [y, m] = key.split('-').map(Number);
      return y * 12 + (m - 1);
    };
    const [signedOff, oldestReview] = await Promise.all([
      this.prisma.managementReview.findFirst({
        where: { reviewedAt: { not: null } },
        orderBy: { periodMonth: 'desc' },
      }),
      this.prisma.managementReview.findFirst({ orderBy: { periodMonth: 'asc' } }),
    ]);
    const requiredIdx = monthIndex(lastMonthKey);
    // Periods outstanding: 0 = this period signed off, 1 = one behind, 2+ = the
    // cycle has lapsed. With nothing ever signed off, count from the oldest
    // review on file — a system with one unsigned month has slipped, a system
    // with six has stopped reviewing.
    const periodsBehind = signedOff
      ? requiredIdx - monthIndex(signedOff.periodMonth)
      : oldestReview
        ? requiredIdx - monthIndex(oldestReview.periodMonth) + 1
        : 1;
    const reviewedForPeriod = signedOff?.periodMonth === lastMonthKey;
    const reviewFinding: Finding = reviewedForPeriod
      ? { label: `Management review for ${lastMonthKey} signed off`, count: 1, rag: 'GREEN', link: '/audit?tab=reviews' }
      : {
          label: lastReview?.periodMonth === lastMonthKey
            ? `Management review for ${lastMonthKey} generated but not reviewed`
            : `Management review for ${lastMonthKey} not done`,
          count: 1,
          rag: periodsBehind >= 2 ? 'RED' : 'AMBER',
          link: '/audit?tab=reviews',
        };
    push('MONITORING_REVIEW', [reviewFinding]);

    const totals = countsOf(items);
    return {
      generatedAt: now.toISOString(),
      overall: worstRag(elements.map((e) => e.rag)),
      totals,
      compliancePct: totals.total ? Math.round((totals.VALID / totals.total) * 100) : 100,
      elements: elements.sort((a, b) => a.number - b.number),
      expiringSoon: items
        .filter((i) => i.status !== 'VALID')
        .sort((a, b) => (a.expiresOn?.getTime() ?? 0) - (b.expiresOn?.getTime() ?? 0))
        .slice(0, 20)
        .map((i) => ({
          id: i.id,
          kind: i.kind.name,
          ownerType: i.ownerType,
          ownerId: i.assetId ?? i.driverId,
          status: i.status,
          expiresOn: i.expiresOn,
          daysUntilExpiry: daysUntil(i.expiresOn, now),
          blocksOperation: i.kind.requiredForOperation,
        })),
      fatigueBreaches,
      overdueCorrectiveActions: overdueActionRows.map((a) => ({
        id: a.id,
        description: a.description,
        dueDate: a.dueDate,
        status: a.status,
        source: a.sourceType,
        raisedBy:
          a.incident?.reference ??
          a.fine?.noticeNumber ??
          a.auditFinding?.description?.slice(0, 60) ??
          (a.driver ? driverName(a.driver) : null),
        daysOverdue: a.dueDate ? Math.floor((now.getTime() - a.dueDate.getTime()) / DAY_MS) : null,
      })),
    };
  }
}
