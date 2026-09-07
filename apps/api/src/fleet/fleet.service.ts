import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ComplianceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FleetEventsService } from './fleet-events.service';
import { driverName } from './naming';

// Worst-first ordering: an asset with one EXPIRED item is red regardless of
// how many valid ones it has.
const RANK: Record<ComplianceStatus, number> = { VALID: 0, DUE_SOON: 1, EXPIRED: 2 };

/**
 * Roll a set of compliance items up to one status.
 *
 * `missingRequired` is the count of documents an admin has marked
 * `requiredForOperation` that have no record at all. Those score as EXPIRED,
 * because a vehicle with no Certificate of Fitness on file is not compliant —
 * it is unevidenced, which is the same answer to an auditor. Without this a
 * brand-new asset with zero documents would read green.
 */
export function rollUp(
  items: { status: ComplianceStatus }[],
  missingRequired = 0,
): ComplianceStatus {
  if (missingRequired > 0) return 'EXPIRED';
  return items.reduce<ComplianceStatus>(
    (worst, i) => (RANK[i.status] > RANK[worst] ? i.status : worst),
    'VALID',
  );
}

@Injectable()
export class FleetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: FleetEventsService,
  ) {}

  // ── Assets ───────────────────────────────────────────────────────────

  async listAssets(opts: { q?: string; typeId?: string; includeInactive?: boolean } = {}) {
    const where: Prisma.AssetWhereInput = {
      ...(opts.includeInactive ? {} : { active: true }),
      ...(opts.typeId && { typeId: opts.typeId }),
      ...(opts.q && {
        OR: [
          { fleetNo: { contains: opts.q, mode: 'insensitive' } },
          { registrationNo: { contains: opts.q, mode: 'insensitive' } },
          { vin: { contains: opts.q, mode: 'insensitive' } },
          { makeManufacturer: { contains: opts.q, mode: 'insensitive' } },
        ],
      }),
    };

    const [assets, requiredKinds] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        orderBy: { fleetNo: 'asc' },
        include: {
          type: true,
          complianceItems: {
            where: { archivedAt: null },
            include: { kind: { select: { code: true, name: true, requiredForOperation: true } } },
          },
        },
      }),
      this.prisma.complianceKind.findMany({
        where: { ownerType: 'ASSET', requiredForOperation: true, active: true },
        select: { code: true, name: true },
      }),
    ]);

    return assets.map((a) => {
      const { complianceItems, ...rest } = a;
      const held = new Set(complianceItems.map((i) => i.kind.code));
      const missing = requiredKinds.filter((k) => !held.has(k.code));
      return {
        ...rest,
        missingRequired: missing.map((k) => k.name),
        complianceStatus: rollUp(complianceItems, missing.length),
        complianceCounts: {
          VALID: complianceItems.filter((i) => i.status === 'VALID').length,
          DUE_SOON: complianceItems.filter((i) => i.status === 'DUE_SOON').length,
          EXPIRED: complianceItems.filter((i) => i.status === 'EXPIRED').length,
        },
        blockingItems: [
          ...complianceItems
            .filter((i) => i.kind.requiredForOperation && i.status === 'EXPIRED')
            .map((i) => i.kind.name),
          ...missing.map((k) => `${k.name} (no record)`),
        ],
      };
    });
  }

  async assetById(id: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: {
        type: true,
        complianceItems: {
          where: { archivedAt: null },
          include: { kind: true },
          orderBy: { expiresOn: 'asc' },
        },
        maintenancePlans: true,
        workOrders: {
          include: { status: true },
          orderBy: { requestedAt: 'desc' },
          take: 50,
        },
        inspections: { orderBy: { performedAt: 'desc' }, take: 20 },
        tyreRecords: { orderBy: { createdAt: 'desc' } },
        assignments: {
          include: { status: true, driver: { select: { id: true, surname: true, firstName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        incidents: { orderBy: { date: 'desc' }, take: 20 },
        fines: { orderBy: { date: 'desc' }, take: 20 },
        massRecords: { orderBy: { date: 'desc' }, take: 20 },
      },
    });
    if (!asset) throw new NotFoundException(`Asset ${id} not found`);

    const events = await this.events.withActors(
      await this.events.list('ASSET', id),
    );
    return { ...asset, complianceStatus: rollUp(asset.complianceItems), events };
  }

  async createAsset(data: any, actorId?: string) {
    const asset = await this.prisma.asset.create({ data });
    await this.events.record('ASSET', asset.id, 'SYSTEM', `Vehicle ${asset.fleetNo} (${asset.registrationNo}) added to the fleet list`, null, actorId);
    return asset;
  }

  async updateAsset(id: string, data: any, actorId?: string) {
    const existing = await this.prisma.asset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Asset ${id} not found`);
    const asset = await this.prisma.asset.update({ where: { id }, data });
    await this.events.record('ASSET', id, 'NOTE', 'Asset details updated', { changed: Object.keys(data) }, actorId);
    return asset;
  }

  // The odometer drives km-based maintenance, so a reading is an event in its
  // own right rather than a silent field update.
  async recordOdometer(id: string, odometerKm: number, actorId?: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException(`Asset ${id} not found`);
    if (odometerKm < asset.odometerKm) {
      throw new BadRequestException(
        `Odometer cannot go backwards (current ${asset.odometerKm} km)`,
      );
    }
    const updated = await this.prisma.asset.update({ where: { id }, data: { odometerKm } });
    await this.events.record(
      'ASSET', id, 'SYSTEM',
      `Odometer ${asset.odometerKm} → ${odometerKm} km`,
      { from: asset.odometerKm, to: odometerKm }, actorId,
    );
    return updated;
  }

  // ── Drivers ──────────────────────────────────────────────────────────

  async listDrivers(opts: { q?: string; includeInactive?: boolean } = {}) {
    const [drivers, requiredKinds] = await Promise.all([
      this.prisma.driver.findMany({
        where: {
          ...(opts.includeInactive ? {} : { active: true }),
          ...(opts.q && {
            OR: [
              { surname: { contains: opts.q, mode: 'insensitive' } },
              { firstName: { contains: opts.q, mode: 'insensitive' } },
              { employeeNo: { contains: opts.q, mode: 'insensitive' } },
            ],
          }),
        },
        orderBy: [{ surname: 'asc' }, { firstName: 'asc' }],
        include: {
          complianceItems: {
            where: { archivedAt: null },
            include: { kind: { select: { code: true, name: true, requiredForOperation: true } } },
          },
        },
      }),
      this.prisma.complianceKind.findMany({
        where: { ownerType: 'DRIVER', requiredForOperation: true, active: true },
        select: { code: true, name: true },
      }),
    ]);

    return drivers.map((d) => {
      const { complianceItems, ...rest } = d;
      const held = new Set(complianceItems.map((i) => i.kind.code));
      const missing = requiredKinds.filter((k) => !held.has(k.code));
      return {
        ...rest,
        missingRequired: missing.map((k) => k.name),
        complianceStatus: rollUp(complianceItems, missing.length),
        complianceCounts: {
          VALID: complianceItems.filter((i) => i.status === 'VALID').length,
          DUE_SOON: complianceItems.filter((i) => i.status === 'DUE_SOON').length,
          EXPIRED: complianceItems.filter((i) => i.status === 'EXPIRED').length,
        },
        blockingItems: [
          ...complianceItems
            .filter((i) => i.kind.requiredForOperation && i.status === 'EXPIRED')
            .map((i) => i.kind.name),
          ...missing.map((k) => `${k.name} (no record)`),
        ],
      };
    });
  }

  async driverById(id: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: {
        complianceItems: {
          where: { archivedAt: null },
          include: { kind: true },
          orderBy: { expiresOn: 'asc' },
        },
        assignments: {
          include: { status: true, asset: { select: { id: true, fleetNo: true, registrationNo: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        dutyRecords: { orderBy: { onDutyAt: 'desc' }, take: 30 },
        incidents: { orderBy: { date: 'desc' }, take: 20 },
        fines: { orderBy: { date: 'desc' }, take: 20 },
        routeAcks: { include: { route: { select: { id: true, name: true, version: true } } } },
        policyAcks: { include: { policy: { select: { id: true, code: true, title: true, version: true } } } },
      },
    });
    if (!driver) throw new NotFoundException(`Driver ${id} not found`);

    const events = await this.events.withActors(await this.events.list('DRIVER', id));
    return { ...driver, complianceStatus: rollUp(driver.complianceItems), events };
  }

  async createDriver(data: any, actorId?: string) {
    const driver = await this.prisma.driver.create({ data });
    await this.events.record('DRIVER', driver.id, 'SYSTEM', `Driver ${driverName(driver)} added`, null, actorId);
    return driver;
  }

  async updateDriver(id: string, data: any, actorId?: string) {
    const existing = await this.prisma.driver.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Driver ${id} not found`);
    const driver = await this.prisma.driver.update({ where: { id }, data });
    await this.events.record('DRIVER', id, 'NOTE', 'Driver details updated', { changed: Object.keys(data) }, actorId);
    return driver;
  }

  // ── Carriers (external hauliers) ─────────────────────────────────────

  listCarriers(includeInactive = false) {
    return this.prisma.carrier.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { name: 'asc' },
    });
  }

  async carrierById(id: string) {
    const carrier = await this.prisma.carrier.findUnique({
      where: { id },
      include: {
        assignments: {
          include: { status: true, asset: { select: { fleetNo: true, registrationNo: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!carrier) throw new NotFoundException(`Carrier ${id} not found`);
    return carrier;
  }

  createCarrier(data: any) {
    return this.prisma.carrier.create({ data });
  }

  async updateCarrier(id: string, data: any) {
    const existing = await this.prisma.carrier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Carrier ${id} not found`);
    return this.prisma.carrier.update({ where: { id }, data });
  }

  // ── Tyre record (RTMS report R12) ────────────────────────────────────

  listTyres(assetId?: string) {
    return this.prisma.tyreRecord.findMany({
      where: assetId ? { assetId } : {},
      orderBy: [{ assetId: 'asc' }, { createdAt: 'desc' }],
      include: { asset: { select: { id: true, fleetNo: true, registrationNo: true } } },
    });
  }

  async addTyreRecord(data: any, actorId?: string) {
    const record = await this.prisma.tyreRecord.create({ data });
    await this.events.record(
      'ASSET', data.assetId, 'NOTE',
      `Tyre ${data.action.toLowerCase()} at position ${data.position}`,
      { tyreRecordId: record.id }, actorId,
    );
    return record;
  }

  // ── Lookups ──────────────────────────────────────────────────────────

  async lookups() {
    const [assetTypes, complianceKinds, workOrderStatuses, tripStatuses, incidentStatuses, incidentCategories, inspectionItems] =
      await Promise.all([
        this.prisma.assetType.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
        this.prisma.complianceKind.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
        this.prisma.workOrderStatus.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
        this.prisma.tripStatus.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
        this.prisma.incidentStatus.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
        this.prisma.incidentCategory.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
        this.prisma.inspectionItemDef.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      ]);
    return {
      assetTypes, complianceKinds, workOrderStatuses, tripStatuses,
      incidentStatuses, incidentCategories, inspectionItems,
    };
  }

  // Admin-editable lookup tables, same idea as the existing status/location
  // lists. The table name is validated against a whitelist, never interpolated.
  private lookupDelegate(table: string) {
    const map: Record<string, any> = {
      'asset-types': this.prisma.assetType,
      'compliance-kinds': this.prisma.complianceKind,
      'work-order-statuses': this.prisma.workOrderStatus,
      'trip-statuses': this.prisma.tripStatus,
      'incident-statuses': this.prisma.incidentStatus,
      'incident-categories': this.prisma.incidentCategory,
      'inspection-items': this.prisma.inspectionItemDef,
    };
    const delegate = map[table];
    if (!delegate) throw new BadRequestException(`Unknown lookup table "${table}"`);
    return delegate;
  }

  createLookup(table: string, data: any) {
    return this.lookupDelegate(table).create({ data });
  }

  updateLookup(table: string, id: string, data: any) {
    return this.lookupDelegate(table).update({ where: { id }, data });
  }
}
