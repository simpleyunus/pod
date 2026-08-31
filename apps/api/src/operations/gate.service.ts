import { Injectable } from '@nestjs/common';
import { FatigueService } from '../compliance/fatigue.service';
import { PrismaService } from '../prisma/prisma.service';

export interface GateCheck {
  code: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface GateResult {
  passed: boolean;
  checks: GateCheck[];
  failures: GateCheck[];
}

/**
 * The compliance-aware assignment gate.
 *
 * Every check runs even after one fails, so the board can show the operator
 * everything that is wrong in one pass rather than one blocker at a time.
 *
 * What blocks is not hardcoded: a document blocks a trip because an admin
 * ticked `requiredForOperation` on its ComplianceKind. Adding a new blocking
 * document is a lookup edit, not a deploy.
 */
@Injectable()
export class GateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fatigue: FatigueService,
  ) {}

  async evaluate(assignmentId: string, opts: { massLoadedKg?: number } = {}): Promise<GateResult> {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        asset: true,
        driver: true,
        route: true,
        massRecords: { orderBy: { measuredAt: 'desc' }, take: 1 },
        inspection: { include: { results: { include: { item: true } } } },
      },
    });
    if (!assignment) {
      return {
        passed: false,
        checks: [{ code: 'ASSIGNMENT', label: 'Trip exists', passed: false, detail: 'Trip not found' }],
        failures: [{ code: 'ASSIGNMENT', label: 'Trip exists', passed: false, detail: 'Trip not found' }],
      };
    }

    const checks: GateCheck[] = [];

    // ── 1 & 2. Documents that an admin has marked as blocking ──────────
    const [driverItems, assetItems] = await Promise.all([
      this.prisma.complianceItem.findMany({
        where: { driverId: assignment.driverId, archivedAt: null, kind: { requiredForOperation: true } },
        include: { kind: true },
      }),
      this.prisma.complianceItem.findMany({
        where: { assetId: assignment.assetId, archivedAt: null, kind: { requiredForOperation: true } },
        include: { kind: true },
      }),
    ]);

    const requiredKinds = await this.prisma.complianceKind.findMany({
      where: { requiredForOperation: true, active: true },
    });

    for (const scope of [
      { owner: 'DRIVER' as const, items: driverItems, subject: assignment.driver.fullName },
      { owner: 'ASSET' as const, items: assetItems, subject: `${assignment.asset.code} (${assignment.asset.registrationNo})` },
    ]) {
      for (const kind of requiredKinds.filter((k) => k.ownerType === scope.owner)) {
        const item = scope.items.find((i) => i.kindId === kind.id);
        if (!item) {
          // A missing required document is a failure, not a silent pass —
          // otherwise never capturing a licence would look compliant.
          checks.push({
            code: `${scope.owner}_${kind.code}`,
            label: `${kind.name} — ${scope.subject}`,
            passed: false,
            detail: 'No record on file',
          });
          continue;
        }
        checks.push({
          code: `${scope.owner}_${kind.code}`,
          label: `${kind.name} — ${scope.subject}`,
          passed: item.status !== 'EXPIRED',
          detail:
            item.status === 'EXPIRED'
              ? `Expired ${item.expiresOn?.toISOString().slice(0, 10) ?? ''}`.trim()
              : item.status === 'DUE_SOON'
                ? `Valid, expires ${item.expiresOn?.toISOString().slice(0, 10)}`
                : undefined,
        });
      }
    }

    // ── 3. Fatigue ──────────────────────────────────────────────────────
    const fatigue = await this.fatigue.check(assignment.driverId);
    checks.push({
      code: 'FATIGUE',
      label: `Driver hours — ${assignment.driver.fullName}`,
      passed: fatigue.ok,
      detail: fatigue.ok
        ? `${(fatigue.dailyMinutes / 60).toFixed(1)}h/24h, ${(fatigue.weeklyMinutes / 60).toFixed(1)}h/7d`
        : fatigue.breaches.map((b) => b.detail).join('; '),
    });

    // ── 4. Load ─────────────────────────────────────────────────────────
    const massLoadedKg = opts.massLoadedKg ?? assignment.massRecords[0]?.massLoadedKg ?? null;
    if (massLoadedKg === null) {
      checks.push({
        code: 'MASS_LIMIT',
        label: 'Load within permissible maximum',
        passed: true,
        detail: 'Not yet weighed — record a mass before departure',
      });
    } else {
      const max = assignment.asset.maxMassKg;
      checks.push({
        code: 'MASS_LIMIT',
        label: 'Load within permissible maximum',
        passed: massLoadedKg <= max,
        detail:
          massLoadedKg <= max
            ? `${massLoadedKg.toLocaleString()} kg of ${max.toLocaleString()} kg`
            : `${massLoadedKg.toLocaleString()} kg exceeds the ${max.toLocaleString()} kg limit by ${(massLoadedKg - max).toLocaleString()} kg`,
      });
    }

    // ── 5. Route acknowledgement (element 6) ────────────────────────────
    if (assignment.route) {
      const ack = await this.prisma.routeAcknowledgement.findFirst({
        where: {
          routeRiskAssessmentId: assignment.route.id,
          driverId: assignment.driverId,
          version: assignment.route.version, // a revised route invalidates old acks
        },
      });
      checks.push({
        code: 'ROUTE_ACK',
        label: `Route briefing acknowledged — ${assignment.route.name}`,
        passed: !!ack,
        detail: ack
          ? `Acknowledged ${ack.acknowledgedAt.toISOString().slice(0, 10)}`
          : `Driver has not acknowledged version ${assignment.route.version} of this route`,
      });
    }

    // ── 6. Pre-trip inspection (element 3) ──────────────────────────────
    if (assignment.inspection) {
      const criticalFails = assignment.inspection.results.filter(
        (r) => r.outcome === 'FAIL' && r.item.critical,
      );
      checks.push({
        code: 'PRE_TRIP',
        label: 'Pre-trip inspection',
        passed: criticalFails.length === 0,
        detail: criticalFails.length
          ? `Critical items failed: ${criticalFails.map((r) => r.item.label).join(', ')}`
          : assignment.inspection.passed
            ? 'Passed'
            : 'Passed with non-critical defects noted',
      });
    } else {
      checks.push({
        code: 'PRE_TRIP',
        label: 'Pre-trip inspection',
        passed: false,
        detail: 'No pre-trip inspection recorded for this trip',
      });
    }

    const failures = checks.filter((c) => !c.passed);
    return { passed: failures.length === 0, checks, failures };
  }

  /** Persist the outcome so a blocked trip shows exactly why, and an override
   *  is auditable against the specific failures it bypassed. */
  async persist(assignmentId: string, result: GateResult) {
    await this.prisma.assignmentGateCheck.deleteMany({ where: { assignmentId } });
    await this.prisma.assignmentGateCheck.createMany({
      data: result.checks.map((c) => ({
        assignmentId,
        code: c.code,
        label: c.label,
        passed: c.passed,
        detail: c.detail ?? null,
      })),
    });
    return result;
  }
}
