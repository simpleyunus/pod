import { PrismaClient, ComplianceOwnerType, RtmsElement } from '@prisma/client';

// RTMS Fleet & Compliance seed data.
//
// Everything here is a LOOKUP TABLE first: statuses, checklist items and
// compliance kinds are admin-editable rows, not hardcoded enums, exactly as
// DealStatus/Location already are. Re-running is safe — every write upserts
// on a unique code, so admin edits to `name`/`sortOrder` survive a re-seed
// while the behavioural flags stay authoritative.

const ASSET_TYPES = [
  { code: 'TRUCK_TRACTOR', name: 'Truck tractor (horse)', isTrailer: false },
  { code: 'CAR_CARRIER',   name: 'Car carrier trailer',   isTrailer: true },
  { code: 'RIGID_TRUCK',   name: 'Rigid truck',           isTrailer: false },
  { code: 'BAKKIE',        name: 'Bakkie / LDV',          isTrailer: false },
  { code: 'TRAILER',       name: 'General trailer',       isTrailer: true },
];

// `requiredForOperation` is what the assignment gate actually reads — admins
// decide what blocks a trip without anyone touching code.
const COMPLIANCE_KINDS: Array<{
  code: string;
  name: string;
  ownerType: ComplianceOwnerType;
  leadDaysDueSoon: number;
  requiredForOperation: boolean;
  rtmsElement: RtmsElement;
}> = [
  // ── Vehicle (element 3: vehicle fitness) ──
  { code: 'VEHICLE_LICENCE', name: 'Vehicle licence disc',        ownerType: 'ASSET',  leadDaysDueSoon: 30, requiredForOperation: true,  rtmsElement: 'VEHICLE_FITNESS' },
  { code: 'COF',             name: 'Certificate of Fitness',      ownerType: 'ASSET',  leadDaysDueSoon: 30, requiredForOperation: true,  rtmsElement: 'VEHICLE_FITNESS' },
  { code: 'INSURANCE',       name: 'Vehicle insurance',           ownerType: 'ASSET',  leadDaysDueSoon: 30, requiredForOperation: true,  rtmsElement: 'VEHICLE_FITNESS' },
  { code: 'SERVICE_DUE',     name: 'Service due',                 ownerType: 'ASSET',  leadDaysDueSoon: 14, requiredForOperation: false, rtmsElement: 'VEHICLE_FITNESS' },
  { code: 'OPERATOR_CARD',   name: 'Operator card',               ownerType: 'ASSET',  leadDaysDueSoon: 30, requiredForOperation: false, rtmsElement: 'VEHICLE_FITNESS' },
  // ── Vehicle (element 6: journey management — cross-border) ──
  { code: 'CBRTA_PERMIT',    name: 'CBRTA cross-border permit',   ownerType: 'ASSET',  leadDaysDueSoon: 45, requiredForOperation: true,  rtmsElement: 'JOURNEY_MANAGEMENT' },
  // ── Driver (element 4: driver wellness) ──
  { code: 'DRIVER_LICENCE',  name: 'Driving licence',             ownerType: 'DRIVER', leadDaysDueSoon: 30, requiredForOperation: true,  rtmsElement: 'DRIVER_WELLNESS' },
  { code: 'PRDP',            name: 'Professional Driving Permit', ownerType: 'DRIVER', leadDaysDueSoon: 30, requiredForOperation: true,  rtmsElement: 'DRIVER_WELLNESS' },
  { code: 'MEDICAL',         name: 'Medical certificate',         ownerType: 'DRIVER', leadDaysDueSoon: 30, requiredForOperation: true,  rtmsElement: 'DRIVER_WELLNESS' },
  { code: 'PASSPORT',        name: 'Passport',                    ownerType: 'DRIVER', leadDaysDueSoon: 60, requiredForOperation: false, rtmsElement: 'JOURNEY_MANAGEMENT' },
  { code: 'SUBSTANCE_ACK',   name: 'Substance policy acknowledgement', ownerType: 'DRIVER', leadDaysDueSoon: 30, requiredForOperation: false, rtmsElement: 'DRIVER_WELLNESS' },
  { code: 'INDUCTION',       name: 'Safety induction',            ownerType: 'DRIVER', leadDaysDueSoon: 30, requiredForOperation: false, rtmsElement: 'MANAGEMENT_COMMITMENT' },
];

const WORK_ORDER_STATUSES = [
  { code: 'REQUESTED',      name: 'Requested',      isTerminal: false },
  { code: 'APPROVED',       name: 'Approved',       isTerminal: false },
  { code: 'IN_PROGRESS',    name: 'In progress',    isTerminal: false },
  { code: 'AWAITING_PARTS', name: 'Awaiting parts', isTerminal: false },
  { code: 'DONE',           name: 'Done',           isTerminal: false },
  { code: 'CLOSED',         name: 'Closed',         isTerminal: true  },
];

const TRIP_STATUSES = [
  { code: 'PLANNED',      name: 'Planned',      isTerminal: false },
  { code: 'GATE_BLOCKED', name: 'Gate blocked', isTerminal: false },
  { code: 'IN_PROGRESS',  name: 'In progress',  isTerminal: false },
  { code: 'DELIVERED',    name: 'Delivered',    isTerminal: true  },
  { code: 'CANCELLED',    name: 'Cancelled',    isTerminal: true  },
];

const INCIDENT_STATUSES = [
  { code: 'REPORTED',      name: 'Reported',           isTerminal: false },
  { code: 'INVESTIGATING', name: 'Investigating',      isTerminal: false },
  { code: 'ACTIONS_OPEN',  name: 'Actions outstanding', isTerminal: false },
  { code: 'CLOSED',        name: 'Closed',             isTerminal: true  },
];

const INCIDENT_CATEGORIES = [
  { code: 'COLLISION',   name: 'Collision' },
  { code: 'ROLLOVER',    name: 'Rollover' },
  { code: 'LOAD_SHIFT',  name: 'Load shift / load loss' },
  { code: 'NEAR_MISS',   name: 'Near miss' },
  { code: 'INJURY',      name: 'Injury' },
  { code: 'BREAKDOWN',   name: 'Breakdown' },
  { code: 'FIRE',        name: 'Fire' },
  { code: 'THEFT',       name: 'Theft / hijacking' },
  { code: 'ENVIRONMENT', name: 'Environmental spill' },
];

// The daily pre-trip checklist. `critical: true` items block departure when
// they fail — the gate reads this flag rather than a hardcoded list.
const INSPECTION_ITEMS = [
  { code: 'OIL_LEVEL',     label: 'Engine oil level',            category: 'Under the bonnet', critical: false },
  { code: 'COOLANT',       label: 'Coolant level',               category: 'Under the bonnet', critical: false },
  { code: 'BELTS_HOSES',   label: 'Belts and hoses',             category: 'Under the bonnet', critical: false },
  { code: 'FUEL_LEAKS',    label: 'No fuel or oil leaks',        category: 'Under the bonnet', critical: true  },
  { code: 'TYRE_TREAD',    label: 'Tyre tread depth and wear',   category: 'Tyres and wheels', critical: true  },
  { code: 'TYRE_PRESSURE', label: 'Tyre pressure',               category: 'Tyres and wheels', critical: false },
  { code: 'WHEEL_NUTS',    label: 'Wheel nuts and studs',        category: 'Tyres and wheels', critical: true  },
  { code: 'SPARE_WHEEL',   label: 'Spare wheel present',         category: 'Tyres and wheels', critical: false },
  { code: 'SERVICE_BRAKE', label: 'Service brakes',              category: 'Brakes',           critical: true  },
  { code: 'PARK_BRAKE',    label: 'Parking brake',               category: 'Brakes',           critical: true  },
  { code: 'AIR_LEAKS',     label: 'Air system — no leaks',       category: 'Brakes',           critical: true  },
  { code: 'HEADLIGHTS',    label: 'Headlights and tail lights',  category: 'Lights',           critical: true  },
  { code: 'INDICATORS',    label: 'Indicators and hazards',      category: 'Lights',           critical: true  },
  { code: 'BRAKE_LIGHTS',  label: 'Brake lights',                category: 'Lights',           critical: true  },
  { code: 'REFLECTORS',    label: 'Reflective tape and chevrons', category: 'Lights',          critical: false },
  { code: 'COUPLING',      label: 'Fifth wheel / coupling secure', category: 'Coupling and load', critical: true },
  { code: 'LOAD_SECURING', label: 'Load properly secured',       category: 'Coupling and load', critical: true  },
  { code: 'RAMPS',         label: 'Ramps and deck locks',        category: 'Coupling and load', critical: true  },
  { code: 'MIRRORS',       label: 'Mirrors clean and adjusted',  category: 'Cab',              critical: false },
  { code: 'WIPERS',        label: 'Wipers and washers',          category: 'Cab',              critical: false },
  { code: 'HORN',          label: 'Horn working',                category: 'Cab',              critical: false },
  { code: 'SEATBELTS',     label: 'Seatbelts',                   category: 'Cab',              critical: true  },
  { code: 'EXTINGUISHER',  label: 'Fire extinguisher charged',   category: 'Safety equipment', critical: true  },
  { code: 'TRIANGLES',     label: 'Warning triangles',           category: 'Safety equipment', critical: true  },
  { code: 'FIRST_AID',     label: 'First aid kit',               category: 'Safety equipment', critical: false },
  { code: 'LICENCE_DISC',  label: 'Licence disc displayed and valid', category: 'Documents',   critical: true  },
  { code: 'PERMITS',       label: 'Cross-border permits on board', category: 'Documents',      critical: true  },
];

// ── SAMPLE DATA ───────────────────────────────────────────────────────────
// POD's two known vehicles and one driver. Registrations, VINs and the
// driver's details are PLACEHOLDERS — replace them with the real fleet before
// the pilot. Everything above this line is real configuration.
const SAMPLE_ASSETS = [
  {
    code: 'POD-T01',
    registrationNo: 'JH 12 AB GP',
    vin: 'SAMPLE0000000T01',
    typeCode: 'TRUCK_TRACTOR',
    make: 'Scania', model: 'R460',
    year: 2019,
    tareMassKg: 8200, maxMassKg: 25000, maxCombinationMassKg: 56000,
    odometerKm: 412_500,
  },
  {
    code: 'POD-C01',
    registrationNo: 'JH 34 CD GP',
    vin: 'SAMPLE0000000C01',
    typeCode: 'CAR_CARRIER',
    make: 'Henred', model: 'Car carrier 8-unit',
    year: 2020,
    tareMassKg: 9500, maxMassKg: 24000, maxCombinationMassKg: null,
    odometerKm: 0,
  },
];

const SAMPLE_DRIVER = {
  code: 'DRV-001',
  fullName: 'Tendai Moyo',
  phoneE164: '+27820000001',
  email: 'driver1@pod.example',
};

const POLICIES = [
  { code: 'SAFETY_POLICY',    title: 'Road safety policy',       rtmsElement: 'MANAGEMENT_COMMITMENT' as RtmsElement,
    body: 'POD is committed to operating a safe, legal and roadworthy fleet. Management provides the resources needed to meet the RTMS standard and reviews safety performance monthly.' },
  { code: 'SUBSTANCE_POLICY', title: 'Substance abuse policy',   rtmsElement: 'DRIVER_WELLNESS' as RtmsElement,
    body: 'No driver may operate a POD vehicle under the influence of alcohol or drugs. Testing may be carried out at any time. Every driver acknowledges this policy annually.' },
  { code: 'FATIGUE_POLICY',   title: 'Driver fatigue management policy', rtmsElement: 'DRIVER_WELLNESS' as RtmsElement,
    body: 'Maximum 15 hours on duty in any 24-hour period, maximum 90 hours in any rolling 7 days, and a break of at least 30 minutes after every 4 hours of driving.' },
  { code: 'LOAD_POLICY',      title: 'Load management policy',   rtmsElement: 'LOAD_MANAGEMENT' as RtmsElement,
    body: 'No vehicle leaves a loading point above its permissible maximum mass. Every trip is weighed and recorded, and monthly overloading percentage is reported to management.' },
];

// Objectives & targets — the measurable half of element 1, scored by the
// monthly rollup.
function safetyObjectives(now: Date) {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), 11, 31));
  return [
    { title: 'Overloading below 1% of trips', metric: 'OVERLOADING_PCT', targetValue: 1,  unit: '%',     rtmsElement: 'LOAD_MANAGEMENT' as RtmsElement, periodStart, periodEnd },
    { title: 'Zero fatal incidents',          metric: 'FATAL_INCIDENTS', targetValue: 0,  unit: 'count', rtmsElement: 'INCIDENT_MANAGEMENT' as RtmsElement, periodStart, periodEnd },
    { title: 'Compliance items 100% valid',   metric: 'COMPLIANCE_PCT',  targetValue: 100, unit: '%',    rtmsElement: 'MONITORING_REVIEW' as RtmsElement, periodStart, periodEnd },
    { title: 'Preventive services on time',   metric: 'SERVICE_ON_TIME', targetValue: 95, unit: '%',     rtmsElement: 'VEHICLE_FITNESS' as RtmsElement, periodStart, periodEnd },
  ];
}

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

export async function seedRtms(prisma: PrismaClient) {
  // ── Lookups ──────────────────────────────────────────────────────────
  for (const [i, t] of ASSET_TYPES.entries()) {
    await prisma.assetType.upsert({
      where: { code: t.code },
      update: { sortOrder: i },
      create: { ...t, sortOrder: i },
    });
  }

  for (const [i, k] of COMPLIANCE_KINDS.entries()) {
    await prisma.complianceKind.upsert({
      where: { code: k.code },
      // Behavioural flags are re-asserted on every seed; `name` is left alone
      // so an admin rename survives.
      update: {
        sortOrder: i,
        ownerType: k.ownerType,
        requiredForOperation: k.requiredForOperation,
        rtmsElement: k.rtmsElement,
      },
      create: { ...k, sortOrder: i },
    });
  }

  for (const [i, s] of WORK_ORDER_STATUSES.entries()) {
    await prisma.workOrderStatus.upsert({
      where: { code: s.code }, update: { sortOrder: i, isTerminal: s.isTerminal }, create: { ...s, sortOrder: i },
    });
  }
  for (const [i, s] of TRIP_STATUSES.entries()) {
    await prisma.tripStatus.upsert({
      where: { code: s.code }, update: { sortOrder: i, isTerminal: s.isTerminal }, create: { ...s, sortOrder: i },
    });
  }
  for (const [i, s] of INCIDENT_STATUSES.entries()) {
    await prisma.incidentStatus.upsert({
      where: { code: s.code }, update: { sortOrder: i, isTerminal: s.isTerminal }, create: { ...s, sortOrder: i },
    });
  }
  for (const [i, c] of INCIDENT_CATEGORIES.entries()) {
    await prisma.incidentCategory.upsert({
      where: { code: c.code }, update: { sortOrder: i }, create: { ...c, sortOrder: i },
    });
  }
  for (const [i, item] of INSPECTION_ITEMS.entries()) {
    await prisma.inspectionItemDef.upsert({
      where: { code: item.code },
      update: { sortOrder: i, critical: item.critical, category: item.category },
      create: { ...item, sortOrder: i },
    });
  }

  // ── Policies (versioned; a new version is a new row) ─────────────────
  for (const p of POLICIES) {
    const existing = await prisma.policy.findFirst({
      where: { code: p.code }, orderBy: { version: 'desc' },
    });
    if (!existing) {
      await prisma.policy.create({
        data: { ...p, version: 1, effectiveFrom: new Date() },
      });
    }
  }

  for (const o of safetyObjectives(new Date())) {
    const existing = await prisma.safetyObjective.findFirst({
      where: { metric: o.metric, periodStart: o.periodStart },
    });
    if (!existing) await prisma.safetyObjective.create({ data: o });
  }

  // ── Sample fleet ─────────────────────────────────────────────────────
  const kindByCode = Object.fromEntries(
    (await prisma.complianceKind.findMany()).map((k) => [k.code, k]),
  );

  for (const a of SAMPLE_ASSETS) {
    const type = await prisma.assetType.findUniqueOrThrow({ where: { code: a.typeCode } });
    const { typeCode, ...rest } = a;
    const asset = await prisma.asset.upsert({
      where: { code: a.code },
      update: {},
      create: { ...rest, typeId: type.id },
    });

    // A maintenance plan: whichever of 25 000 km / 6 months falls first.
    const plan = await prisma.maintenancePlan.findFirst({ where: { assetId: asset.id } });
    if (!plan && !type.isTrailer) {
      await prisma.maintenancePlan.create({
        data: {
          assetId: asset.id,
          intervalKm: 25_000,
          intervalMonths: 6,
          lastServiceOdoKm: asset.odometerKm - 18_000,
          lastServiceDate: daysFromNow(-120),
          nextDueOdoKm: asset.odometerKm + 7_000,
          nextDueDate: daysFromNow(62),
        },
      });
    }

    // Compliance items — deliberately spread across VALID / DUE_SOON /
    // EXPIRED so the RAG dashboard and the gate have something to show on
    // day one. `status` is left at its default: the engine derives it.
    const assetItems: Array<[string, number, string]> = type.isTrailer
      ? [['VEHICLE_LICENCE', 210, 'LIC-C01-2026'], ['COF', 12, 'COF-C01-2026'], ['INSURANCE', 300, 'INS-88213']]
      : [['VEHICLE_LICENCE', 240, 'LIC-T01-2026'], ['COF', 95, 'COF-T01-2026'],
         ['INSURANCE', 300, 'INS-88212'], ['CBRTA_PERMIT', -6, 'CBRTA-4471']];

    for (const [code, inDays, reference] of assetItems) {
      const kind = kindByCode[code];
      if (!kind) continue;
      const exists = await prisma.complianceItem.findFirst({
        where: { assetId: asset.id, kindId: kind.id, archivedAt: null },
      });
      if (exists) continue;
      await prisma.complianceItem.create({
        data: {
          ownerType: 'ASSET',
          assetId: asset.id,
          kindId: kind.id,
          reference,
          issuedOn: daysFromNow(inDays - 365),
          expiresOn: daysFromNow(inDays),
        },
      });
    }
  }

  const driver = await prisma.driver.upsert({
    where: { code: SAMPLE_DRIVER.code },
    update: {},
    create: { ...SAMPLE_DRIVER, hiredOn: daysFromNow(-800) },
  });

  const driverItems: Array<[string, number, string]> = [
    ['DRIVER_LICENCE', 400, 'DL-8841220'],
    ['PRDP',            25, 'PRDP-449120'],   // DUE_SOON — exercises the amber path
    ['MEDICAL',        150, 'MED-2026-114'],
    ['PASSPORT',       900, 'ZN1234567'],
    ['SUBSTANCE_ACK',  200, 'ACK-2026'],
  ];
  for (const [code, inDays, reference] of driverItems) {
    const kind = kindByCode[code];
    if (!kind) continue;
    const exists = await prisma.complianceItem.findFirst({
      where: { driverId: driver.id, kindId: kind.id, archivedAt: null },
    });
    if (exists) continue;
    await prisma.complianceItem.create({
      data: {
        ownerType: 'DRIVER',
        driverId: driver.id,
        kindId: kind.id,
        reference,
        issuedOn: daysFromNow(inDays - 365),
        expiresOn: daysFromNow(inDays),
      },
    });
  }

  const counts = {
    assetTypes: await prisma.assetType.count(),
    complianceKinds: await prisma.complianceKind.count(),
    inspectionItems: await prisma.inspectionItemDef.count(),
    assets: await prisma.asset.count(),
    drivers: await prisma.driver.count(),
    complianceItems: await prisma.complianceItem.count(),
    policies: await prisma.policy.count(),
  };
  console.log('Seeded RTMS fleet & compliance:', counts);
  console.log('  NOTE: sample vehicle registrations, VINs and driver details are placeholders.');
}
