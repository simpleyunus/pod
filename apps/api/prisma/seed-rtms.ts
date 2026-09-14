import { PrismaClient, ComplianceOwnerType, RtmsElement } from '@prisma/client';

// RTMS Fleet & Compliance seed data.
//
// Everything here is a LOOKUP TABLE first: statuses, checklist items and
// compliance kinds are admin-editable rows, not hardcoded enums, exactly as
// DealStatus/Location already are. Re-running is safe — every write upserts
// on a unique code, so admin edits to `name`/`sortOrder` survive a re-seed
// while the behavioural flags stay authoritative.

// R1 "Vehicle Type (e.g., truck, trailer, crane etc.)" — the form's own words.
const ASSET_TYPES = [
  { code: 'TRUCK', name: 'Truck', isTrailer: false },
  { code: 'TRAILER', name: 'Trailer', isTrailer: true },
  { code: 'CRANE', name: 'Crane', isTrailer: false },
  { code: 'RIGID', name: 'Rigid vehicle', isTrailer: false },
  { code: 'LDV', name: 'Light delivery vehicle', isTrailer: false },
];

// Every kind here is traceable to a toolkit document. `requiredForOperation`
// is what the assignment gate reads, so admins change what blocks a trip
// without a code change.
const COMPLIANCE_KINDS: Array<{
  code: string;
  name: string;
  ownerType: ComplianceOwnerType;
  leadDaysDueSoon: number;
  requiredForOperation: boolean;
  rtmsElement: RtmsElement;
}> = [
  // Vehicle — R2 Licence Schedule has exactly two expiry columns.
  { code: 'VEHICLE_LICENCE', name: 'Vehicle licence',            ownerType: 'ASSET',  leadDaysDueSoon: 30, requiredForOperation: true,  rtmsElement: 'VEHICLE_FITNESS' },
  { code: 'PERMIT',          name: 'Permit',                     ownerType: 'ASSET',  leadDaysDueSoon: 30, requiredForOperation: false, rtmsElement: 'VEHICLE_FITNESS' },
  { code: 'COF',             name: 'Certificate of Fitness',     ownerType: 'ASSET',  leadDaysDueSoon: 30, requiredForOperation: true,  rtmsElement: 'VEHICLE_FITNESS' },
  { code: 'CBRTA_PERMIT',    name: 'CBRTA cross-border permit',  ownerType: 'ASSET',  leadDaysDueSoon: 45, requiredForOperation: false, rtmsElement: 'JOURNEY_MANAGEMENT' },
  // CBRTA operator card — carried with the cross-border permit.
  { code: 'OPERATOR_CARD',   name: 'Cross-border operator card', ownerType: 'ASSET',  leadDaysDueSoon: 45, requiredForOperation: false, rtmsElement: 'JOURNEY_MANAGEMENT' },
  // Manual 4.12 Insurance Provision.
  { code: 'INSURANCE',       name: 'Insurance cover',            ownerType: 'ASSET',  leadDaysDueSoon: 30, requiredForOperation: false, rtmsElement: 'VEHICLE_FITNESS' },
  // R11 "Next service due".
  { code: 'SERVICE_DUE',     name: 'Service due',                ownerType: 'ASSET',  leadDaysDueSoon: 14, requiredForOperation: false, rtmsElement: 'VEHICLE_FITNESS' },

  // Driver — R16 licence schedule, manual 4.14 PrDP, R15 medical schedule.
  { code: 'DRIVER_LICENCE',  name: 'Driving licence',            ownerType: 'DRIVER', leadDaysDueSoon: 30, requiredForOperation: true,  rtmsElement: 'DRIVER_WELLNESS' },
  { code: 'PRDP',            name: 'Professional Driving Permit', ownerType: 'DRIVER', leadDaysDueSoon: 30, requiredForOperation: true, rtmsElement: 'DRIVER_WELLNESS' },
  { code: 'MEDICAL',         name: 'Medical certificate',        ownerType: 'DRIVER', leadDaysDueSoon: 30, requiredForOperation: true,  rtmsElement: 'DRIVER_WELLNESS' },
  // Cross-border: no valid passport, no Beitbridge crossing. 60-day lead
  // because renewal is slow — a month's warning is not enough.
  { code: 'PASSPORT',        name: 'Passport',                   ownerType: 'DRIVER', leadDaysDueSoon: 60, requiredForOperation: true,  rtmsElement: 'DRIVER_WELLNESS' },
  // Manual 4.14: defensive driver training on a bi-annual basis (module M1).
  { code: 'TRAINING_DUE',    name: 'Driver training due',        ownerType: 'DRIVER', leadDaysDueSoon: 30, requiredForOperation: false, rtmsElement: 'DRIVER_WELLNESS' },
  // One-time induction on joining, distinct from the recurring training above.
  { code: 'INDUCTION',       name: 'Driver induction',           ownerType: 'DRIVER', leadDaysDueSoon: 30, requiredForOperation: false, rtmsElement: 'DRIVER_WELLNESS' },
  // P6 Substance Abuse Policy acknowledgement.
  { code: 'SUBSTANCE_ACK',   name: 'Substance policy acknowledgement', ownerType: 'DRIVER', leadDaysDueSoon: 30, requiredForOperation: false, rtmsElement: 'DRIVER_WELLNESS' },
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
// Pre-trip checklist items.
//
// R14 (the company's own Pre-Trip Checklist) is referenced by P5 and the
// manual but is NOT present in the toolkit folder, so these items are
// DERIVED from the minimum safety criteria P5 requires — National Road
// Traffic Act roadworthiness items plus the load checks in P4. They are
// ordinary lookup rows: when R14 turns up, an admin edits the list in the
// UI to match it exactly, with no code change and no migration.
//
// `critical: true` blocks departure at the gate, per P5's rule that a
// vehicle with a safety-compromising defect may not enter a public road.
const INSPECTION_ITEMS = [
  { code: 'TYRES',        label: 'Tyres — tread, condition and pressure',   category: 'Tyres and wheels', critical: true },
  { code: 'WHEEL_NUTS',   label: 'Wheel nuts, studs and rims',              category: 'Tyres and wheels', critical: true },
  { code: 'SPARE_WHEEL',  label: 'Spare wheel and changing equipment',      category: 'Tyres and wheels', critical: false },
  { code: 'SERVICE_BRAKE', label: 'Service brakes',                         category: 'Brakes',           critical: true },
  { code: 'PARK_BRAKE',   label: 'Parking brake',                           category: 'Brakes',           critical: true },
  { code: 'AIR_SYSTEM',   label: 'Air system — pressure and no leaks',      category: 'Brakes',           critical: true },
  { code: 'HEADLIGHTS',   label: 'Headlights, tail lights and brake lights', category: 'Lights and signals', critical: true },
  { code: 'INDICATORS',   label: 'Indicators and hazard lights',            category: 'Lights and signals', critical: true },
  { code: 'REFLECTORS',   label: 'Reflective tape, chevrons and reflectors', category: 'Lights and signals', critical: false },
  { code: 'STEERING',     label: 'Steering — free play and response',       category: 'Controls',         critical: true },
  { code: 'MIRRORS',      label: 'Mirrors — present, clean and adjusted',   category: 'Controls',         critical: true },
  { code: 'WIPERS',       label: 'Windscreen, wipers and washers',          category: 'Controls',         critical: false },
  { code: 'HORN',         label: 'Horn',                                    category: 'Controls',         critical: false },
  { code: 'SEATBELTS',    label: 'Seatbelts',                               category: 'Controls',         critical: true },
  { code: 'LEAKS',        label: 'No fuel, oil, water or air leaks',        category: 'Under the bonnet', critical: true },
  { code: 'OIL_WATER',    label: 'Engine oil and coolant levels',           category: 'Under the bonnet', critical: false },
  { code: 'BATTERY',      label: 'Battery secure and terminals clean',      category: 'Under the bonnet', critical: false },
  // P4 Safe Loading & Off-loading Procedure.
  { code: 'COUPLING',     label: 'Coupling / fifth wheel secure',           category: 'Coupling and load', critical: true },
  { code: 'LOAD_SECURED', label: 'Load secured — straps and lashings correct', category: 'Coupling and load', critical: true },
  { code: 'RAMPS_LOCKS',  label: 'Ramps and deck locks secure',             category: 'Coupling and load', critical: true },
  { code: 'CHOCKS',       label: 'Wheel chocks carried',                    category: 'Coupling and load', critical: false },
  { code: 'EXTINGUISHER', label: 'Fire extinguisher present and charged',   category: 'Safety equipment', critical: true },
  { code: 'TRIANGLES',    label: 'Red warning triangles',                   category: 'Safety equipment', critical: true },
  { code: 'FIRST_AID',    label: 'First aid kit',                           category: 'Safety equipment', critical: false },
  { code: 'PPE',          label: 'PPE — reflective vest and safety shoes',  category: 'Safety equipment', critical: false },
  { code: 'LICENCE_DISC', label: 'Licence disc displayed and valid',        category: 'Documents',        critical: true },
  { code: 'DRIVER_DOCS',  label: "Driver's licence and PrDP carried",       category: 'Documents',        critical: true },
  { code: 'PERMITS',      label: 'Trip permits and load documentation',     category: 'Documents',        critical: true },
];

// P3: "accidents will also be categorized according to severity".
const INCIDENT_SEVERITIES = [
  { code: 'NEAR_MISS', name: 'Near miss' },
  { code: 'MINOR',     name: 'Minor' },
  { code: 'SERIOUS',   name: 'Serious' },
  { code: 'MAJOR',     name: 'Major' },
  { code: 'FATAL',     name: 'Fatal' },
];

// Manual 4.14 / module M1. "Bi-annual" is read here as every 24 months; if
// POD means twice a year, an admin changes refresherMonths to 6 in the UI.
const TRAINING_COURSES = [
  {
    code: 'M1',
    name: 'Defensive Driver Training (Module M1)',
    refresherMonths: 24,
    description: 'Basic defensive driver training programme, per the RTMS toolkit module M1.',
  },
];

// ── REAL DATA FROM POD'S RTMS TOOLKIT ────────────────────────────────────
// R1 Fleet List, verbatim. Mass is captured in kg because the gate compares
// kilograms; R1 and every printed register show tonnes.
const R1_FLEET = [
  {
    fleetNo: '1',
    yearModel: 2026,
    makeManufacturer: 'UD TRUCKS',
    registrationNo: 'MX87GSGP',
    vin: 'JPCZM30A1SS833657',
    typeCode: 'TRUCK',
    maxLoadingMassKg: 20_000, // R1 "20 TONNE"
    maxPassengers: 3,
    odometerKm: 0,
  },
  {
    fleetNo: '2',
    yearModel: 2026,
    // R1 gives the manufacturer; R2 describes the same unit as "8 CAR CARRIER".
    makeManufacturer: 'CLAYTON DESIGN & ENGINEERING',
    registrationNo: 'MY18SDGP',
    vin: 'AE9B227ABSDNB1129',
    typeCode: 'TRAILER',
    maxLoadingMassKg: 27_000, // R1 "27 TONNE"
    maxPassengers: null, // R1 "N/A"
    comments: '8 car carrier (R2 description)',
    odometerKm: 0,
  },
];

// R2 Licence Schedule — both units licensed to 31/03/2027.
const R2_LICENCES: Record<string, string> = {
  MX87GSGP: '2027-03-31',
  MY18SDGP: '2027-03-31',
};

// R16 Drivers Licence Schedule. The document records the issue date as
// 31/10/2025 and expiry as 30/10/2023 — expiry before issue, so the two
// columns were transposed on the form. Seeded the corrected way round; the
// licence is still expired against today's date, which is the truth POD
// needs to see rather than a number that merely looks tidy.
const R16_DRIVER = {
  employeeNo: '1',
  surname: 'Musvari',
  firstName: 'Mark',
  licenceNumber: '01/200813PNN0008',
  licenceIssuedOn: '2023-10-30',
  licenceExpiresOn: '2025-10-31',
};

// ── PLACEHOLDER DATES — TEST DATA, NOT FROM THE TOOLKIT ──────────────────
// The toolkit carries no PrDP column, no medical dates, and no COF, CBRTA or
// insurance expiries. These stand in so every path is exercisable while POD
// is still testing: one item in each of VALID, DUE_SOON and EXPIRED, so the
// RAG dashboard, the reminders engine and the assignment gate all have
// something real to act on.
//
// Replace them with POD's actual certificates before the pilot. Each one is
// written with reference "TEST-…" so they are trivial to find and clear:
//   DELETE FROM "ComplianceItem" WHERE reference LIKE 'TEST-%';
const PLACEHOLDER_EXPIRIES: Array<{
  owner: 'ASSET' | 'DRIVER';
  registrationNo?: string;
  kind: string;
  reference: string;
  issuedInDays: number;
  expiresInDays: number;
}> = [
  // Driver — R16 already gives a real (expired) licence, so these fill the gaps.
  { owner: 'DRIVER', kind: 'PRDP',      reference: 'TEST-PRDP-0001',    issuedInDays: -340, expiresInDays: 25 },  // DUE_SOON
  { owner: 'DRIVER', kind: 'MEDICAL',   reference: 'TEST-MED-0001',     issuedInDays: -215, expiresInDays: 150 }, // VALID
  // Vehicles.
  { owner: 'ASSET', registrationNo: 'MX87GSGP', kind: 'COF',           reference: 'TEST-COF-MX87',   issuedInDays: -350, expiresInDays: 15 },  // DUE_SOON
  { owner: 'ASSET', registrationNo: 'MX87GSGP', kind: 'CBRTA_PERMIT',  reference: 'TEST-CBRTA-MX87', issuedInDays: -100, expiresInDays: -8 },  // EXPIRED
  { owner: 'ASSET', registrationNo: 'MX87GSGP', kind: 'INSURANCE',     reference: 'TEST-INS-MX87',   issuedInDays: -60,  expiresInDays: 300 }, // VALID
  { owner: 'ASSET', registrationNo: 'MY18SDGP', kind: 'COF',           reference: 'TEST-COF-MY18',   issuedInDays: -200, expiresInDays: 210 }, // VALID
  { owner: 'ASSET', registrationNo: 'MY18SDGP', kind: 'INSURANCE',     reference: 'TEST-INS-MY18',   issuedInDays: -60,  expiresInDays: 300 }, // VALID
];

// R5 Risk Assessment ships pre-populated with POD's eight standard hazards.
const R5_HAZARDS: Array<{ hazardIdentified: string; impact: string }> = [
  { hazardIdentified: 'Vehicles overloaded', impact: 'Vehicle does not brake as expected, thus will not be able to stop timeously in an emergency. Vehicle damaged due to excessive strain on engine and components' },
  { hazardIdentified: 'Unlicensed Vehicles', impact: 'Insurer may repudiate claim in the event of an accident. Legal liability' },
  { hazardIdentified: 'Travelling at unsafe speeds', impact: 'Vehicle is more likely to lose control/crash' },
  { hazardIdentified: 'Using unsafe vehicles', impact: 'Vehicle is more likely to lose control/crash' },
  { hazardIdentified: 'Drivers distracted – use of mobile phones', impact: 'Driver may lose control of vehicle' },
  { hazardIdentified: 'Drivers intoxicated (alcohol/drugs)', impact: 'Driver may cause an accident' },
  { hazardIdentified: 'Driver falls asleep or lacks focus due fatigue', impact: 'Driver may lose control of vehicle' },
  { hazardIdentified: 'Unsafe driving behaviours e.g., unsafe following distance', impact: 'May result in an accident/crash' },
];

// R3 Trip Mass Record — the two trips already on POD's form.
const R3_TRIPS = [
  { date: '2026-08-15', registrationNo: 'MX87GSGP', massLoadedKg: 7_400 },
  { date: '2026-08-18', registrationNo: 'MX87GSGP', massLoadedKg: 11_700 },
];

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
  // These lookups carry vocabulary straight out of the toolkit (R1's vehicle
  // types, the register names on R2/R15/R16), so the document is authoritative
  // and the seed asserts `name`. A stale name from an earlier seed otherwise
  // prints into the register and stops matching POD's paperwork.
  for (const [i, t] of ASSET_TYPES.entries()) {
    await prisma.assetType.upsert({
      where: { code: t.code },
      update: { sortOrder: i, name: t.name, isTrailer: t.isTrailer },
      create: { ...t, sortOrder: i },
    });
  }
  for (const [i, k] of COMPLIANCE_KINDS.entries()) {
    await prisma.complianceKind.upsert({
      where: { code: k.code },
      update: {
        sortOrder: i, name: k.name, ownerType: k.ownerType,
        requiredForOperation: k.requiredForOperation, rtmsElement: k.rtmsElement,
      },
      create: { ...k, sortOrder: i },
    });
  }
  for (const [i, x] of WORK_ORDER_STATUSES.entries())
    await prisma.workOrderStatus.upsert({ where: { code: x.code }, update: { sortOrder: i, isTerminal: x.isTerminal }, create: { ...x, sortOrder: i } });
  for (const [i, x] of TRIP_STATUSES.entries())
    await prisma.tripStatus.upsert({ where: { code: x.code }, update: { sortOrder: i, isTerminal: x.isTerminal }, create: { ...x, sortOrder: i } });
  for (const [i, x] of INCIDENT_STATUSES.entries())
    await prisma.incidentStatus.upsert({ where: { code: x.code }, update: { sortOrder: i, isTerminal: x.isTerminal }, create: { ...x, sortOrder: i } });
  for (const [i, x] of INCIDENT_CATEGORIES.entries())
    await prisma.incidentCategory.upsert({ where: { code: x.code }, update: { sortOrder: i }, create: { ...x, sortOrder: i } });
  for (const [i, x] of INCIDENT_SEVERITIES.entries())
    await prisma.incidentSeverity.upsert({ where: { code: x.code }, update: { sortOrder: i }, create: { ...x, sortOrder: i } });
  for (const [i, x] of INSPECTION_ITEMS.entries())
    await prisma.inspectionItemDef.upsert({ where: { code: x.code }, update: { sortOrder: i, critical: x.critical, category: x.category }, create: { ...x, sortOrder: i } });
  for (const [i, c] of TRAINING_COURSES.entries())
    await prisma.trainingCourse.upsert({ where: { code: c.code }, update: { sortOrder: i, refresherMonths: c.refresherMonths }, create: { ...c, sortOrder: i } });

  // ── Policies P1–P6 (versioned; a new version is a new row) ────────────
  for (const pol of POLICIES) {
    const existing = await prisma.policy.findFirst({ where: { code: pol.code }, orderBy: { version: 'desc' } });
    if (!existing) await prisma.policy.create({ data: { ...pol, version: 1, effectiveFrom: new Date() } });
  }
  for (const o of safetyObjectives(new Date())) {
    const existing = await prisma.safetyObjective.findFirst({ where: { metric: o.metric, periodStart: o.periodStart } });
    if (!existing) await prisma.safetyObjective.create({ data: o });
  }

  // ── R5 Risk Assessment with POD's eight standard hazards ─────────────
  let risk = await prisma.riskAssessment.findFirst({ where: { title: 'POD Logistics transport risk assessment' } });
  if (!risk) {
    risk = await prisma.riskAssessment.create({
      data: {
        title: 'POD Logistics transport risk assessment',
        scope: 'All aspects of the operation that can affect the safety of other road users (RTMS element 2).',
        rtmsElement: 'RISK_MANAGEMENT',
        assessedOn: new Date(),
        hazards: { create: R5_HAZARDS.map((h, i) => ({ ...h, sortOrder: i })) },
      },
    });
  }

  const kindByCode = Object.fromEntries((await prisma.complianceKind.findMany()).map((k) => [k.code, k]));
  const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  const addItem = async (
    owner: { assetId?: string; driverId?: string },
    code: string,
    reference: string | null,
    issuedOn: Date | null,
    expiresOn: Date | null,
  ) => {
    const kind = kindByCode[code];
    if (!kind) return;
    const exists = await prisma.complianceItem.findFirst({
      where: { ...owner, kindId: kind.id, archivedAt: null },
    });
    if (exists) return;
    await prisma.complianceItem.create({
      data: { ownerType: kind.ownerType, ...owner, kindId: kind.id, reference, issuedOn, expiresOn },
    });
  };

  // ── R1 Fleet List + R2 Licence Schedule ──────────────────────────────
  const assetByReg: Record<string, string> = {};
  for (const a of R1_FLEET) {
    const type = await prisma.assetType.findUniqueOrThrow({ where: { code: a.typeCode } });
    const { typeCode, ...rest } = a;
    const asset = await prisma.asset.upsert({
      where: { registrationNo: a.registrationNo },
      update: {},
      create: { ...rest, typeId: type.id },
    });
    assetByReg[a.registrationNo] = asset.id;

    const licenceExpiry = R2_LICENCES[a.registrationNo];
    if (licenceExpiry) await addItem({ assetId: asset.id }, 'VEHICLE_LICENCE', null, null, d(licenceExpiry));

    // R11 maintenance schedule. Trailers are serviced too (manual 4.10:
    // "The service schedule is also applicable to trailers").
    const plan = await prisma.maintenancePlan.findFirst({ where: { assetId: asset.id } });
    if (!plan) {
      await prisma.maintenancePlan.create({
        data: {
          assetId: asset.id,
          intervalKm: type.isTrailer ? null : 25_000,
          intervalMonths: 6,
          lastServiceDate: new Date(),
          lastServiceOdoKm: asset.odometerKm,
        },
      });
    }
  }

  // ── R16 Drivers Licence Schedule ─────────────────────────────────────
  const { licenceNumber, licenceIssuedOn, licenceExpiresOn, ...driverFields } = R16_DRIVER;
  const driver = await prisma.driver.upsert({
    where: { employeeNo: R16_DRIVER.employeeNo },
    update: {},
    create: driverFields,
  });
  await addItem({ driverId: driver.id }, 'DRIVER_LICENCE', licenceNumber, d(licenceIssuedOn), d(licenceExpiresOn));

  // Placeholder expiries so the module is fully exercisable during testing.
  let placeholders = 0;
  for (const ph of PLACEHOLDER_EXPIRIES) {
    const owner =
      ph.owner === 'DRIVER'
        ? { driverId: driver.id }
        : ph.registrationNo && assetByReg[ph.registrationNo]
          ? { assetId: assetByReg[ph.registrationNo] }
          : null;
    if (!owner) continue;
    await addItem(owner, ph.kind, ph.reference, daysFromNow(ph.issuedInDays), daysFromNow(ph.expiresInDays));
    placeholders++;
  }

  // ── R3 Trip Mass Record: the two trips already on the form ───────────
  const plannedStatus = await prisma.tripStatus.findUnique({ where: { code: 'DELIVERED' } });
  for (const [i, t] of R3_TRIPS.entries()) {
    const assetId = assetByReg[t.registrationNo];
    if (!assetId || !plannedStatus) continue;
    const reference = `TRIP-2026-${String(i + 1).padStart(4, '0')}`;
    const existing = await prisma.assignment.findUnique({ where: { reference } });
    if (existing) continue;
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
    const assignment = await prisma.assignment.create({
      data: {
        reference,
        assetId,
        driverId: driver.id,
        statusId: plannedStatus.id,
        actualDepartureAt: d(t.date),
        actualArrivalAt: d(t.date),
        gateDecision: 'PASS',
        gateCheckedAt: d(t.date),
      },
    });
    await prisma.tripMassRecord.create({
      data: {
        assignmentId: assignment.id,
        assetId,
        date: d(t.date),
        massLoadedKg: t.massLoadedKg,
        overloaded: t.massLoadedKg > asset.maxLoadingMassKg, // R3 "Overloaded (Yes/No)"
        permissibleMaxKg: asset.maxLoadingMassKg,
      },
    });
  }

  // Rows from an earlier seed that the toolkit does not contain are
  // deactivated rather than deleted — a lookup may already be referenced by
  // a historical record, and RTMS evidence is never rewritten in place. They
  // vanish from every dropdown; an admin can revive one if POD actually uses it.
  const deactivateStale = async (
    delegate: { updateMany: (a: any) => Promise<{ count: number }> },
    keep: string[],
  ) => (await delegate.updateMany({ where: { code: { notIn: keep }, active: true }, data: { active: false } })).count;

  const staleDeactivated =
    (await deactivateStale(prisma.assetType, ASSET_TYPES.map((x) => x.code))) +
    (await deactivateStale(prisma.complianceKind, COMPLIANCE_KINDS.map((x) => x.code))) +
    (await deactivateStale(prisma.inspectionItemDef, INSPECTION_ITEMS.map((x) => x.code))) +
    (await deactivateStale(prisma.incidentCategory, INCIDENT_CATEGORIES.map((x) => x.code))) +
    (await deactivateStale(prisma.incidentSeverity, INCIDENT_SEVERITIES.map((x) => x.code)));

  const counts = {
    assetTypes: await prisma.assetType.count({ where: { active: true } }),
    complianceKinds: await prisma.complianceKind.count({ where: { active: true } }),
    inspectionItems: await prisma.inspectionItemDef.count({ where: { active: true } }),
    assets: await prisma.asset.count(),
    drivers: await prisma.driver.count(),
    complianceItems: await prisma.complianceItem.count(),
    hazards: await prisma.hazard.count(),
    trips: await prisma.assignment.count(),
    massRecords: await prisma.tripMassRecord.count(),
    policies: await prisma.policy.count(),
    trainingCourses: await prisma.trainingCourse.count(),
  };
  console.log('Seeded RTMS from POD toolkit (R1, R2, R3, R5, R16, P1-P6, M1):', counts);
  if (staleDeactivated) console.log(`  Deactivated ${staleDeactivated} lookup row(s) not present in the toolkit.`);
  console.log('  Pre-trip checklist items are DERIVED from P5/P4 + NRTA minimums — R14 is not in the toolkit folder.');
  console.log(`  ⚠ ${placeholders} PLACEHOLDER expiry dates seeded (PrDP, medical, COF, CBRTA, insurance).`);
  console.log("    These are TEST DATA, not from the toolkit. Clear them with:");
  console.log("    DELETE FROM \"ComplianceItem\" WHERE reference LIKE 'TEST-%';");
}
