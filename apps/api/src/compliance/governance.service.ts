import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// RTMS elements 1 and 2 plus the element-8 review record: policies,
// objectives, risk assessments, routes and their acknowledgements.
@Injectable()
export class GovernanceService {
  constructor(private readonly prisma: PrismaService) {}

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

  // ── Management reviews (element 8) ───────────────────────────────────

  listReviews() {
    return this.prisma.managementReview.findMany({ orderBy: { periodMonth: 'desc' }, take: 24 });
  }
}
