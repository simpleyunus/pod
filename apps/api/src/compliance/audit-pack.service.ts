import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RtmsElement } from '@prisma/client';
import { FleetFilesService } from '../fleet/fleet-files.service';
import { driverName } from '../fleet/naming';
import { PdfService } from '../pdf/pdf.service';
import {
  Column, REPORT_CSS, escapeHtml, fmtDate, fmtNum, fmtTonnes, footerHtml,
  ragPill, reportPage, statusPill, table,
} from '../pdf/report-layout';
import { PrismaService } from '../prisma/prisma.service';
import { ComplianceService } from './compliance.service';
import { MonthlyReviewService } from './monthly-review.service';

export interface Period { start: Date; end: Date }

interface ReportDef {
  code: string;
  title: string;
  element: RtmsElement;
  build: (p: Period) => Promise<string>;
}

const ORG = 'POD LOGISTICS (PTY) LTD';

/**
 * The RTMS register set as PDFs.
 *
 * Every table below reproduces its source document's columns, in the
 * document's order and with the document's own wording — including quirks
 * like R12's "Tyre fitted e.g., Goodyear 385". An auditor holding POD's
 * paper toolkit should be able to lay these pages beside it and match them
 * row for row; that is the whole point of the export, so column headings are
 * never "improved" here.
 *
 * Blank cells print blank rather than as a dash, because that is how the
 * blank rows on POD's forms read.
 */
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

  private reports(): ReportDef[] {
    return [
      // ── R1 Fleet List ────────────────────────────────────────────────
      {
        code: 'R1', title: 'Fleet List', element: 'VEHICLE_FITNESS',
        build: async () => {
          const assets = await this.prisma.asset.findMany({
            where: { active: true }, include: { type: true }, orderBy: { fleetNo: 'asc' },
          });
          const cols: Column<(typeof assets)[number]>[] = [
            { header: 'No', value: (a) => a.fleetNo },
            { header: 'Year Model', value: (a) => String(a.yearModel ?? '') },
            { header: 'Make/Manufacturer', value: (a) => a.makeManufacturer ?? '' },
            { header: 'Vehicle Registration Number', value: (a) => a.registrationNo },
            { header: 'Vehicle Identification Number (VIN)', value: (a) => a.vin ?? '' },
            { header: 'Vehicle Type (e.g., truck, trailer, crane etc.)', value: (a) => a.type.name.toUpperCase() },
            { header: 'Maximum Loading Mass', value: (a) => fmtTonnes(a.maxLoadingMassKg) },
            // R1 records "N/A" where a unit carries no passengers.
            { header: 'Maximum Number of Passengers', value: (a) => (a.maxPassengers === null ? 'N/A' : String(a.maxPassengers)) },
            { header: 'Comments', value: (a) => a.comments ?? '' },
          ];
          return table(assets, cols, 'No vehicles on the fleet list.');
        },
      },

      // ── R2 Licence Schedule ──────────────────────────────────────────
      {
        code: 'R2', title: 'Licence Schedule', element: 'VEHICLE_FITNESS',
        build: async () => {
          const assets = await this.prisma.asset.findMany({
            where: { active: true },
            include: {
              complianceItems: { where: { archivedAt: null }, include: { kind: true } },
            },
            orderBy: { fleetNo: 'asc' },
          });
          const expiryOf = (a: (typeof assets)[number], code: string) =>
            a.complianceItems.find((i) => i.kind.code === code)?.expiresOn ?? null;
          const cols: Column<(typeof assets)[number]>[] = [
            { header: 'No', value: (a) => a.fleetNo },
            { header: 'Year Model', value: (a) => String(a.yearModel ?? '') },
            { header: 'Make/Manufacturer', value: (a) => a.makeManufacturer ?? '' },
            { header: 'Vehicle Registration Number', value: (a) => a.registrationNo },
            { header: 'License Expiry Date', value: (a) => fmtDate(expiryOf(a, 'VEHICLE_LICENCE')) },
            { header: 'Permit Expiry Date', value: (a) => fmtDate(expiryOf(a, 'PERMIT')) },
            { header: 'Comments', value: (a) => a.comments ?? '' },
          ];
          return table(assets, cols, 'No vehicles on the licence schedule.');
        },
      },

      // ── R3 Trip Mass Record ──────────────────────────────────────────
      {
        code: 'R3', title: 'Trip Mass Record', element: 'LOAD_MANAGEMENT',
        build: async (p) => {
          const rows = await this.prisma.tripMassRecord.findMany({
            where: { date: this.range(p) },
            include: { asset: true },
            orderBy: { date: 'asc' },
          });
          const cols: Column<(typeof rows)[number]>[] = [
            { header: 'Date', value: (r) => fmtDate(r.date) },
            { header: 'Vehicle Reg No', value: (r) => r.asset.registrationNo },
            // R3 has one column for either measure.
            {
              header: 'Mass Loaded/Passengers Loaded',
              value: (r) =>
                r.massLoadedKg !== null
                  ? fmtTonnes(r.massLoadedKg)
                  : r.passengersLoaded !== null
                    ? `${r.passengersLoaded} PASSENGERS`
                    : '',
            },
            { header: 'Overloaded (Yes/No)', value: (r) => (r.overloaded ? 'YES' : 'NO') },
          ];
          return table(rows, cols, 'No trips recorded in this period.');
        },
      },

      // ── R4 Monthly Overloading Report ────────────────────────────────
      {
        code: 'R4', title: 'Monthly Overloading Report', element: 'LOAD_MANAGEMENT',
        build: async (p) => {
          const rows = await this.prisma.tripMassRecord.findMany({
            where: { date: this.range(p) }, orderBy: { date: 'asc' },
          });
          const byMonth = new Map<number, { total: number; over: number }>();
          for (const r of rows) {
            const k = r.date.getUTCMonth();
            const b = byMonth.get(k) ?? { total: 0, over: 0 };
            b.total++;
            if (r.overloaded) b.over++;
            byMonth.set(k, b);
          }
          // R4 prints all twelve months, blank where nothing ran.
          const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
          const data = MONTHS.map((name, i) => {
            const b = byMonth.get(i);
            return {
              month: name,
              total: b ? String(b.total) : '',
              over: b ? String(b.over) : '',
              pct: b && b.total ? `${((b.over / b.total) * 100).toFixed(1)}%` : '',
            };
          });
          const cols: Column<(typeof data)[number]>[] = [
            { header: 'Month', value: (r) => r.month },
            { header: 'Total number of trips', value: (r) => r.total, numeric: true },
            { header: 'Number of trips overloaded', value: (r) => r.over, numeric: true },
            { header: 'Overloading %', value: (r) => r.pct, numeric: true },
          ];
          return table(data, cols);
        },
      },

      // ── R5 Risk Assessment ───────────────────────────────────────────
      {
        code: 'R5', title: 'Risk Assessment', element: 'RISK_MANAGEMENT',
        build: async () => {
          const hazards = await this.prisma.hazard.findMany({
            where: { riskAssessment: { active: true } },
            orderBy: [{ riskAssessmentId: 'asc' }, { sortOrder: 'asc' }],
          });
          const cols: Column<(typeof hazards)[number]>[] = [
            { header: 'Hazards identified', value: (h) => h.hazardIdentified },
            { header: 'Impact', value: (h) => h.impact },
            { header: 'Existing controls', value: (h) => h.existingControls ?? '' },
          ];
          return table(hazards, cols, 'No hazards recorded.');
        },
      },

      // ── R6 Route Risk Assessment (a briefing sheet, not a table) ─────
      {
        code: 'R6', title: 'Route Risk Assessment', element: 'JOURNEY_MANAGEMENT',
        build: async () => {
          const routes = await this.prisma.routeRiskAssessment.findMany({
            where: { active: true },
            include: { acknowledgements: { include: { driver: true } } },
            orderBy: { name: 'asc' },
          });
          if (!routes.length) return '<p class="empty">No route risk assessments on file.</p>';
          const section = (heading: string, body?: string | null) =>
            body ? `<p><strong>${escapeHtml(heading)}</strong><br>${escapeHtml(body)}</p>` : '';
          return routes
            .map((r) => {
              const current = r.acknowledgements.filter((a) => a.version === r.version);
              return `<h3>${escapeHtml(r.name)} <span style="font-weight:400;color:#98A0AC">v${r.version}</span></h3>
                ${section('ROUTE HAZARDS:', r.routeHazards)}
                ${section('SITE ENTRY INSTRUCTIONS:', r.siteEntryInstructions)}
                ${section('SITE HAZARDS:', r.siteHazards)}
                ${section('SITE EXIT INSTRUCTIONS:', r.siteExitInstructions)}
                ${section('RETURN JOURNEY:', r.returnJourney)}
                ${section('SPECIAL INSTRUCTIONS:', r.specialInstructions)}
                ${section('EMERGENCY CONTACT NUMBERS;', r.emergencyContacts)}
                <p class="note">Acknowledged by (current version): ${
                  current.length ? escapeHtml(current.map((a) => driverName(a.driver)).join(', ')) : 'none'
                }</p>`;
            })
            .join('<div class="page-break"></div>');
        },
      },

      // ── R7 Speed Trend Analysis Report ───────────────────────────────
      {
        code: 'R7', title: 'Speed Trend Analysis Report', element: 'JOURNEY_MANAGEMENT',
        build: async (p) => {
          const rows = await this.prisma.speedTrend.findMany({
            where: { date: this.range(p) },
            include: { asset: true, driver: true },
            orderBy: { date: 'asc' },
          });
          const cols: Column<(typeof rows)[number]>[] = [
            { header: 'DATE', value: (r) => fmtDate(r.date) },
            { header: 'DRIVER', value: (r) => (r.driver ? driverName(r.driver) : '') },
            { header: 'VEHICLE REG', value: (r) => r.asset.registrationNo },
            { header: 'DESCRIBE SPEED TREND', value: (r) => r.speedTrend },
            { header: 'ACTIONS TAKEN', value: (r) => r.actionsTaken ?? '' },
          ];
          return table(rows, cols, 'No speed trends recorded in this period.');
        },
      },

      // ── R8 Accident Investigation Register ───────────────────────────
      {
        code: 'R8', title: 'Accident Investigation Register', element: 'INCIDENT_MANAGEMENT',
        build: async (p) => {
          const rows = await this.prisma.incident.findMany({
            where: { date: this.range(p) },
            include: { asset: true, driver: true },
            orderBy: { date: 'asc' },
          });
          const cols: Column<(typeof rows)[number]>[] = [
            { header: 'No.', value: (_r, i) => String(i + 1) },
            { header: 'Date', value: (r) => fmtDate(r.date) },
            { header: 'Vehicle Reg. No.', value: (r) => r.asset?.registrationNo ?? '' },
            { header: 'Driver Name', value: (r) => (r.driver ? driverName(r.driver) : '') },
            { header: 'Description of Incident/Accident', value: (r) => r.description },
            // P3 derives a root cause; the register column shows it.
            { header: 'Cause of the incident/accident', value: (r) => r.systemicCause ?? r.underlyingCause ?? r.cause ?? '' },
          ];
          return table(rows, cols, 'No incidents recorded in this period.');
        },
      },

      // ── R9 Corrective Action Register ────────────────────────────────
      // Referenced by the manual (4.7) but absent from the toolkit folder,
      // so the columns follow the manual's description of its use.
      {
        code: 'R9', title: 'Corrective Action Register', element: 'INCIDENT_MANAGEMENT',
        build: async (p) => {
          const rows = await this.prisma.correctiveAction.findMany({
            where: { createdAt: this.range(p) },
            include: { incident: true, fine: true, driver: true, auditFinding: true },
            orderBy: { createdAt: 'asc' },
          });
          const cols: Column<(typeof rows)[number]>[] = [
            { header: 'No.', value: (_r, i) => String(i + 1) },
            { header: 'Date raised', value: (r) => fmtDate(r.createdAt) },
            { header: 'Source', value: (r) => r.sourceType.replace(/_/g, ' ') },
            {
              header: 'Reference',
              value: (r) =>
                r.incident?.reference ??
                r.fine?.noticeNumber ??
                (r.driver ? driverName(r.driver) : '') ??
                '',
            },
            { header: 'Corrective action', value: (r) => r.description },
            { header: 'Due date', value: (r) => fmtDate(r.dueDate) },
            { header: 'Status', value: (r) => r.status.replace(/_/g, ' ') },
          ];
          return table(rows, cols, 'No corrective actions raised in this period.');
        },
      },

      // ── R10 Traffic Fine Register ────────────────────────────────────
      {
        code: 'R10', title: 'Traffic Fine Register', element: 'INCIDENT_MANAGEMENT',
        build: async (p) => {
          const rows = await this.prisma.fine.findMany({
            where: { date: this.range(p) },
            include: { asset: true, driver: true },
            orderBy: { date: 'asc' },
          });
          const cols: Column<(typeof rows)[number]>[] = [
            { header: 'No.', value: (_r, i) => String(i + 1) },
            { header: 'Date', value: (r) => fmtDate(r.date) },
            { header: 'Vehicle Reg. No.', value: (r) => r.asset?.registrationNo ?? '' },
            { header: 'Driver Name', value: (r) => (r.driver ? driverName(r.driver) : '') },
            { header: 'What is the reason for the traffic fine', value: (r) => r.reason },
            { header: 'Corrective actions taken', value: (r) => r.correctiveActionsTaken ?? '' },
          ];
          return table(rows, cols, 'No traffic fines in this period.');
        },
      },

      // ── R11 Vehicle Maintenance Schedule ─────────────────────────────
      {
        code: 'R11', title: 'Vehicle Maintenance Schedule', element: 'VEHICLE_FITNESS',
        build: async () => {
          const plans = await this.prisma.maintenancePlan.findMany({
            where: { active: true },
            include: { asset: { include: { type: true } } },
            orderBy: { asset: { fleetNo: 'asc' } },
          });
          const cols: Column<(typeof plans)[number]>[] = [
            { header: 'Fleet Nr', value: (p2) => p2.asset.fleetNo },
            { header: 'Vehicle Reg. No.', value: (p2) => p2.asset.registrationNo },
            { header: 'Vehicle Type', value: (p2) => p2.asset.type.name.toUpperCase() },
            { header: 'Service Interval (km)', value: (p2) => (p2.intervalKm ? fmtNum(p2.intervalKm) : ''), numeric: true },
            { header: 'Service Interval (Months)', value: (p2) => (p2.intervalMonths ? String(p2.intervalMonths) : ''), numeric: true },
            { header: 'Date of last service', value: (p2) => fmtDate(p2.lastServiceDate) },
            { header: 'Kilometres at last service', value: (p2) => (p2.lastServiceOdoKm !== null ? fmtNum(p2.lastServiceOdoKm) : ''), numeric: true },
            {
              header: 'Next service due',
              value: (p2) =>
                [p2.nextDueOdoKm !== null ? `${fmtNum(p2.nextDueOdoKm)} km` : null,
                 p2.nextDueDate ? fmtDate(p2.nextDueDate) : null]
                  .filter(Boolean).join(' or '),
            },
          ];
          return table(plans, cols, 'No maintenance schedules configured.');
        },
      },

      // ── R12 Tyre Management Record ───────────────────────────────────
      {
        code: 'R12', title: 'Tyre Management Record', element: 'VEHICLE_FITNESS',
        build: async () => {
          const rows = await this.prisma.tyreRecord.findMany({
            include: { asset: true }, orderBy: [{ assetId: 'asc' }, { date: 'asc' }],
          });
          const cols: Column<(typeof rows)[number]>[] = [
            { header: 'Fleet Nr', value: (t) => t.asset.fleetNo },
            { header: 'Vehicle Reg. No.', value: (t) => t.asset.registrationNo },
            { header: 'Tyre fitted e.g., Goodyear 385', value: (t) => t.tyreFitted },
            { header: 'Reason for fitment', value: (t) => t.reasonForFitment ?? '' },
            { header: 'Tyre position e.g., Left front', value: (t) => t.tyrePosition },
            {
              header: 'Wheel balancing /alignment done?',
              value: (t) => (t.balancingAlignmentDone === null ? '' : t.balancingAlignmentDone ? 'Yes' : 'No'),
            },
            { header: 'Comments', value: (t) => t.comments ?? '' },
          ];
          return table(rows, cols, 'No tyre fitments recorded.');
        },
      },

      // ── R15 Driver medical schedule ──────────────────────────────────
      {
        code: 'R15', title: 'Driver Medical Schedule', element: 'DRIVER_WELLNESS',
        build: async () => {
          const drivers = await this.prisma.driver.findMany({
            where: { active: true },
            include: { complianceItems: { where: { archivedAt: null }, include: { kind: true } } },
            orderBy: [{ surname: 'asc' }, { firstName: 'asc' }],
          });
          const medical = (d: (typeof drivers)[number]) =>
            d.complianceItems.find((i) => i.kind.code === 'MEDICAL');
          const cols: Column<(typeof drivers)[number]>[] = [
            { header: 'Employee No.', value: (d) => d.employeeNo },
            { header: 'Surname', value: (d) => d.surname },
            { header: 'Name', value: (d) => d.firstName },
            // R15's "Last Medical Test Date" is the item's issue date, and
            // "Next Visit Date" is its expiry — one ComplianceItem, two columns.
            { header: 'Last Medical Test Date', value: (d) => fmtDate(medical(d)?.issuedOn) },
            { header: 'Chronic condition', value: (d) => d.chronicCondition ?? '' },
            { header: 'Next Visit Date', value: (d) => fmtDate(medical(d)?.expiresOn) },
          ];
          return table(drivers, cols, 'No drivers on the medical schedule.');
        },
      },

      // ── R16 Drivers Licence Schedule ─────────────────────────────────
      {
        code: 'R16', title: 'Drivers Licence Schedule', element: 'DRIVER_WELLNESS',
        build: async () => {
          const drivers = await this.prisma.driver.findMany({
            where: { active: true },
            include: { complianceItems: { where: { archivedAt: null }, include: { kind: true } } },
            orderBy: [{ surname: 'asc' }, { firstName: 'asc' }],
          });
          const licence = (d: (typeof drivers)[number]) =>
            d.complianceItems.find((i) => i.kind.code === 'DRIVER_LICENCE');
          const cols: Column<(typeof drivers)[number]>[] = [
            { header: '', value: (_d, i) => String(i + 1) },
            { header: 'Surname', value: (d) => d.surname },
            { header: 'Name', value: (d) => d.firstName },
            { header: 'License Number', value: (d) => licence(d)?.reference ?? '' },
            { header: 'License issue date', value: (d) => fmtDate(licence(d)?.issuedOn) },
            { header: 'License Expiry Date', value: (d) => fmtDate(licence(d)?.expiresOn) },
            { header: 'Comments', value: (d) => d.comments ?? '' },
          ];
          return table(drivers, cols, 'No drivers on the licence schedule.');
        },
      },

      // ── R17 Safety Performance Report ────────────────────────────────
      {
        code: 'R17', title: 'Safety Performance Report', element: 'MONITORING_REVIEW',
        build: async (p) => {
          const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const year = p.end.getUTCFullYear();
          const rows: Array<{ month: string; m: any | null }> = [];
          for (let i = 0; i < 12; i++) {
            const key = `${year}-${String(i + 1).padStart(2, '0')}`;
            const monthStart = new Date(Date.UTC(year, i, 1));
            // Only compute months inside the requested period; the rest print
            // blank, exactly as the paper form does.
            const inPeriod = monthStart >= p.start && monthStart <= p.end;
            rows.push({ month: MONTHS[i], m: inPeriod ? await this.reviews.metricsFor(key) : null });
          }
          const cols: Column<(typeof rows)[number]>[] = [
            { header: 'Month', value: (r) => r.month },
            { header: 'Number of accidents/incidents', value: (r) => (r.m ? String(r.m.r17.accidentsIncidents) : ''), numeric: true },
            { header: 'Number of Speed violations', value: (r) => (r.m ? String(r.m.r17.speedViolations) : ''), numeric: true },
            { header: 'Number of traffic fines', value: (r) => (r.m ? String(r.m.r17.trafficFines) : ''), numeric: true },
            { header: 'Number of excessive hours (shift/driving)', value: (r) => (r.m ? String(r.m.r17.excessiveHours) : ''), numeric: true },
            { header: 'Number of service overruns', value: (r) => (r.m ? String(r.m.r17.serviceOverruns) : ''), numeric: true },
            { header: 'Number of overloads', value: (r) => (r.m ? String(r.m.r17.overloads) : ''), numeric: true },
            { header: 'Comments', value: () => '' },
          ];
          return table(rows, cols);
        },
      },
    ];
  }

  // ── Single report, on demand ───────────────────────────────────────────

  async renderOne(code: string, period: Period): Promise<Buffer> {
    const def = this.reports().find((r) => r.code === code.toUpperCase());
    if (!def) throw new NotFoundException(`Unknown report "${code}"`);
    const body = await def.build(period);
    const html = reportPage({
      title: `${def.code} ${def.title}`,
      reportCode: ORG,
      periodLabel: `${fmtDate(period.start)} to ${fmtDate(period.end)}`,
      bodyHtml: body,
    });
    return this.pdf.fromHtml(html, {
      landscape: true,
      footerHtml: footerHtml(`${ORG} — ${def.code} ${def.title}`),
    });
  }

  listReports() {
    return this.reports().map(({ code, title, element }) => ({ code, title, element }));
  }

  // ── The whole pack ─────────────────────────────────────────────────────

  async requestPack(period: Period, actorId?: string) {
    const pack = await this.prisma.auditPack.create({
      data: { periodStart: period.start, periodEnd: period.end, requestedById: actorId, status: 'PENDING' },
    });
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

      parts.push({
        filename: '00_cover.pdf',
        buffer: await this.pdf.fromHtml(this.coverHtml(period, dashboard), {
          footerHtml: footerHtml(`${ORG} — RTMS audit pack`),
        }),
      });

      const defs = this.reports();
      const included: { code: string; title: string; element: string }[] = [];
      for (const [i, def] of defs.entries()) {
        const body = await def.build(period);
        const html = reportPage({
          title: `${def.code} ${def.title}`,
          reportCode: ORG,
          periodLabel: `${fmtDate(period.start)} to ${fmtDate(period.end)}`,
          bodyHtml: body,
        });
        // NN_ prefix: Gotenberg merges in filename order.
        parts.push({
          filename: `${String(i + 1).padStart(2, '0')}_${def.code}.pdf`,
          buffer: await this.pdf.fromHtml(html, {
            landscape: true,
            footerHtml: footerHtml(`${ORG} — ${def.code} ${def.title}`),
          }),
        });
        included.push({ code: def.code, title: def.title, element: def.element });
      }

      const merged = await this.pdf.merge(parts);
      const filename = `RTMS-audit-pack-${fmtDate(period.start).replace(/\//g, '-')}-to-${fmtDate(period.end).replace(/\//g, '-')}.pdf`;
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
        <h1>RTMS Toolkit</h1>
        <div class="sub">${escapeHtml(ORG)}</div>
        <div class="sub">Road Transport Management System &middot; SANS 1395</div>
        <div class="meta">
          Period ${fmtDate(period.start)} to ${fmtDate(period.end)}<br>
          Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC<br>
          Overall position ${dashboard.overall} &middot; ${dashboard.compliancePct}% of compliance items valid
        </div>
      </div>
      <div class="page-break"></div>
      <h2>Position by RTMS element</h2>
      <p class="subtitle">${escapeHtml(ORG)} &middot; ${fmtDate(period.start)} to ${fmtDate(period.end)}</p>
      <table><thead><tr>
        <th class="num">#</th><th>Element</th><th>Status</th>
        <th class="num">Valid</th><th class="num">Due soon</th><th class="num">Expired</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <p class="note">Each element is scored on the worst finding beneath it. The registers that
      follow are the underlying evidence, numbered and laid out as the RTMS toolkit numbers them.</p>
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
