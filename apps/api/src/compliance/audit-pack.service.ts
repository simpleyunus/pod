import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RtmsElement } from '@prisma/client';
import { FleetFilesService } from '../fleet/fleet-files.service';
import { PdfService } from '../pdf/pdf.service';
import {
  Column, escapeHtml, fmtDate, fmtNum, footerHtml, ragPill, reportPage, statusPill, table,
} from '../pdf/report-layout';
import { PrismaService } from '../prisma/prisma.service';
import { REPORT_CSS } from '../pdf/report-layout';
import { ComplianceService } from './compliance.service';
import { MonthlyReviewService } from './monthly-review.service';

export interface Period { start: Date; end: Date }

interface ReportDef {
  code: string; // RTMS report number
  title: string;
  element: RtmsElement;
  build: (p: Period) => Promise<string>; // returns body HTML
}

@Injectable()
export class AuditPackService {
  private readonly logger = new Logger(AuditPackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly files: FleetFilesService,
    private readonly compliance: ComplianceService,
    private readonly reviews: MonthlyReviewService,
  ) {}

  private range(p: Period) {
    return { gte: p.start, lte: p.end };
  }

  // ── The RTMS report set ──────────────────────────────────────────────
  // Numbered as the standard numbers them, so an auditor asking for "R4" gets
  // exactly the page they expect.
  private reports(): ReportDef[] {
    return [
      {
        code: 'R1', title: 'Fleet list', element: 'VEHICLE_FITNESS',
        build: async () => {
          const assets = await this.prisma.asset.findMany({
            where: { active: true }, include: { type: true }, orderBy: { code: 'asc' },
          });
          const cols: Column<(typeof assets)[number]>[] = [
            { header: 'Fleet no', value: (a) => a.code },
            { header: 'Registration', value: (a) => a.registrationNo },
            { header: 'VIN', value: (a) => a.vin ?? '—' },
            { header: 'Type', value: (a) => a.type.name },
            { header: 'Make / model', value: (a) => [a.make, a.model].filter(Boolean).join(' ') || '—' },
            { header: 'Year', value: (a) => String(a.year ?? '—'), numeric: true },
            { header: 'Tare (kg)', value: (a) => fmtNum(a.tareMassKg), numeric: true },
            { header: 'Max mass (kg)', value: (a) => fmtNum(a.maxMassKg), numeric: true },
            { header: 'Odometer (km)', value: (a) => fmtNum(a.odometerKm), numeric: true },
          ];
          return table(assets, cols, 'No vehicles on the fleet register.');
        },
      },
      {
        code: 'R2', title: 'Vehicle licence and permit schedule', element: 'VEHICLE_FITNESS',
        build: async () => {
          const items = await this.prisma.complianceItem.findMany({
            where: { ownerType: 'ASSET', archivedAt: null },
            include: { kind: true, asset: true },
            orderBy: [{ expiresOn: 'asc' }],
          });
          const cols: Column<(typeof items)[number]>[] = [
            { header: 'Fleet no', value: (i) => i.asset?.code ?? '—' },
            { header: 'Registration', value: (i) => i.asset?.registrationNo ?? '—' },
            { header: 'Document', value: (i) => i.kind.name },
            { header: 'Reference', value: (i) => i.reference ?? '—' },
            { header: 'Issued', value: (i) => fmtDate(i.issuedOn) },
            { header: 'Expires', value: (i) => fmtDate(i.expiresOn) },
            { header: 'Status', value: (i) => statusPill(i.status), raw: true },
          ];
          return table(items, cols, 'No vehicle documents recorded.');
        },
      },
      {
        code: 'R3', title: 'Trip mass record', element: 'LOAD_MANAGEMENT',
        build: async (p) => {
          const records = await this.prisma.tripMassRecord.findMany({
            where: { measuredAt: this.range(p) },
            include: { asset: true, assignment: { include: { driver: true } } },
            orderBy: { measuredAt: 'desc' },
          });
          const cols: Column<(typeof records)[number]>[] = [
            { header: 'Date', value: (r) => fmtDate(r.measuredAt) },
            { header: 'Trip', value: (r) => r.assignment.reference },
            { header: 'Vehicle', value: (r) => r.asset.code },
            { header: 'Driver', value: (r) => r.assignment.driver.fullName },
            { header: 'Loaded (kg)', value: (r) => fmtNum(r.massLoadedKg), numeric: true },
            { header: 'Permissible (kg)', value: (r) => fmtNum(r.permissibleMaxKg), numeric: true },
            { header: 'Over (%)', value: (r) => (r.overloadPct === null ? '—' : Number(r.overloadPct).toFixed(1)), numeric: true },
            { header: 'Result', value: (r) => statusPill(r.overloaded ? 'EXPIRED' : 'VALID').replace('EXPIRED', 'OVERLOADED').replace('VALID', 'LEGAL'), raw: true },
            { header: 'Weighbridge', value: (r) => r.weighbridgeRef ?? '—' },
          ];
          return table(records, cols, 'No trips weighed in this period.');
        },
      },
      {
        code: 'R4', title: 'Monthly overloading percentage', element: 'LOAD_MANAGEMENT',
        build: async (p) => {
          const records = await this.prisma.tripMassRecord.findMany({
            where: { measuredAt: this.range(p) }, orderBy: { measuredAt: 'asc' },
          });
          const byMonth = new Map<string, { total: number; over: number; worstPct: number }>();
          for (const r of records) {
            const key = r.measuredAt.toISOString().slice(0, 7);
            const b = byMonth.get(key) ?? { total: 0, over: 0, worstPct: 0 };
            b.total++;
            if (r.overloaded) b.over++;
            b.worstPct = Math.max(b.worstPct, Number(r.overloadPct ?? 0));
            byMonth.set(key, b);
          }
          const rows = [...byMonth.entries()].map(([month, b]) => ({
            month, ...b, pct: b.total ? (b.over / b.total) * 100 : 0,
          }));
          const target = Number(
            (await this.prisma.safetyObjective.findFirst({ where: { metric: 'OVERLOADING_PCT' } }))?.targetValue ?? 1,
          );
          const overall = records.length
            ? (records.filter((r) => r.overloaded).length / records.length) * 100
            : 0;
          const kpis = `<div class="kpis">
            <div class="kpi"><div class="v">${overall.toFixed(2)}%</div><div class="l">Overloading rate</div></div>
            <div class="kpi"><div class="v">${records.length}</div><div class="l">Trips weighed</div></div>
            <div class="kpi"><div class="v">${target}%</div><div class="l">Target maximum</div></div>
          </div>`;
          const cols: Column<(typeof rows)[number]>[] = [
            { header: 'Month', value: (r) => r.month },
            { header: 'Trips weighed', value: (r) => String(r.total), numeric: true },
            { header: 'Overloaded', value: (r) => String(r.over), numeric: true },
            { header: 'Overloading %', value: (r) => r.pct.toFixed(2), numeric: true },
            { header: 'Worst overload %', value: (r) => r.worstPct.toFixed(1), numeric: true },
            { header: 'Against target', value: (r) => ragPill(r.pct > target ? 'RED' : r.over ? 'AMBER' : 'GREEN'), raw: true },
          ];
          return kpis + table(rows, cols, 'No mass records in this period.');
        },
      },
      {
        code: 'R5', title: 'Risk assessment register', element: 'RISK_MANAGEMENT',
        build: async () => {
          const assessments = await this.prisma.riskAssessment.findMany({
            where: { active: true }, include: { hazards: true }, orderBy: { assessedOn: 'desc' },
          });
          if (!assessments.length) return '<p class="empty">No risk assessments on file.</p>';
          return assessments
            .map((a) => {
              const cols: Column<(typeof a.hazards)[number]>[] = [
                { header: 'Hazard', value: (h) => h.description },
                { header: 'L', value: (h) => String(h.likelihood), numeric: true },
                { header: 'S', value: (h) => String(h.severity), numeric: true },
                { header: 'Rating', value: (h) => String(h.riskRating), numeric: true },
                { header: 'Controls', value: (h) => h.controls },
                { header: 'Residual', value: (h) => (h.residualRating === null ? '—' : String(h.residualRating)), numeric: true },
              ];
              return `<h3>${escapeHtml(a.title)} <span style="font-weight:400;color:#98A0AC">v${a.version} &middot; assessed ${fmtDate(a.assessedOn)} &middot; review due ${fmtDate(a.reviewDueOn)}</span></h3>
                ${a.scope ? `<p class="note">${escapeHtml(a.scope)}</p>` : ''}
                ${table(a.hazards, cols, 'No hazards recorded.')}`;
            })
            .join('');
        },
      },
      {
        code: 'R6', title: 'Route risk assessments and driver acknowledgements', element: 'JOURNEY_MANAGEMENT',
        build: async () => {
          const routes = await this.prisma.routeRiskAssessment.findMany({
            where: { active: true },
            include: { acknowledgements: { include: { driver: true } } },
            orderBy: { name: 'asc' },
          });
          const cols: Column<(typeof routes)[number]>[] = [
            { header: 'Route', value: (r) => r.name },
            { header: 'Version', value: (r) => String(r.version), numeric: true },
            { header: 'Distance (km)', value: (r) => fmtNum(r.distanceKm), numeric: true },
            { header: 'Review due', value: (r) => fmtDate(r.reviewDueOn) },
            {
              header: 'Acknowledged by (current version)',
              value: (r) => {
                const current = r.acknowledgements.filter((a) => a.version === r.version);
                return current.length ? current.map((a) => a.driver.fullName).join(', ') : 'None';
              },
            },
          ];
          return table(routes, cols, 'No route risk assessments on file.');
        },
      },
      {
        code: 'R7', title: 'Speed register', element: 'JOURNEY_MANAGEMENT',
        build: async (p) => {
          const events = await this.prisma.speedEvent.findMany({
            where: { occurredAt: this.range(p) },
            include: { asset: true, driver: true },
            orderBy: { occurredAt: 'desc' },
          });
          const cols: Column<(typeof events)[number]>[] = [
            { header: 'Date', value: (e) => fmtDate(e.occurredAt) },
            { header: 'Vehicle', value: (e) => e.asset.code },
            { header: 'Driver', value: (e) => e.driver?.fullName ?? '—' },
            { header: 'Speed (km/h)', value: (e) => String(e.speedKph), numeric: true },
            { header: 'Limit (km/h)', value: (e) => String(e.limitKph), numeric: true },
            { header: 'Over by', value: (e) => String(e.overByKph), numeric: true },
            { header: 'Location', value: (e) => e.locationText ?? '—' },
            { header: 'Action taken', value: (e) => e.actionTaken ?? '—' },
          ];
          return table(events, cols, 'No speeding events recorded in this period.');
        },
      },
      {
        code: 'R8', title: 'Accident and incident register', element: 'INCIDENT_MANAGEMENT',
        build: async (p) => {
          const incidents = await this.prisma.incident.findMany({
            where: { occurredAt: this.range(p) },
            include: { asset: true, driver: true, category: true, status: true, actions: true },
            orderBy: { occurredAt: 'desc' },
          });
          const cols: Column<(typeof incidents)[number]>[] = [
            { header: 'Ref', value: (i) => i.reference },
            { header: 'Date', value: (i) => fmtDate(i.occurredAt) },
            { header: 'Vehicle', value: (i) => i.asset?.code ?? '—' },
            { header: 'Driver', value: (i) => i.driver?.fullName ?? '—' },
            { header: 'Category', value: (i) => i.category?.name ?? '—' },
            { header: 'Location', value: (i) => i.locationText ?? '—' },
            { header: 'Injuries', value: (i) => String(i.injuries), numeric: true },
            { header: 'Immediate cause', value: (i) => i.immediateCause ?? '—' },
            { header: 'Root / systemic cause', value: (i) => i.systemicCause ?? i.underlyingCause ?? '—' },
            { header: 'Actions open', value: (i) => String(i.actions.filter((a) => a.status !== 'VERIFIED' && a.status !== 'DONE').length), numeric: true },
            { header: 'Status', value: (i) => i.status.name },
          ];
          return table(incidents, cols, 'No incidents recorded in this period.');
        },
      },
      {
        code: 'R10', title: 'Traffic fine register', element: 'INCIDENT_MANAGEMENT',
        build: async (p) => {
          const fines = await this.prisma.fine.findMany({
            where: { issuedOn: this.range(p) },
            include: { asset: true, driver: true },
            orderBy: { issuedOn: 'desc' },
          });
          const cols: Column<(typeof fines)[number]>[] = [
            { header: 'Notice no', value: (f) => f.noticeNumber ?? '—' },
            { header: 'Date', value: (f) => fmtDate(f.issuedOn) },
            { header: 'Vehicle', value: (f) => f.asset?.code ?? '—' },
            { header: 'Driver', value: (f) => f.driver?.fullName ?? '—' },
            { header: 'Reason', value: (f) => f.reason },
            { header: 'Amount', value: (f) => `${f.currency} ${fmtNum(Number(f.amount), 2)}`, numeric: true },
            { header: 'Status', value: (f) => f.status },
            { header: 'Corrective action', value: (f) => f.correctiveAction ?? '—' },
          ];
          return table(fines, cols, 'No traffic fines in this period.');
        },
      },
      {
        code: 'R11', title: 'Maintenance record', element: 'VEHICLE_FITNESS',
        build: async (p) => {
          const orders = await this.prisma.workOrder.findMany({
            where: { requestedAt: this.range(p) },
            include: { asset: true, status: true },
            orderBy: { requestedAt: 'desc' },
          });
          const plans = await this.prisma.maintenancePlan.findMany({
            where: { active: true }, include: { asset: true },
          });
          const planCols: Column<(typeof plans)[number]>[] = [
            { header: 'Vehicle', value: (p2) => p2.asset.code },
            { header: 'Plan', value: (p2) => p2.name },
            { header: 'Interval', value: (p2) => [p2.intervalKm ? `${fmtNum(p2.intervalKm)} km` : null, p2.intervalMonths ? `${p2.intervalMonths} months` : null].filter(Boolean).join(' or ') || '—' },
            { header: 'Last service', value: (p2) => fmtDate(p2.lastServiceDate) },
            { header: 'Next due (date)', value: (p2) => fmtDate(p2.nextDueDate) },
            { header: 'Next due (km)', value: (p2) => fmtNum(p2.nextDueOdoKm), numeric: true },
            { header: 'Current km', value: (p2) => fmtNum(p2.asset.odometerKm), numeric: true },
          ];
          const orderCols: Column<(typeof orders)[number]>[] = [
            { header: 'Job no', value: (w) => w.number },
            { header: 'Vehicle', value: (w) => w.asset.code },
            { header: 'Raised', value: (w) => fmtDate(w.requestedAt) },
            { header: 'Description', value: (w) => w.title },
            { header: 'Odometer', value: (w) => fmtNum(w.odometerKm), numeric: true },
            { header: 'Parts', value: (w) => fmtNum(Number(w.partsCost ?? 0), 2), numeric: true },
            { header: 'Labour', value: (w) => fmtNum(Number(w.labourCost ?? 0), 2), numeric: true },
            { header: 'Total', value: (w) => fmtNum(Number(w.partsCost ?? 0) + Number(w.labourCost ?? 0), 2), numeric: true },
            { header: 'Status', value: (w) => w.status.name },
            { header: 'Closed', value: (w) => fmtDate(w.closedAt) },
          ];
          return `<h3>Preventive maintenance schedule</h3>${table(plans, planCols, 'No maintenance plans configured.')}
                  <h3>Work orders in period</h3>${table(orders, orderCols, 'No work orders raised in this period.')}`;
        },
      },
      {
        code: 'R12', title: 'Tyre record', element: 'VEHICLE_FITNESS',
        build: async () => {
          const tyres = await this.prisma.tyreRecord.findMany({
            include: { asset: true }, orderBy: [{ assetId: 'asc' }, { createdAt: 'desc' }],
          });
          const cols: Column<(typeof tyres)[number]>[] = [
            { header: 'Vehicle', value: (t) => t.asset.code },
            { header: 'Position', value: (t) => t.position },
            { header: 'Action', value: (t) => t.action },
            { header: 'Brand / size', value: (t) => [t.brand, t.size].filter(Boolean).join(' ') || '—' },
            { header: 'Serial', value: (t) => t.serialNo ?? '—' },
            { header: 'Tread (mm)', value: (t) => (t.treadDepthMm === null ? '—' : Number(t.treadDepthMm).toFixed(1)), numeric: true },
            { header: 'Fitted', value: (t) => fmtDate(t.fittedOn) },
            { header: 'Fitted km', value: (t) => fmtNum(t.fittedOdoKm), numeric: true },
            { header: 'Removed', value: (t) => fmtDate(t.removedOn) },
            { header: 'Cost', value: (t) => (t.cost === null ? '—' : fmtNum(Number(t.cost), 2)), numeric: true },
          ];
          return table(tyres, cols, 'No tyre records on file.');
        },
      },
      {
        code: 'R15', title: 'Driver medical schedule', element: 'DRIVER_WELLNESS',
        build: async () => this.driverDocSchedule(['MEDICAL']),
      },
      {
        code: 'R16', title: 'Driver licence and PrDP schedule', element: 'DRIVER_WELLNESS',
        build: async () => this.driverDocSchedule(['DRIVER_LICENCE', 'PRDP']),
      },
      {
        code: 'R17', title: 'Monthly safety performance report', element: 'MONITORING_REVIEW',
        build: async (p) => {
          const months: string[] = [];
          const cur = new Date(Date.UTC(p.start.getUTCFullYear(), p.start.getUTCMonth(), 1));
          while (cur <= p.end) {
            months.push(cur.toISOString().slice(0, 7));
            cur.setUTCMonth(cur.getUTCMonth() + 1);
          }
          const rows = [];
          for (const m of months) rows.push(await this.reviews.metricsFor(m));

          const cols: Column<(typeof rows)[number]>[] = [
            { header: 'Month', value: (r) => r.periodMonth },
            { header: 'Trips', value: (r) => String(r.trips.total), numeric: true },
            { header: 'Weighed', value: (r) => String(r.load.tripsWeighed), numeric: true },
            { header: 'Overload %', value: (r) => r.load.overloadingPct.toFixed(2), numeric: true },
            { header: 'Incidents', value: (r) => String(r.incidents.total), numeric: true },
            { header: 'Injuries', value: (r) => String(r.incidents.withInjuries), numeric: true },
            { header: 'Fines', value: (r) => String(r.fines.count), numeric: true },
            { header: 'Speed events', value: (r) => String(r.speed.events), numeric: true },
            { header: 'Inspections', value: (r) => String(r.inspections.performed), numeric: true },
            { header: 'Failed insp.', value: (r) => String(r.inspections.failed), numeric: true },
            { header: 'WOs raised', value: (r) => String(r.maintenance.workOrdersRaised), numeric: true },
            { header: 'Gate blocks', value: (r) => String(r.trips.gateBlocked), numeric: true },
            { header: 'Overrides', value: (r) => String(r.trips.gateOverridden), numeric: true },
          ];

          const objectives = await this.prisma.safetyObjective.findMany({ orderBy: { periodStart: 'desc' } });
          const objCols: Column<(typeof objectives)[number]>[] = [
            { header: 'Objective', value: (o) => o.title },
            { header: 'Metric', value: (o) => o.metric },
            { header: 'Target', value: (o) => `${fmtNum(Number(o.targetValue), 2)} ${o.unit ?? ''}`.trim(), numeric: true },
            { header: 'Actual', value: (o) => (o.actualValue === null ? '—' : fmtNum(Number(o.actualValue), 2)), numeric: true },
            { header: 'Period', value: (o) => `${fmtDate(o.periodStart)} – ${fmtDate(o.periodEnd)}` },
          ];

          return `<h3>Performance by month</h3>${table(rows, cols, 'No data in this period.')}
                  <h3>Safety objectives and targets</h3>${table(objectives, objCols, 'No objectives set.')}
                  <p class="note">Generated from the operational record. Overloading percentage is
                  measured trips exceeding permissible maximum mass divided by all trips weighed.</p>`;
        },
      },
    ];
  }

  private async driverDocSchedule(kindCodes: string[]) {
    const items = await this.prisma.complianceItem.findMany({
      where: { ownerType: 'DRIVER', archivedAt: null, kind: { code: { in: kindCodes } } },
      include: { kind: true, driver: true },
      orderBy: { expiresOn: 'asc' },
    });
    const cols: Column<(typeof items)[number]>[] = [
      { header: 'Driver no', value: (i) => i.driver?.code ?? '—' },
      { header: 'Driver', value: (i) => i.driver?.fullName ?? '—' },
      { header: 'Document', value: (i) => i.kind.name },
      { header: 'Reference', value: (i) => i.reference ?? '—' },
      { header: 'Issued', value: (i) => fmtDate(i.issuedOn) },
      { header: 'Expires', value: (i) => fmtDate(i.expiresOn) },
      { header: 'Status', value: (i) => statusPill(i.status), raw: true },
    ];
    return table(items, cols, 'No matching driver documents recorded.');
  }

  // ── Single report, on demand ─────────────────────────────────────────

  async renderOne(code: string, period: Period): Promise<Buffer> {
    const def = this.reports().find((r) => r.code === code);
    if (!def) throw new NotFoundException(`Unknown report "${code}"`);
    const body = await def.build(period);
    const html = reportPage({
      title: def.title,
      reportCode: `RTMS ${def.code}`,
      periodLabel: `${fmtDate(period.start)} to ${fmtDate(period.end)}`,
      bodyHtml: body,
    });
    return this.pdf.fromHtml(html, {
      landscape: true,
      footerHtml: footerHtml(`POD — RTMS ${def.code}: ${def.title}`),
    });
  }

  listReports() {
    return this.reports().map(({ code, title, element }) => ({ code, title, element }));
  }

  // ── The whole pack ───────────────────────────────────────────────────

  async requestPack(period: Period, actorId?: string) {
    const pack = await this.prisma.auditPack.create({
      data: { periodStart: period.start, periodEnd: period.end, requestedById: actorId, status: 'PENDING' },
    });
    // Built inline: a pack is a handful of queries and one Gotenberg round
    // trip per report, and the caller polls for READY.
    this.build(pack.id).catch((e) => this.logger.error(`audit pack ${pack.id} failed: ${e.message}`));
    return pack;
  }

  async build(packId: string) {
    const pack = await this.prisma.auditPack.findUnique({ where: { id: packId } });
    if (!pack) throw new NotFoundException('Audit pack not found');
    await this.prisma.auditPack.update({ where: { id: packId }, data: { status: 'BUILDING' } });

    const period = { start: pack.periodStart, end: pack.periodEnd };
    try {
      const dashboard = await this.compliance.dashboard();
      const parts: { filename: string; buffer: Buffer }[] = [];

      // 00 — cover + RAG summary, so the pack opens on the headline position.
      parts.push({
        filename: '00_cover.pdf',
        buffer: await this.pdf.fromHtml(this.coverHtml(period, dashboard), {
          footerHtml: footerHtml('POD — RTMS audit pack'),
        }),
      });

      const defs = this.reports();
      const included: { code: string; title: string; element: string }[] = [];
      for (const [i, def] of defs.entries()) {
        const body = await def.build(period);
        const html = reportPage({
          title: def.title,
          reportCode: `RTMS ${def.code}`,
          periodLabel: `${fmtDate(period.start)} to ${fmtDate(period.end)}`,
          bodyHtml: body,
        });
        // NN_ prefix: Gotenberg merges in filename order.
        parts.push({
          filename: `${String(i + 1).padStart(2, '0')}_${def.code}.pdf`,
          buffer: await this.pdf.fromHtml(html, {
            landscape: true,
            footerHtml: footerHtml(`POD — RTMS ${def.code}: ${def.title}`),
          }),
        });
        included.push({ code: def.code, title: def.title, element: def.element });
      }

      const merged = await this.pdf.merge(parts);
      const filename = `RTMS-audit-pack-${fmtDate(period.start)}-to-${fmtDate(period.end)}.pdf`;
      const file = await this.files.storeGenerated(merged, 'REPORT_PDF', filename, 'application/pdf', pack.requestedById ?? undefined);

      return this.prisma.auditPack.update({
        where: { id: packId },
        data: { status: 'READY', fileId: file.id, reports: included as any, completedAt: new Date() },
      });
    } catch (e: any) {
      await this.prisma.auditPack.update({
        where: { id: packId },
        data: { status: 'FAILED', error: e.message?.slice(0, 500) ?? 'Unknown error' },
      });
      throw e;
    }
  }

  private coverHtml(period: Period, dashboard: any) {
    const rows = dashboard.elements
      .map(
        (e: any) =>
          `<tr><td class="num">${e.number}</td><td>${escapeHtml(e.label)}</td>
           <td>${ragPill(e.rag)}</td>
           <td class="num">${e.counts.VALID}</td><td class="num">${e.counts.DUE_SOON}</td>
           <td class="num">${e.counts.EXPIRED}</td></tr>`,
      )
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><style>${REPORT_CSS}</style></head><body>
      <div class="cover">
        <h1>RTMS audit pack</h1>
        <div class="sub">POD — Road Transport Management System</div>
        <div class="sub">SANS 1395 &middot; eight elements</div>
        <div class="meta">
          Period ${fmtDate(period.start)} to ${fmtDate(period.end)}<br>
          Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC<br>
          Overall position ${dashboard.overall} &middot; ${dashboard.compliancePct}% of compliance items valid
        </div>
      </div>
      <div class="page-break"></div>
      <h2>Position by RTMS element</h2>
      <p class="subtitle">Summary &middot; ${fmtDate(period.start)} to ${fmtDate(period.end)}</p>
      <table><thead><tr>
        <th class="num">#</th><th>Element</th><th>Status</th>
        <th class="num">Valid</th><th class="num">Due soon</th><th class="num">Expired</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <p class="note">Each element is scored on the worst finding beneath it: any expired document
      that blocks operation makes the element red. The reports that follow are the underlying
      evidence, numbered as the standard numbers them.</p>
    </body></html>`;
  }

  listPacks() {
    return this.prisma.auditPack.findMany({ orderBy: { requestedAt: 'desc' }, take: 20 });
  }

  async packById(id: string) {
    const pack = await this.prisma.auditPack.findUnique({ where: { id } });
    if (!pack) throw new NotFoundException('Audit pack not found');
    const file = pack.fileId ? await this.files.getUrl(pack.fileId) : null;
    return { ...pack, file };
  }
}
