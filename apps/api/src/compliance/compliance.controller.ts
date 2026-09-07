import { Body, Controller, Get, Header, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ComplianceStatus } from '@prisma/client';
import { AuthUser, CurrentUser, MinRole } from '../auth/decorators';
import { AuditPackService } from './audit-pack.service';
import { ComplianceService } from './compliance.service';
import {
  ComplianceItemCreateSchema, ComplianceItemRenewSchema, ComplianceItemUpdateSchema,
  AuditFindingSchema, AuditSchema, CorrectiveActionCreateSchema,
  DutyRecordSchema, PolicyAckSchema, PolicySchema, RiskAssessmentSchema,
  RouteAckSchema, RouteRiskAssessmentSchema, SafetyObjectiveSchema,
  TrainingRecordSchema,
} from './dto';
import { FatigueService } from './fatigue.service';
import { GovernanceService } from './governance.service';
import { MonthlyReviewService } from './monthly-review.service';

const parseDate = (v: string | undefined, fallback: Date) => {
  if (!v) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d;
};

@Controller('compliance')
export class ComplianceController {
  constructor(
    private readonly compliance: ComplianceService,
    private readonly governance: GovernanceService,
    private readonly fatigue: FatigueService,
    private readonly reviews: MonthlyReviewService,
    private readonly auditPack: AuditPackService,
  ) {}

  // ── RAG dashboard ────────────────────────────────────────────────────

  @Get('dashboard')
  dashboard() {
    return this.compliance.dashboard();
  }

  // ── Items ────────────────────────────────────────────────────────────

  @Get('items')
  listItems(
    @Query('ownerType') ownerType?: 'ASSET' | 'DRIVER',
    @Query('assetId') assetId?: string,
    @Query('driverId') driverId?: string,
    @Query('kindId') kindId?: string,
    @Query('status') status?: ComplianceStatus,
    @Query('expiringInDays') expiringInDays?: string,
  ) {
    return this.compliance.listItems({
      ownerType, assetId, driverId, kindId, status,
      expiringInDays: expiringInDays ? Number(expiringInDays) : undefined,
    });
  }

  @Post('items')
  @MinRole('CONSULTANT')
  createItem(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.compliance.createItem(ComplianceItemCreateSchema.parse(body), actor.id);
  }

  @Patch('items/:id')
  @MinRole('CONSULTANT')
  updateItem(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.compliance.updateItem(id, ComplianceItemUpdateSchema.parse(body), actor.id);
  }

  @Post('items/:id/renew')
  @MinRole('CONSULTANT')
  renewItem(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.compliance.renewItem(id, ComplianceItemRenewSchema.parse(body), actor.id);
  }

  // Manual trigger for the nightly engine — useful in the pilot and for tests.
  @Post('recompute')
  @MinRole('ADMIN')
  recompute() {
    return this.compliance.recomputeStatuses();
  }

  @Post('send-reminders')
  @MinRole('ADMIN')
  sendReminders() {
    return this.compliance.sendReminders();
  }

  // ── Fatigue (element 4) ──────────────────────────────────────────────

  @Get('fatigue/:driverId')
  fatigueCheck(@Param('driverId') driverId: string) {
    return this.fatigue.check(driverId);
  }

  @Get('fatigue')
  fatigueBreaches() {
    return this.fatigue.breachingDrivers();
  }

  @Post('duty')
  @MinRole('CONSULTANT')
  logDuty(@Body() body: unknown) {
    return this.fatigue.logDuty(DutyRecordSchema.parse(body) as any);
  }

  // ── Policies and objectives (element 1) ──────────────────────────────

  @Get('policies')
  listPolicies(@Query('includeSuperseded') inc?: string) {
    return this.governance.listPolicies(inc === 'true');
  }

  @Post('policies')
  @MinRole('ADMIN')
  publishPolicy(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.governance.publishPolicy(PolicySchema.parse(body), actor.id);
  }

  @Post('policies/:id/acknowledge')
  @MinRole('CONSULTANT')
  ackPolicy(@Param('id') id: string, @Body() body: unknown) {
    return this.governance.acknowledgePolicy(id, PolicyAckSchema.parse(body));
  }

  @Get('objectives')
  listObjectives() {
    return this.governance.listObjectives();
  }

  @Post('objectives')
  @MinRole('ADMIN')
  createObjective(@Body() body: unknown) {
    return this.governance.createObjective(SafetyObjectiveSchema.parse(body));
  }

  // ── Risk (element 2) and routes (element 6) ──────────────────────────

  @Get('risk-assessments')
  listRisk() {
    return this.governance.listRiskAssessments();
  }

  @Post('risk-assessments')
  @MinRole('CONSULTANT')
  createRisk(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.governance.createRiskAssessment(RiskAssessmentSchema.parse(body), actor.id);
  }

  @Get('routes')
  listRoutes() {
    return this.governance.listRoutes();
  }

  @Post('routes')
  @MinRole('CONSULTANT')
  createRoute(@Body() body: unknown) {
    return this.governance.createRoute(RouteRiskAssessmentSchema.parse(body));
  }

  @Patch('routes/:id')
  @MinRole('CONSULTANT')
  reviseRoute(@Param('id') id: string, @Body() body: unknown) {
    return this.governance.reviseRoute(id, RouteRiskAssessmentSchema.partial().parse(body));
  }

  @Post('routes/:id/acknowledge')
  @MinRole('CONSULTANT')
  ackRoute(@Param('id') id: string, @Body() body: unknown) {
    const { driverId, signatureFileId } = RouteAckSchema.parse(body);
    return this.governance.acknowledgeRoute(id, driverId, signatureFileId);
  }

  // ── Monitoring and review (element 8) ────────────────────────────────

  @Get('reviews')
  listReviews() {
    return this.governance.listReviews();
  }

  @Post('reviews')
  @MinRole('ADMIN')
  generateReview(@Body() body: { periodMonth?: string }) {
    return this.reviews.generate(body?.periodMonth);
  }

  // ── Training (manual 4.14) ───────────────────────────────────────────

  @Get('training/courses')
  listCourses() {
    return this.governance.listCourses();
  }

  @Get('training/records')
  listTrainingRecords(@Query('driverId') driverId?: string) {
    return this.governance.listTrainingRecords(driverId);
  }

  @Post('training/records')
  @MinRole('CONSULTANT')
  recordTraining(@Body() body: unknown) {
    return this.governance.recordTraining(TrainingRecordSchema.parse(body) as any);
  }

  // ── Internal audit (element 8) ───────────────────────────────────────

  @Get('audits')
  listAudits() {
    return this.governance.listAudits();
  }

  @Post('audits')
  @MinRole('ADMIN')
  createAudit(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.governance.createAudit(AuditSchema.parse(body), actor.id);
  }

  @Post('audits/:id/findings')
  @MinRole('ADMIN')
  addFinding(@Param('id') id: string, @Body() body: unknown) {
    return this.governance.addFinding(id, AuditFindingSchema.parse(body));
  }

  // ── R9 Corrective Action Register ────────────────────────────────────

  @Get('corrective-actions')
  listCorrectiveActions(
    @Query('openOnly') openOnly?: string,
    @Query('overdueOnly') overdueOnly?: string,
  ) {
    return this.governance.listCorrectiveActions({
      openOnly: openOnly === 'true',
      overdueOnly: overdueOnly === 'true',
    });
  }

  @Post('corrective-actions')
  @MinRole('CONSULTANT')
  createCorrectiveAction(@Body() body: unknown) {
    return this.governance.createCorrectiveAction(CorrectiveActionCreateSchema.parse(body));
  }

  // ── Audit pack ───────────────────────────────────────────────────────

  @Get('reports')
  listReports() {
    return this.auditPack.listReports();
  }

  // Single report streamed straight back as a PDF.
  @Get('reports/:code.pdf')
  @Header('Content-Type', 'application/pdf')
  async oneReport(
    @Param('code') code: string,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const period = {
      start: parseDate(from, new Date(Date.now() - 365 * 86_400_000)),
      end: parseDate(to, new Date()),
    };
    const pdf = await this.auditPack.renderOne(code.toUpperCase(), period);
    res.setHeader('Content-Disposition', `inline; filename="RTMS-${code.toUpperCase()}.pdf"`);
    res.end(pdf);
  }

  @Get('audit-packs')
  listPacks() {
    return this.auditPack.listPacks();
  }

  @Get('audit-packs/:id')
  packById(@Param('id') id: string) {
    return this.auditPack.packById(id);
  }

  // The single "Export audit pack" action.
  @Post('audit-packs')
  @MinRole('CONSULTANT')
  requestPack(
    @Body() body: { from?: string; to?: string },
    @CurrentUser() actor: AuthUser,
  ) {
    const period = {
      start: parseDate(body?.from, new Date(Date.now() - 365 * 86_400_000)),
      end: parseDate(body?.to, new Date()),
    };
    return this.auditPack.requestPack(period, actor.id);
  }
}
