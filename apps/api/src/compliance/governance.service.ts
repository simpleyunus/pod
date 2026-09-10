import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MonthlyReviewService } from './monthly-review.service';

// RTMS elements 1 and 2 plus the element-8 review record: policies,
// objectives, risk assessments, routes and their acknowledgements.
@Injectable()
export class GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monthlyReview: MonthlyReviewService,
  ) {}

  // ── Policies (element 1) ─────────────────────────────────────────────
  // Versioned by supersession: publishing never mutates the text staff have
  // already acknowledged, it supersedes it and starts version n+1.

  listPolicies(includeSuperseded = false) {
    return this.prisma.policy.findMany({
      where: includeSuperseded ? {} : { supersededAt: null },
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
      include: { _count: { select: { acknowledgements: true } } },
    });
  }

  async publishPolicy(data: any, actorId?: string) {
    const current = await this.prisma.policy.findFirst({
      where: { code: data.code },
      orderBy: { version: 'desc' },
    });
    const version = (current?.version ?? 0) + 1;

    return this.prisma.$transaction(async (tx) => {
      if (current && !current.supersededAt) {
        await tx.policy.update({ where: { id: current.id }, data: { supersededAt: new Date() } });
      }
      return tx.policy.create({
        data: {
          ...data,
          version,
          effectiveFrom: data.effectiveFrom ?? new Date(),
          approvedById: actorId,
        },
      });
    });
  }

  async acknowledgePolicy(policyId: string, data: { driverId?: string | null; userId?: string | null; signatureFileId?: string | null }) {
    const policy = await this.prisma.policy.findUnique({ where: { id: policyId } });
    if (!policy) throw new NotFoundException('Policy not found');
    if (!data.driverId && !data.userId) {
      throw new BadRequestException('Either driverId or userId must be supplied');
    }
    return this.prisma.policyAcknowledgement.create({ data: { policyId, ...data } });
  }

  // ── Safety objectives (element 1) ────────────────────────────────────

  listObjectives() {
    return this.prisma.safetyObjective.findMany({ orderBy: { periodStart: 'desc' } });
  }

  createObjective(data: any) {
    return this.prisma.safetyObjective.create({ data });
  }

  // ── Risk assessments (element 2) ─────────────────────────────────────

  listRiskAssessments() {
    return this.prisma.riskAssessment.findMany({
      where: { active: true },
      orderBy: { assessedOn: 'desc' },
      include: { hazards: true },
    });
  }

  async createRiskAssessment(data: any, actorId?: string) {
    const { hazards = [], ...rest } = data;
    return this.prisma.riskAssessment.create({
      data: {
        ...rest,
        assessedById: actorId,
        hazards: {
          create: hazards.map((h: any) => ({
            ...h,
            // Rating is derived, never trusted from the client.
            riskRating: h.likelihood * h.severity,
            residualRating:
              h.residualLikelihood && h.residualSeverity
                ? h.residualLikelihood * h.residualSeverity
                : null,
          })),
        },
      },
      include: { hazards: true },
    });
  }

  // ── Route risk assessments (elements 2 + 6) ──────────────────────────

  listRoutes() {
    return this.prisma.routeRiskAssessment.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      include: {
        // R6 is a standalone briefing sheet in the toolkit, not a child of R5.
        acknowledgements: {
          include: { driver: { select: { id: true, surname: true, firstName: true } } },
          orderBy: { acknowledgedAt: 'desc' },
        },
      },
    });
  }

  createRoute(data: any) {
    return this.prisma.routeRiskAssessment.create({ data });
  }

  // Bumping the version deliberately invalidates every prior acknowledgement:
  // the gate compares the ack's version to the route's current one, so a
  // changed route forces every driver to re-acknowledge before departing.
  async reviseRoute(id: string, data: any) {
    const route = await this.prisma.routeRiskAssessment.findUnique({ where: { id } });
    if (!route) throw new NotFoundException('Route not found');
    return this.prisma.routeRiskAssessment.update({
      where: { id },
      data: { ...data, version: route.version + 1 },
    });
  }

  async acknowledgeRoute(routeId: string, driverId: string, signatureFileId?: string | null) {
    const route = await this.prisma.routeRiskAssessment.findUnique({ where: { id: routeId } });
    if (!route) throw new NotFoundException('Route not found');
    return this.prisma.routeAcknowledgement.upsert({
      where: {
        routeRiskAssessmentId_driverId_version: {
          routeRiskAssessmentId: routeId,
          driverId,
          version: route.version,
        },
      },
      update: { acknowledgedAt: new Date(), signatureFileId },
      create: {
        routeRiskAssessmentId: routeId,
        driverId,
        version: route.version,
        signatureFileId,
      },
    });
  }

  // ── Training (manual 4.14, module M1) ────────────────────────────────
  // A completed course with a refresher interval materialises a TRAINING_DUE
  // ComplianceItem, so refresher expiry runs through the same engine, the
  // same reminders and the same RAG as a licence.

  listCourses() {
    return this.prisma.trainingCourse.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { records: true } } },
    });
  }

  listTrainingRecords(driverId?: string) {
    return this.prisma.trainingRecord.findMany({
      where: driverId ? { driverId } : {},
      include: {
        course: true,
        driver: { select: { id: true, employeeNo: true, surname: true, firstName: true } },
      },
      orderBy: { completedOn: 'desc' },
    });
  }

  async recordTraining(data: {
    courseId: string;
    driverId: string;
    completedOn: Date;
    trainerName?: string | null;
    outcome?: string | null;
    certificateFileId?: string | null;
    notes?: string | null;
  }) {
    const course = await this.prisma.trainingCourse.findUnique({ where: { id: data.courseId } });
    if (!course) throw new NotFoundException('Training course not found');

    const expiresOn = course.refresherMonths
      ? new Date(new Date(data.completedOn).setMonth(data.completedOn.getMonth() + course.refresherMonths))
      : null;

    const record = await this.prisma.trainingRecord.create({ data: { ...data, expiresOn } });

    // Mirror into the compliance engine so the refresher shows up beside
    // licences and medicals rather than in a corner of its own.
    const kind = await this.prisma.complianceKind.findUnique({ where: { code: 'TRAINING_DUE' } });
    if (kind && expiresOn) {
      const existing = await this.prisma.complianceItem.findFirst({
        where: { driverId: data.driverId, kindId: kind.id, archivedAt: null },
      });
      const payload = { reference: course.code, issuedOn: data.completedOn, expiresOn };
      if (existing) {
        await this.prisma.complianceItem.update({ where: { id: existing.id }, data: payload });
      } else {
        await this.prisma.complianceItem.create({
          data: { ownerType: 'DRIVER', driverId: data.driverId, kindId: kind.id, ...payload },
        });
      }
    }
    return record;
  }

  // ── Internal audit (element 8) ───────────────────────────────────────

  listAudits() {
    return this.prisma.audit.findMany({
      orderBy: { scheduledFor: 'desc' },
      include: { findings: { include: { correctiveActions: true } } },
    });
  }

  private async nextAuditReference() {
    const year = new Date().getFullYear();
    const count = await this.prisma.audit.count({ where: { reference: { startsWith: `AUD-${year}-` } } });
    return `AUD-${year}-${String(count + 1).padStart(2, '0')}`;
  }

  async createAudit(data: any, actorId?: string) {
    return this.prisma.audit.create({
      data: { ...data, reference: await this.nextAuditReference(), createdById: actorId },
      include: { findings: true },
    });
  }

  async addFinding(auditId: string, data: any) {
    const audit = await this.prisma.audit.findUnique({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    return this.prisma.auditFinding.create({ data: { ...data, auditId } });
  }

  // ── R9 Corrective Action Register (shared) ───────────────────────────
  // One register for everything the manual routes here: accident findings,
  // audit findings, fine trends and fatigue non-compliance.

  listCorrectiveActions(filters: { openOnly?: boolean; overdueOnly?: boolean } = {}) {
    return this.prisma.correctiveAction.findMany({
      where: {
        ...(filters.openOnly && { status: { in: ['OPEN', 'IN_PROGRESS'] } }),
        ...(filters.overdueOnly && {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          dueDate: { lt: new Date() },
        }),
      },
      include: {
        incident: { select: { id: true, reference: true } },
        fine: { select: { id: true, noticeNumber: true, reason: true } },
        auditFinding: { select: { id: true, description: true, rtmsElement: true } },
        driver: { select: { id: true, surname: true, firstName: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  createCorrectiveAction(data: any) {
    return this.prisma.correctiveAction.create({ data });
  }

  // ── Management reviews (element 8) ───────────────────────────────────

  /**
   * R17 Safety Performance Report, one row per calendar month.
   *
   * The six R17 figures are DERIVED on read, never typed in. They used to be
   * served straight out of the stored `metrics` JSON, which had two problems:
   * a snapshot written before the r17 shape existed rendered as six blank
   * cells, and even a well-formed snapshot went stale the moment an incident
   * or fine was recorded against a month already reviewed.
   *
   * So the counts always come from the live tables for that month's date
   * range. What stays manual is the part that is a human act and cannot be
   * derived: `reviewedAt` / `reviewedById` — someone actually looked at it.
   * `notes` and the stored snapshot are preserved too, so an old record keeps
   * whatever narrative was written at the time.
   */
  async listReviews() {
    const reviews = await this.prisma.managementReview.findMany({
      orderBy: { periodMonth: 'desc' },
      take: 24,
    });
    return Promise.all(
      reviews.map(async (r) => ({
        ...r,
        metrics: {
          ...(r.metrics as object),
          ...(await this.monthlyReview.metricsFor(r.periodMonth)),
        },
      })),
    );
  }
}
