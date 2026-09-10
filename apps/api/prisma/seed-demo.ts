import { PrismaClient } from '@prisma/client';

// Demo data for the RTMS screens.
//
// seed-rtms.ts carries the real POD toolkit: two vehicles, one driver, R5's
// hazards, R3's two August trips. That is the truth of the business, but it
// leaves most registers empty, and an empty register teaches nobody what the
// screen is for.
//
// This file fills every RTMS page with plausible cross-border haulage so the
// system can be demonstrated and tested. It is NOT toolkit data and must not
// be confused with it, so every row it writes carries a "demo_" id. That makes
// it exactly reversible:
//
//   npx ts-node prisma/seed-demo.ts --clear
//
// Re-running is safe: every write upserts on the id, and dates are relative to
// today so the traffic lights keep showing a spread of green, amber and red
// however long the data sits there.

const prisma = new PrismaClient();

const DAY = 86_400_000;
/** A date `n` days from now — negative for the past. Time-of-day is normalised. */
const at = (n: number, hour = 9) => {
  const d = new Date(Date.now() + n * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};

// Deletion order matters: children before parents, and CorrectiveAction first
// because it points at incidents, findings and fines alike.
const CLEAR_ORDER = [
  'correctiveAction', 'auditFinding', 'audit',
  'incidentPhoto', 'incident',
  'inspectionResult', 'inspection', 'workOrder',
  'tripMassRecord', 'assignmentGateCheck', 'assignmentLeg', 'speedTrend', 'fine',
  'assignment',
  'routeAcknowledgement', 'routeRiskAssessment',
  'policyAcknowledgement', 'trainingRecord', 'driverDutyRecord',
  'tyreRecord', 'maintenancePlan', 'complianceItem',
  'asset', 'driver', 'carrier', 'trainingCourse',
] as const;

async function clear() {
  const removed: Record<string, number> = {};
  for (const model of CLEAR_ORDER) {
    const { count } = await (prisma as any)[model].deleteMany({
      where: { id: { startsWith: 'demo_' } },
    });
    if (count) removed[model] = count;
  }
  console.log('Cleared demo data:', removed);
}

// ─────────────────────────── the data ───────────────────────────

const CARRIERS = [
  { id: 'demo_car_01', name: 'Zambezi Logistics',      contactName: 'Prosper Mutasa', phoneE164: '+263772004411', email: 'ops@zambezilogistics.co.zw', fleetSize: 18, routes: 'JHB–Harare, JHB–Bulawayo', ratePerKm: 24.5, complianceNotes: 'RTMS certified, audit on file (expires next March).' },
  { id: 'demo_car_02', name: 'Kalahari Freight',       contactName: 'Lerato Sekhu',   phoneE164: '+27822007733', email: 'dispatch@kalaharifreight.co.za', fleetSize: 34, routes: 'JHB–Gaborone, JHB–Lusaka', ratePerKm: 22.0, complianceNotes: 'Insurance certificate to be re-supplied each January.' },
  { id: 'demo_car_03', name: 'Limpopo Carriers',       contactName: 'Ayanda Nkosi',   phoneE164: '+27834451209', email: 'ayanda@limpopocarriers.co.za', fleetSize: 7,  routes: 'Durban port–JHB', ratePerKm: 19.75, complianceNotes: 'Sub-contract only; no cross-border permits.' },
];

const COURSES = [
  { id: 'demo_crs_01', code: 'M2', name: 'Load securing and restraint',      refresherMonths: 24, sortOrder: 2, description: 'Lashing, chocking and deck-lock practice for car carriers.' },
  { id: 'demo_crs_02', code: 'M3', name: 'Fatigue awareness and management', refresherMonths: 12, sortOrder: 3, description: 'Hours-of-work limits, rest planning and self-assessment (P2).' },
  { id: 'demo_crs_03', code: 'M4', name: 'Incident scene and first aid',     refresherMonths: 36, sortOrder: 4, description: 'Scene safety, SAPS reporting and basic first aid (P3).' },
  { id: 'demo_crs_04', code: 'M5', name: 'Cross-border documentation',       refresherMonths: null, sortOrder: 5, description: 'CBRTA permits, SAD500 and border procedure. One-off induction.' },
];

const DRIVERS = [
  { id: 'demo_drv_01', employeeNo: '101', surname: 'Chikuni',  firstName: 'Tapiwa',      phoneE164: '+263772118840', hiredOn: at(-1180), comments: 'Long-haul, Harare corridor. Nominated first-aider.' },
  { id: 'demo_drv_02', employeeNo: '102', surname: 'Ncube',    firstName: 'Sipho',       phoneE164: '+27824419006',  hiredOn: at(-760),  chronicCondition: 'Hypertension — controlled, six-monthly review', comments: 'Cleared to drive; medical reviewed six-monthly per R15.' },
  { id: 'demo_drv_03', employeeNo: '103', surname: 'Moyo',     firstName: 'Blessing',    phoneE164: '+263775530112', hiredOn: at(-420),  comments: 'PrDP renewal submitted — awaiting collection. Off the road until it clears.' },
  { id: 'demo_drv_04', employeeNo: '104', surname: 'Dlamini',  firstName: 'Thabo',       phoneE164: '+27836620418',  hiredOn: at(-2100), comments: 'Senior driver; mentors new intake on the Beitbridge run.' },
  { id: 'demo_drv_05', employeeNo: '105', surname: 'Banda',    firstName: 'Kudakwashe',  phoneE164: '+260977410336', hiredOn: at(-300),  comments: 'Lusaka corridor. Zambian residence permit on file.' },
  { id: 'demo_drv_06', employeeNo: '106', surname: 'Sithole',  firstName: 'Farai',       phoneE164: '+263712884570', hiredOn: at(-95),   comments: 'New intake — induction refresher outstanding.' },
];

// [driverId, kindCode, reference, issuedDaysAgo, expiresInDays]
// The spread is deliberate: one driver fully compliant, one due soon, one
// expired and blocked at the gate, so the RAG columns are not all one colour.
const DRIVER_DOCS: Array<[string, string, string, number, number]> = [
  ['demo_drv_01', 'DRIVER_LICENCE', '02/450918TNC0041', -900, 420],
  ['demo_drv_01', 'PRDP',           'PRDP-2024-118840', -400, 330],
  ['demo_drv_01', 'MEDICAL',        'MED-TC-9981',      -120, 245],
  ['demo_drv_01', 'PASSPORT',       'FN664201',         -1500, 640],
  ['demo_drv_01', 'INDUCTION',      'IND-2025-101',     -300, 430],
  ['demo_drv_01', 'SUBSTANCE_ACK',  'SUB-2025-101',     -300, 430],

  ['demo_drv_02', 'DRIVER_LICENCE', '02/331207SPN0018', -1100, 300],
  ['demo_drv_02', 'PRDP',           'PRDP-2024-419006', -350, 380],
  ['demo_drv_02', 'MEDICAL',        'MED-TC-10442',     -160, 18],   // due soon
  ['demo_drv_02', 'PASSPORT',       'A04918822',        -900, 520],
  ['demo_drv_02', 'INDUCTION',      'IND-2025-102',     -260, 470],

  ['demo_drv_03', 'DRIVER_LICENCE', '02/770412BLM0093', -700, 260],
  ['demo_drv_03', 'PRDP',           'PRDP-2023-530112', -800, -22],  // EXPIRED — blocks the gate
  ['demo_drv_03', 'MEDICAL',        'MED-TC-10771',     -200, 160],
  ['demo_drv_03', 'PASSPORT',       'FN881043',         -1200, 390],
  ['demo_drv_03', 'INDUCTION',      'IND-2025-103',     -180, 550],

  ['demo_drv_04', 'DRIVER_LICENCE', '02/110630THD0007', -1400, 510],
  ['demo_drv_04', 'PRDP',           'PRDP-2025-620418', -180, 545],
  ['demo_drv_04', 'MEDICAL',        'MED-TC-9330',      -90,  275],
  ['demo_drv_04', 'PASSPORT',       'A02277451',        -1700, 41],  // due soon (60-day lead)
  ['demo_drv_04', 'INDUCTION',      'IND-2024-104',     -600, 130],
  ['demo_drv_04', 'SUBSTANCE_ACK',  'SUB-2025-104',     -220, 510],

  ['demo_drv_05', 'DRIVER_LICENCE', '02/920518KUB0055', -1000, 24],  // due soon
  ['demo_drv_05', 'PRDP',           'PRDP-2025-410336', -140, 585],
  ['demo_drv_05', 'MEDICAL',        'MED-TC-11208',     -70,  295],
  ['demo_drv_05', 'PASSPORT',       'ZN2210087',        -600, 810],
  ['demo_drv_05', 'INDUCTION',      'IND-2025-105',     -90,  640],

  ['demo_drv_06', 'DRIVER_LICENCE', '02/041129FRS0126', -500, 640],
  ['demo_drv_06', 'PRDP',           'PRDP-2025-884570', -80,  650],
  ['demo_drv_06', 'MEDICAL',        'MED-TC-11554',     -60,  305],
  ['demo_drv_06', 'PASSPORT',       'FN992217',         -400, 940],
  ['demo_drv_06', 'INDUCTION',      'IND-2026-106',     -95,  21],   // due soon — new intake's refresher
];

const ASSETS = [
  { id: 'demo_ast_01', fleetNo: '3', registrationNo: 'KJ42MTGP', makeManufacturer: 'MERCEDES-BENZ', yearModel: 2023, vin: 'WDB93403010L845221', typeCode: 'TRUCK_TRACTOR', maxLoadingMassKg: 26000, maxPassengers: 2, odometerKm: 418_340, comments: 'Actros 2645 — primary Harare corridor horse.' },
  { id: 'demo_ast_02', fleetNo: '4', registrationNo: 'LR88NCGP', makeManufacturer: 'SCANIA',        yearModel: 2022, vin: 'YS2R4X20005412887', typeCode: 'TRUCK_TRACTOR', maxLoadingMassKg: 26000, maxPassengers: 2, odometerKm: 612_905, comments: 'R460 — high mileage, watch service interval.' },
  { id: 'demo_ast_03', fleetNo: '5', registrationNo: 'HN73PBGP', makeManufacturer: 'AFRIT',         yearModel: 2021, vin: 'AA9CC1830M1004417', typeCode: 'CAR_CARRIER',   maxLoadingMassKg: 24000, maxPassengers: null, odometerKm: 0, comments: '8-car double-deck carrier.' },
  { id: 'demo_ast_04', fleetNo: '6', registrationNo: 'JD19RKGP', makeManufacturer: 'AFRIT',         yearModel: 2024, vin: 'AA9CC1830P1009982', typeCode: 'CAR_CARRIER',   maxLoadingMassKg: 24000, maxPassengers: null, odometerKm: 0, comments: '8-car double-deck carrier — newest unit.' },
  { id: 'demo_ast_05', fleetNo: '7', registrationNo: 'FT56SVGP', makeManufacturer: 'TOYOTA',        yearModel: 2023, vin: 'AHTKB3CD402741550', typeCode: 'BAKKIE',        maxLoadingMassKg: 1000,  maxPassengers: 5, odometerKm: 96_220, comments: 'Hilux 2.8 GD-6 — recovery and border runner.' },
];

const ASSET_DOCS: Array<[string, string, string, number, number]> = [
  ['demo_ast_01', 'VEHICLE_LICENCE', 'LIC-KJ42MTGP-26', -180, 200],
  ['demo_ast_01', 'COF',             'COF-KJ42MTGP-26', -150, 215],
  ['demo_ast_01', 'INSURANCE',       'POL-8842119',     -200, 165],
  ['demo_ast_01', 'OPERATOR_CARD',   'OPC-334211',      -300, 430],
  ['demo_ast_01', 'CBRTA_PERMIT',    'CB-2026-11840',   -120, 240],

  ['demo_ast_02', 'VEHICLE_LICENCE', 'LIC-LR88NCGP-26', -300, 65],
  ['demo_ast_02', 'COF',             'COF-LR88NCGP-26', -340, 25],   // due soon
  ['demo_ast_02', 'INSURANCE',       'POL-8842120',     -200, 165],
  ['demo_ast_02', 'OPERATOR_CARD',   'OPC-334212',      -300, 430],
  ['demo_ast_02', 'CBRTA_PERMIT',    'CB-2026-11841',   -120, 240],
  ['demo_ast_02', 'SERVICE_DUE',     'SVC-LR88-Q3',     -80,  9],    // due soon

  ['demo_ast_03', 'VEHICLE_LICENCE', 'LIC-HN73PBGP-26', -240, 125],
  ['demo_ast_03', 'COF',             'COF-HN73PBGP-25', -400, -14],  // EXPIRED — blocks the gate
  ['demo_ast_03', 'INSURANCE',       'POL-8842121',     -200, 165],

  ['demo_ast_04', 'VEHICLE_LICENCE', 'LIC-JD19RKGP-26', -60,  305],
  ['demo_ast_04', 'COF',             'COF-JD19RKGP-26', -55,  310],
  ['demo_ast_04', 'INSURANCE',       'POL-8842122',     -200, 165],

  ['demo_ast_05', 'VEHICLE_LICENCE', 'LIC-FT56SVGP-26', -110, 255],
  ['demo_ast_05', 'COF',             'COF-FT56SVGP-26', -100, 265],
  ['demo_ast_05', 'INSURANCE',       'POL-8842123',     -200, 165],
];

const ROUTES = [
  {
    id: 'demo_rra_01', name: 'Johannesburg → Harare via Beitbridge', reviewDueOn: at(160),
    routeHazards: 'N1 north: heavy truck congestion Polokwane–Musina, especially 15:00–19:00. Stray livestock between Makhado and Musina after dark. Beitbridge approach: informal traders and pedestrians in the roadway.',
    siteEntryInstructions: 'Report to the clearing agent office on the SA side before joining the queue. Do not enter the bridge without a stamped SAD500 and gate pass.',
    siteHazards: 'Congested marshalling yard, poor lighting after 18:00, uneven surface. Reversing hazard around the scanner bay.',
    siteExitInstructions: 'Zim side: proceed to the ZIMRA scanner, then the police checkpoint. Retain all stamped copies.',
    returnJourney: 'Return empty via the same crossing. Overnight at the Bubi truck stop if the border queue exceeds four hours.',
    specialInstructions: 'No night driving between 23:00 and 04:00 (P2). Call the controller on arrival at Musina and again once released on the Zim side.',
    emergencyContacts: 'POD control +27 82 555 0110 · Beitbridge clearing agent +27 15 530 0044 · ZRP Beitbridge +263 286 22222',
  },
  {
    id: 'demo_rra_02', name: 'Johannesburg → Lusaka via Chirundu', reviewDueOn: at(24),
    routeHazards: 'Escarpment descent to Chirundu — sustained gradient, brake fade risk; use engine braking. Elephant crossings in the Zambezi valley at dusk. Fuel scarce between Karoi and Chirundu.',
    siteEntryInstructions: 'Chirundu is a one-stop border post: single declaration on the Zambian side. Join the commercial lane, not the light-vehicle lane.',
    siteHazards: 'Narrow bridge, no pedestrian separation. Long stationary queues in high ambient temperatures — carry drinking water.',
    siteExitInstructions: 'Clear the weighbridge before departing Chirundu. Retain the weighbridge ticket as R3 evidence.',
    returnJourney: 'Return loaded where a backhaul is booked; otherwise empty via Chirundu. Rest stop at Makuti.',
    specialInstructions: 'Descend the escarpment in low range. Brake temperature check at the Makuti pull-off is mandatory.',
    emergencyContacts: 'POD control +27 82 555 0110 · Chirundu agent +260 97 741 0336 · ZP Chirundu +260 211 515 133',
  },
  {
    id: 'demo_rra_03', name: 'Durban port → Johannesburg', reviewDueOn: at(-11), // review overdue
    routeHazards: 'N3 Van Reenen: fog, steep gradients, frequent heavy-vehicle breakdowns. Truck hijacking hotspot Mooi River–Estcourt; do not stop on the shoulder.',
    siteEntryInstructions: 'Durban Car Terminal: booking reference required at the gate. PPE mandatory beyond the gatehouse.',
    siteHazards: 'Active straddle-carrier movement. Reversing onto the loading deck under marshal direction only.',
    siteExitInstructions: 'Weigh before leaving the terminal. Deck locks and lashings inspected by the marshal.',
    returnJourney: 'Return empty on the N3. Overnight at Harrismith if departure is after 16:00.',
    specialInstructions: 'Van Reenen descent in low gear. No stopping between Mooi River and Estcourt for any reason.',
    emergencyContacts: 'POD control +27 82 555 0110 · Durban terminal +27 31 361 8000 · SAPS 10111',
  },
];

// ─────────────────────────── the writer ───────────────────────────

async function main() {
  // Lookups the demo rows hang off. Everything here was created by
  // seed-rtms.ts; nothing below writes to a toolkit row.
  const [types, kinds, tripStatuses, woStatuses, incStatuses, incSeverities, incCategories, items, policies, locations] =
    await Promise.all([
      prisma.assetType.findMany(),
      prisma.complianceKind.findMany(),
      prisma.tripStatus.findMany(),
      prisma.workOrderStatus.findMany(),
      prisma.incidentStatus.findMany(),
      prisma.incidentSeverity.findMany(),
      prisma.incidentCategory.findMany(),
      prisma.inspectionItemDef.findMany({ where: { active: true } }),
      prisma.policy.findMany(),
      prisma.location.findMany(),
    ]);

  const byCode = <T extends { code: string }>(rows: T[]) =>
    new Map(rows.map((r) => [r.code, r]));
  const type = byCode(types), kind = byCode(kinds), trip = byCode(tripStatuses);
  const wo = byCode(woStatuses), inc = byCode(incStatuses), sev = byCode(incSeverities);
  const cat = byCode(incCategories), item = byCode(items), pol = byCode(policies);
  const loc = new Map(locations.map((l) => [l.name, l]));

  const need = (m: Map<string, any>, code: string, what: string) => {
    const row = m.get(code);
    if (!row) throw new Error(`${what} "${code}" is missing — run the RTMS seed first`);
    return row;
  };

  // ── Carriers, courses, drivers, vehicles ────────────────────────────────
  for (const c of CARRIERS) {
    await prisma.carrier.upsert({ where: { id: c.id }, create: c, update: c });
  }
  for (const c of COURSES) {
    await prisma.trainingCourse.upsert({ where: { id: c.id }, create: c, update: c });
  }
  for (const d of DRIVERS) {
    await prisma.driver.upsert({ where: { id: d.id }, create: d, update: d });
  }
  for (const a of ASSETS) {
    const { typeCode, ...rest } = a;
    const data = { ...rest, typeId: need(type, typeCode, 'Asset type').id };
    await prisma.asset.upsert({ where: { id: a.id }, create: data, update: data });
  }

  // ── Compliance items ────────────────────────────────────────────────────
  // status is left at its default here; recomputeStatuses() owns it, and the
  // seed calls the engine's own rule below rather than second-guessing it.
  let docNo = 0;
  const writeDoc = async (
    ownerType: 'DRIVER' | 'ASSET', ownerId: string,
    [, code, reference, issued, expires]: [string, string, string, number, number],
  ) => {
    const id = `demo_ci_${String(++docNo).padStart(3, '0')}`;
    const data = {
      ownerType,
      driverId: ownerType === 'DRIVER' ? ownerId : null,
      assetId: ownerType === 'ASSET' ? ownerId : null,
      kindId: need(kind, code, 'Compliance kind').id,
      reference,
      issuedOn: at(issued),
      expiresOn: at(expires),
    };
    await prisma.complianceItem.upsert({ where: { id }, create: { id, ...data }, update: data });
  };
  for (const row of DRIVER_DOCS) await writeDoc('DRIVER', row[0], row);
  for (const row of ASSET_DOCS) await writeDoc('ASSET', row[0], row);

  // ── Routes (R6) and driver acknowledgements ─────────────────────────────
  for (const r of ROUTES) {
    const data = {
      ...r,
      originLocationId: loc.get('Supplier (SA)')?.id ?? null,
      destinationLocationId: loc.get('Harare depot')?.id ?? null,
    };
    await prisma.routeRiskAssessment.upsert({ where: { id: r.id }, create: data, update: data });
  }
  // Deliberately partial: Moyo has never signed the Lusaka briefing, which is
  // what the "not acknowledged" state on the Routes tab is there to show.
  const ACKS: Array<[string, string, number]> = [
    ['demo_rra_01', 'demo_drv_01', -120], ['demo_rra_01', 'demo_drv_02', -95],
    ['demo_rra_01', 'demo_drv_04', -200], ['demo_rra_01', 'demo_drv_06', -40],
    ['demo_rra_02', 'demo_drv_05', -60],  ['demo_rra_02', 'demo_drv_01', -150],
    ['demo_rra_03', 'demo_drv_04', -220], ['demo_rra_03', 'demo_drv_02', -30],
  ];
  for (const [routeId, driverId, days] of ACKS) {
    const id = `demo_rack_${routeId.slice(-2)}_${driverId.slice(-2)}`;
    const data = { routeRiskAssessmentId: routeId, driverId, version: 1, acknowledgedAt: at(days) };
    await prisma.routeAcknowledgement.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  // ── Policy acknowledgements (P1–P6) ─────────────────────────────────────
  let ackNo = 0;
  for (const p of policies) {
    for (const d of DRIVERS) {
      // One gap per policy, so the register shows outstanding sign-offs.
      if (d.id === 'demo_drv_06' && p.code !== 'SAFETY_POLICY') continue;
      const id = `demo_pack_${String(++ackNo).padStart(3, '0')}`;
      const data = { policyId: p.id, driverId: d.id, acknowledgedAt: at(-60 - (ackNo % 90)) };
      await prisma.policyAcknowledgement.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
  }

  // ── Training records (M1–M5) ────────────────────────────────────────────
  const allCourses = await prisma.trainingCourse.findMany();
  let trNo = 0;
  for (const d of DRIVERS) {
    for (const c of allCourses) {
      if (d.id === 'demo_drv_06' && c.code !== 'M5') continue; // new intake, part-trained
      if (d.id === 'demo_drv_03' && c.code === 'M2') continue; // outstanding
      const completedOn = at(-30 - (trNo * 37) % 500);
      const id = `demo_tr_${String(++trNo).padStart(3, '0')}`;
      const data = {
        courseId: c.id, driverId: d.id, completedOn,
        expiresOn: c.refresherMonths
          ? new Date(completedOn.getTime() + c.refresherMonths * 30.44 * DAY)
          : null,
        trainerName: trNo % 2 ? 'DriveSafe Academy (Midrand)' : 'In-house — T. Dlamini',
        outcome: trNo % 5 === 0 ? 'Pass — 78%' : 'Pass — competent',
      };
      await prisma.trainingRecord.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
  }

  // ── Duty records (P2 fatigue) ───────────────────────────────────────────
  let dutyNo = 0;
  for (const d of DRIVERS.slice(0, 5)) {
    for (let day = 1; day <= 6; day++) {
      const on = at(-day, 5);
      // One deliberate breach: 11h driving with a short break, so the fatigue
      // check has something to fail on.
      const breach = d.id === 'demo_drv_02' && day === 2;
      const id = `demo_duty_${String(++dutyNo).padStart(3, '0')}`;
      const data = {
        driverId: d.id,
        onDutyAt: on,
        offDutyAt: new Date(on.getTime() + (breach ? 13 : 9 + (day % 3)) * 3_600_000),
        drivingMinutes: breach ? 660 : 380 + (day % 4) * 25,
        breakMinutes: breach ? 20 : 45 + (day % 3) * 15,
        notes: breach ? 'Border queue at Beitbridge overran; controller notified.' : null,
      };
      await prisma.driverDutyRecord.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
  }

  // ── Maintenance: plans, work orders, inspections, tyres ─────────────────
  const PLANS: Array<[string, string, number | null, number | null, number, number]> = [
    ['demo_mp_01', 'demo_ast_01', 25_000, 6,  393_000, -170], // 340 km overdue
    ['demo_mp_02', 'demo_ast_02', 25_000, 6,  590_000, -100], // 2 095 km to go
    ['demo_mp_03', 'demo_ast_03', null,   12, 0,       -300],
    ['demo_mp_04', 'demo_ast_04', null,   12, 0,       -55],
    ['demo_mp_05', 'demo_ast_05', 15_000, 12, 88_000,  -353], // due in ~11 days
  ];
  for (const [id, assetId, intervalKm, intervalMonths, lastOdo, lastDays] of PLANS) {
    const lastServiceDate = at(lastDays);
    const data = {
      assetId, name: 'Routine service', intervalKm, intervalMonths,
      lastServiceOdoKm: lastOdo, lastServiceDate,
      nextDueOdoKm: intervalKm ? lastOdo + intervalKm : null,
      nextDueDate: intervalMonths
        ? new Date(lastServiceDate.getTime() + intervalMonths * 30.44 * DAY)
        : null,
    };
    await prisma.maintenancePlan.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  // `roadworthiness` marks the jobs that bear on whether the vehicle is safe and
// legal to operate — brakes, air, lights, load securing. Element 3 counts only
// these. The windscreen chip and the PDI are deliberately routine, so the
// distinction is visible on the dashboard.
const WORK_ORDERS: Array<{ id: string; number: string; assetId: string; status: string; title: string; description: string; odometerKm?: number; parts?: number; labour?: number; supplier?: string; days: number; roadworthiness?: boolean }> = [
    { id: 'demo_wo_01', roadworthiness: true, number: 'WO-2026-0001', assetId: 'demo_ast_02', status: 'CLOSED',         title: 'Major service — 600 000 km',        description: 'Oil, filters, gearbox and diff oil, brake adjustment, full inspection.', odometerKm: 598_000, parts: 18_400, labour: 6_200, supplier: 'Scania Aeroton', days: -110 },
    { id: 'demo_wo_02', roadworthiness: true, number: 'WO-2026-0002', assetId: 'demo_ast_01', status: 'CLOSED',         title: 'Replace nearside headlamp',          description: 'Failed pre-trip check. Unit replaced and beam re-aimed.',                odometerKm: 411_200, parts: 2_150,  labour: 850,   supplier: 'Truck Electrics Kempton', days: -34 },
    { id: 'demo_wo_03', roadworthiness: true, number: 'WO-2026-0003', assetId: 'demo_ast_03', status: 'IN_PROGRESS',    title: 'Deck lock repair — upper deck rear', description: 'Lock will not seat. Carrier out of service until repaired and re-tested.', parts: 4_900, labour: 3_100, supplier: 'Afrit Service Centre', days: -6 },
    { id: 'demo_wo_04', roadworthiness: true, number: 'WO-2026-0004', assetId: 'demo_ast_02', status: 'AWAITING_PARTS', title: 'Air dryer cartridge',                description: 'Slow pressure build reported by driver. Cartridge on back-order.',       odometerKm: 612_400, parts: 3_250, labour: 900, supplier: 'Scania Aeroton', days: -12 },
    { id: 'demo_wo_05', roadworthiness: true, number: 'WO-2026-0005', assetId: 'demo_ast_05', status: 'APPROVED',       title: 'Front brake pads and discs',         description: 'Pads at wear limit at last service; approved for next workshop slot.',   odometerKm: 96_100, parts: 5_600, labour: 1_800, supplier: 'Toyota Midrand', days: -3 },
    { id: 'demo_wo_06', roadworthiness: false, number: 'WO-2026-0006', assetId: 'demo_ast_01', status: 'REQUESTED',      title: 'Windscreen chip repair',             description: 'Stone chip in the driver sight line — repair before it spreads.',        odometerKm: 418_300, days: -1 },
    { id: 'demo_wo_07', roadworthiness: false, number: 'WO-2026-0007', assetId: 'demo_ast_04', status: 'DONE',           title: 'Pre-delivery inspection',            description: 'New unit PDI: lashing points, ramps, lighting, brake test.',              parts: 0, labour: 2_400, supplier: 'Afrit Service Centre', days: -50 },
  ];
  for (const w of WORK_ORDERS) {
    const done = ['DONE', 'CLOSED'].includes(w.status);
    const started = done || ['IN_PROGRESS', 'AWAITING_PARTS'].includes(w.status);
    const data = {
      number: w.number, assetId: w.assetId, statusId: need(wo, w.status, 'Work order status').id,
      title: w.title, description: w.description, odometerKm: w.odometerKm ?? null,
      partsCost: w.parts ?? null, labourCost: w.labour ?? null, supplier: w.supplier ?? null,
      roadworthiness: w.roadworthiness ?? false,
      requestedAt: at(w.days),
      approvedAt: w.status === 'REQUESTED' ? null : at(w.days + 1),
      startedAt: started ? at(w.days + 2) : null,
      completedAt: done ? at(w.days + 4) : null,
      closedAt: w.status === 'CLOSED' ? at(w.days + 5) : null,
    };
    await prisma.workOrder.upsert({ where: { id: w.id }, create: { id: w.id, ...data }, update: data });
  }

  // Pre-trip checks (P5). The failing one is what raised WO-2026-0002.
  const INSPECTIONS: Array<{ id: string; assetId: string; driverId: string; days: number; odo: number; fail?: string; trip: string }> = [
    { id: 'demo_insp_01', assetId: 'demo_ast_01', driverId: 'demo_drv_01', days: -35, odo: 411_150, fail: 'HEADLIGHTS', trip: 'JHB → Harare, load 8 units' },
    { id: 'demo_insp_02', assetId: 'demo_ast_01', driverId: 'demo_drv_01', days: -12, odo: 417_020, trip: 'JHB → Harare, load 7 units' },
    { id: 'demo_insp_03', assetId: 'demo_ast_02', driverId: 'demo_drv_04', days: -9,  odo: 611_400, fail: 'AIR_SYSTEM', trip: 'JHB → Lusaka, load 8 units' },
    { id: 'demo_insp_04', assetId: 'demo_ast_05', driverId: 'demo_drv_02', days: -4,  odo: 96_180, trip: 'Border run — documents' },
    { id: 'demo_insp_05', assetId: 'demo_ast_04', driverId: 'demo_drv_05', days: -2,  odo: 0, trip: 'Durban → JHB, load 8 units' },
  ];
  for (const ins of INSPECTIONS) {
    const data = {
      assetId: ins.assetId, driverId: ins.driverId, performedAt: at(ins.days, 5),
      odometerKm: ins.odo || null, passed: !ins.fail, tripInformation: ins.trip,
      reportedToController: Boolean(ins.fail),
      defectsClearedAt: ins.fail ? at(ins.days + 1) : null,
      notes: ins.fail ? 'Defect raised with the workshop before departure.' : null,
    };
    await prisma.inspection.upsert({ where: { id: ins.id }, create: { id: ins.id, ...data }, update: data });

    // Twelve representative items per sheet rather than all thirty-eight —
    // enough to read as a real checklist without burying the failure.
    const sheet = items.slice(0, 12);
    for (const [i, def] of sheet.entries()) {
      const id = `${ins.id}_r${String(i).padStart(2, '0')}`;
      const failed = def.code === ins.fail;
      const data = {
        inspectionId: ins.id, itemId: def.id,
        answer: (failed ? 'NO' : 'YES') as 'YES' | 'NO',
        note: failed ? 'Defect — reported to controller, work order raised.' : null,
        workOrderId: failed && ins.id === 'demo_insp_01' ? 'demo_wo_02' : null,
      };
      await prisma.inspectionResult.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
  }

  const TYRES: Array<[string, string, string, string, number, boolean]> = [
    ['demo_tyre_01', 'demo_ast_01', 'Goodyear KMAX D 315/80R22.5', 'Left front',        -40, true],
    ['demo_tyre_02', 'demo_ast_01', 'Goodyear KMAX D 315/80R22.5', 'Right front',       -40, true],
    ['demo_tyre_03', 'demo_ast_02', 'Bridgestone M840 315/80R22.5', 'Left rear drive',  -22, false],
    ['demo_tyre_04', 'demo_ast_02', 'Bridgestone M840 315/80R22.5', 'Right rear drive', -22, false],
    ['demo_tyre_05', 'demo_ast_03', 'Continental HTR2 385/65R22.5', 'Axle 2 left',      -75, true],
    ['demo_tyre_06', 'demo_ast_05', 'Dunlop Grandtrek AT25 265/65R17', 'Left front',    -15, true],
  ];
  for (const [id, assetId, tyreFitted, tyrePosition, days, balanced] of TYRES) {
    const data = {
      assetId, tyreFitted, tyrePosition, date: at(days),
      reasonForFitment: days < -30 ? 'Worn to wear indicator' : 'Sidewall damage',
      balancingAlignmentDone: balanced,
      comments: balanced ? 'Balanced and aligned at fitment.' : 'Alignment booked for next service.',
    };
    await prisma.tyreRecord.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
  console.log('  fleet, drivers, compliance, routes, training and maintenance written');

  // ── Trips (R3/R4), legs, gate checks and mass records ───────────────────
  const TRIPS: Array<{
    id: string; reference: string; assetId: string; driverId: string; carrierId?: string;
    status: string; route?: string; from: string; to: string; depart: number; arrive: number;
    km: number; gate: 'PASS' | 'FAIL' | 'OVERRIDDEN'; gateFail?: [string, string, string];
    massKg?: number; over?: boolean; pod?: string;
  }> = [
    { id: 'demo_trp_01', reference: 'TRIP-2026-0101', assetId: 'demo_ast_01', driverId: 'demo_drv_01', status: 'DELIVERED',    route: 'demo_rra_01', from: 'Supplier (SA)', to: 'Harare depot',     depart: -28, arrive: -26, km: 1_128, gate: 'PASS', massKg: 21_400, pod: 'T. Marufu' },
    { id: 'demo_trp_02', reference: 'TRIP-2026-0102', assetId: 'demo_ast_01', driverId: 'demo_drv_01', status: 'DELIVERED',    route: 'demo_rra_01', from: 'Supplier (SA)', to: 'Harare depot',     depart: -14, arrive: -12, km: 1_128, gate: 'PASS', massKg: 19_800, pod: 'T. Marufu' },
    { id: 'demo_trp_03', reference: 'TRIP-2026-0103', assetId: 'demo_ast_02', driverId: 'demo_drv_04', carrierId: 'demo_car_02', status: 'DELIVERED', route: 'demo_rra_02', from: 'Supplier (SA)', to: 'Clearing agent', depart: -9, arrive: -6, km: 1_580, gate: 'OVERRIDDEN', gateFail: ['ASSET_SERVICE_DUE', 'Service due', 'Service interval exceeded by 900 km'], massKg: 23_100, pod: 'K. Phiri' },
    { id: 'demo_trp_04', reference: 'TRIP-2026-0104', assetId: 'demo_ast_04', driverId: 'demo_drv_05', status: 'IN_PROGRESS',  route: 'demo_rra_03', from: 'Clearing agent', to: 'Harare depot',    depart: -2, arrive: 1,  km: 640,  gate: 'PASS', massKg: 22_600 },
    { id: 'demo_trp_05', reference: 'TRIP-2026-0105', assetId: 'demo_ast_01', driverId: 'demo_drv_02', status: 'IN_PROGRESS',  route: 'demo_rra_01', from: 'Supplier (SA)', to: 'Beitbridge border', depart: -1, arrive: 1, km: 560, gate: 'PASS', massKg: 20_100 },
    { id: 'demo_trp_06', reference: 'TRIP-2026-0106', assetId: 'demo_ast_03', driverId: 'demo_drv_03', status: 'GATE_BLOCKED', route: 'demo_rra_01', from: 'Supplier (SA)', to: 'Harare depot',     depart: 1,  arrive: 3,  km: 1_128, gate: 'FAIL', gateFail: ['DRIVER_PRDP', 'Professional Driving Permit', 'Expired 22 days ago'] },
    { id: 'demo_trp_07', reference: 'TRIP-2026-0107', assetId: 'demo_ast_02', driverId: 'demo_drv_04', carrierId: 'demo_car_01', status: 'PLANNED', route: 'demo_rra_02', from: 'Supplier (SA)', to: 'Clearing agent', depart: 3, arrive: 6, km: 1_580, gate: 'PASS' },
    { id: 'demo_trp_08', reference: 'TRIP-2026-0108', assetId: 'demo_ast_04', driverId: 'demo_drv_06', status: 'PLANNED',      route: 'demo_rra_03', from: 'Clearing agent', to: 'Harare depot',    depart: 5,  arrive: 7,  km: 640,  gate: 'PASS' },
    { id: 'demo_trp_09', reference: 'TRIP-2026-0109', assetId: 'demo_ast_05', driverId: 'demo_drv_02', status: 'DELIVERED',    from: 'Harare depot', to: 'With customer',    depart: -20, arrive: -20, km: 41, gate: 'PASS', pod: 'N. Chirwa' },
    { id: 'demo_trp_10', reference: 'TRIP-2026-0110', assetId: 'demo_ast_02', driverId: 'demo_drv_01', carrierId: 'demo_car_03', status: 'CANCELLED', from: 'Supplier (SA)', to: 'Harare depot', depart: -18, arrive: -16, km: 1_128, gate: 'PASS' },
  ];

  // The board shows which car a trip is moving; without a deal behind it that
  // column is a row of dashes. Match on reference so this survives a re-seed.
  const dealRefs = ['POD-2026-0001', 'POD-2026-0002', 'POD-2026-0003', 'POD-2026-0004', 'POD-2026-0005', 'POD-2026-0006'];
  const deals = await prisma.deal.findMany({ where: { reference: { in: dealRefs } }, select: { id: true, reference: true } });
  const dealByRef = new Map(deals.map((d) => [d.reference, d.id]));
  const TRIP_DEAL: Record<string, string> = {
    demo_trp_01: 'POD-2026-0001', demo_trp_02: 'POD-2026-0002', demo_trp_03: 'POD-2026-0003',
    demo_trp_04: 'POD-2026-0004', demo_trp_05: 'POD-2026-0005', demo_trp_09: 'POD-2026-0006',
  };

  for (const t of TRIPS) {
    const started = ['IN_PROGRESS', 'DELIVERED'].includes(t.status);
    const done = t.status === 'DELIVERED';
    const data = {
      reference: t.reference, assetId: t.assetId, driverId: t.driverId,
      dealId: dealByRef.get(TRIP_DEAL[t.id]) ?? null,
      carrierId: t.carrierId ?? null, statusId: need(trip, t.status, 'Trip status').id,
      routeRiskAssessmentId: t.route ?? null,
      originLocationId: loc.get(t.from)?.id ?? null,
      destinationLocationId: loc.get(t.to)?.id ?? null,
      plannedDepartureAt: at(t.depart, 5), plannedArrivalAt: at(t.arrive, 16),
      actualDepartureAt: started ? at(t.depart, 6) : null,
      actualArrivalAt: done ? at(t.arrive, 15) : null,
      distanceKm: t.km,
      gateDecision: t.gate, gateCheckedAt: at(t.depart, 4),
      gateOverrideReason: t.gate === 'OVERRIDDEN'
        ? 'Service booked on arrival in Lusaka; risk accepted by the fleet manager for this leg only.'
        : null,
      podCapturedAt: done && t.pod ? at(t.arrive, 15) : null,
      podReceivedByName: done ? t.pod ?? null : null,
      podNotes: done && t.pod ? 'All units offloaded, no transit damage noted.' : null,
    };
    await prisma.assignment.upsert({ where: { id: t.id }, create: { id: t.id, ...data }, update: data });

    // Gate checks: the register of what was verified, not just the verdict.
    const CHECKS: Array<[string, string]> = [
      ['DRIVER_LICENCE', 'Driving licence'], ['DRIVER_PRDP', 'Professional Driving Permit'],
      ['DRIVER_MEDICAL', 'Medical certificate'], ['ASSET_COF', 'Certificate of Fitness'],
      ['ASSET_LICENCE', 'Vehicle licence'], ['FATIGUE_DAILY', 'Daily driving hours'],
      ['ROUTE_ACK', 'Route briefing acknowledged'], ['ASSET_SERVICE_DUE', 'Service due'],
    ];
    for (const [i, [code, label]] of CHECKS.entries()) {
      const failing = t.gateFail?.[0] === code;
      const id = `${t.id}_gc${i}`;
      const data = {
        assignmentId: t.id, code, label,
        passed: !failing,
        detail: failing ? t.gateFail![2] : null,
        checkedAt: at(t.depart, 4),
      };
      await prisma.assignmentGateCheck.upsert({ where: { id }, create: { id, ...data }, update: data });
    }

    // Two legs on the long-haul runs: the border is the natural break.
    const legs = t.km > 600
      ? [{ seq: 1, to: 'Beitbridge border', km: Math.round(t.km * 0.5) },
         { seq: 2, to: t.to, km: t.km - Math.round(t.km * 0.5) }]
      : [{ seq: 1, to: t.to, km: t.km }];
    for (const l of legs) {
      const id = `${t.id}_leg${l.seq}`;
      const data = {
        assignmentId: t.id, sequence: l.seq,
        fromLocationId: loc.get(l.seq === 1 ? t.from : 'Beitbridge border')?.id ?? null,
        toLocationId: loc.get(l.to)?.id ?? null,
        plannedAt: at(t.depart + l.seq, 12), distanceKm: l.km,
        arrivedAt: done ? at(t.depart + l.seq, 13) : null,
        notes: l.seq === 1 && t.km > 600 ? 'Border clearance and weighbridge.' : null,
      };
      await prisma.assignmentLeg.upsert({ where: { id }, create: { id, ...data }, update: data });
    }

    // R3 mass record. One trip is deliberately overloaded so R4's monthly
    // rollup and the overload column have something to report.
    if (t.massKg) {
      const asset = ASSETS.find((a) => a.id === t.assetId)!;
      const id = `${t.id}_mass`;
      const data = {
        assignmentId: t.id, assetId: t.assetId, date: at(t.depart, 7),
        massLoadedKg: t.massKg, passengersLoaded: null,
        overloaded: t.massKg > asset.maxLoadingMassKg,
        permissibleMaxKg: asset.maxLoadingMassKg, permissiblePassengers: asset.maxPassengers,
        comments: t.massKg > asset.maxLoadingMassKg
          ? 'Weighbridge ticket attached; one unit removed before departure.'
          : 'Weighed at the terminal before departure.',
      };
      await prisma.tripMassRecord.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
  }

  // ── Speed trends (R7) ───────────────────────────────────────────────────
  const SPEEDS: Array<[string, string, string, number, string, string]> = [
    ['demo_spd_01', 'demo_drv_01', 'demo_ast_01', -25, 'Consistent within limit; two brief overspeeds on the N1 descent past Louis Trichardt.', 'Discussed at the monthly driver meeting. No further action.'],
    ['demo_spd_02', 'demo_drv_04', 'demo_ast_02', -18, 'Repeated 15 km/h over the limit through the Musina 60 zone across three trips.', 'Formal counselling on 3 of this month; re-check next cycle. Corrective action raised.'],
    ['demo_spd_03', 'demo_drv_02', 'demo_ast_05', -11, 'No exceptions recorded this period.', 'Noted as good practice at the toolbox talk.'],
    ['demo_spd_04', 'demo_drv_05', 'demo_ast_04', -5,  'Two overspeeds on the Chirundu escarpment descent, both under braking.', 'Reminded to descend in low range; M2 refresher scheduled.'],
  ];
  for (const [id, driverId, assetId, days, speedTrend, actionsTaken] of SPEEDS) {
    const data = { driverId, assetId, date: at(days), speedTrend, actionsTaken };
    await prisma.speedTrend.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  // ── Fines (R10) ─────────────────────────────────────────────────────────
  const FINES: Array<[string, string, string, number, string, string, string]> = [
    ['demo_fine_01', 'demo_drv_04', 'demo_ast_02', -18, 'Exceeding the speed limit — 75 km/h in a 60 km/h zone, Musina.', 'Driver counselled and re-briefed on the route hazard sheet. Fine recovered from the driver per policy.', 'AARTO-04471982'],
    ['demo_fine_02', 'demo_drv_01', 'demo_ast_01', -62, 'Failure to display a valid licence disc — disc obscured by the sun visor.', 'Disc repositioned. All vehicles checked at the next pre-trip.', 'AARTO-04338117'],
    ['demo_fine_03', 'demo_drv_05', 'demo_ast_04', -7,  'Stopping in a prohibited area at the Chirundu approach.', 'Driver reminded of the queueing procedure in the R6 briefing.', 'ZP-CHR-2026-0884'],
  ];
  for (const [id, driverId, assetId, days, reason, actions, noticeNumber] of FINES) {
    const data = { driverId, assetId, date: at(days), reason, correctiveActionsTaken: actions, noticeNumber };
    await prisma.fine.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  // ── Incidents (R8) ──────────────────────────────────────────────────────
  const INCIDENTS: Array<{
    id: string; reference: string; days: number; assetId: string; driverId: string;
    assignmentId?: string; category: string; severity: string; status: string;
    fault?: 'DRIVER_FAULT' | 'THIRD_PARTY_FAULT' | 'SHARED' | 'UNDETERMINED';
    nearMiss?: boolean; description: string; cause: string;
    immediate?: string; underlying?: string; systemic?: string;
    where: string; injuries?: number; damage?: boolean; thirdParty?: boolean; saps?: string;
  }> = [
    {
      id: 'demo_inc_01', reference: 'INC-2026-0001', days: -74, assetId: 'demo_ast_02', driverId: 'demo_drv_04',
      category: 'COLLISION', severity: 'MINOR', status: 'CLOSED', fault: 'THIRD_PARTY_FAULT',
      description: 'Light delivery vehicle changed lanes into the trailer near the N1/N4 interchange, striking the rear offside mudguard.',
      cause: 'Third-party driver failed to check the blind spot before changing lanes.',
      immediate: 'Third-party lane change without observation.',
      underlying: 'Heavy congestion at the interchange in the evening peak.',
      systemic: 'Route timing put our vehicle in the interchange at the worst hour.',
      where: 'N1/N4 interchange, Pretoria', damage: true, thirdParty: true, saps: 'CAS 442/07/2026',
    },
    {
      id: 'demo_inc_02', reference: 'INC-2026-0002', days: -41, assetId: 'demo_ast_01', driverId: 'demo_drv_01',
      assignmentId: 'demo_trp_01', category: 'LOAD_SHIFT', severity: 'SERIOUS', status: 'ACTIONS_OPEN', fault: 'DRIVER_FAULT',
      description: 'Upper-deck lashing on the rear unit slackened in transit; the vehicle moved approximately 200 mm before it was noticed at the Musina stop.',
      cause: 'Ratchet not fully tensioned at loading; no mid-journey lashing check was carried out.',
      immediate: 'Lashing under-tensioned at the loading point.',
      underlying: 'No mid-journey lashing re-check in the journey plan.',
      systemic: 'The pre-trip sheet checks lashings once, at departure only.',
      where: 'N1 north, near Musina', damage: false,
    },
    {
      id: 'demo_inc_03', reference: 'INC-2026-0003', days: -23, assetId: 'demo_ast_05', driverId: 'demo_drv_02',
      category: 'NEAR_MISS', severity: 'NEAR_MISS', status: 'CLOSED', nearMiss: true, fault: 'UNDETERMINED',
      description: 'Pedestrian stepped into the roadway from between parked trucks on the Beitbridge approach. Driver braked and stopped short.',
      cause: 'Informal trading alongside the carriageway with no pedestrian barrier.',
      immediate: 'Pedestrian entered the roadway unseen.',
      underlying: 'No pedestrian separation on the border approach.',
      systemic: 'Route hazard sheet did not call out the trading area specifically.',
      where: 'Beitbridge approach road', damage: false,
    },
    {
      id: 'demo_inc_04', reference: 'INC-2026-0004', days: -12, assetId: 'demo_ast_02', driverId: 'demo_drv_04',
      assignmentId: 'demo_trp_03', category: 'BREAKDOWN', severity: 'MINOR', status: 'INVESTIGATING', fault: 'UNDETERMINED',
      description: 'Slow air pressure build on start-up at Makuti; vehicle held for two hours until pressure was reached.',
      cause: 'Suspected air dryer cartridge saturation. Work order raised.',
      immediate: 'Air dryer not purging correctly.',
      underlying: 'Cartridge past its service life.',
      where: 'Makuti rest stop, Zimbabwe', damage: false,
    },
    {
      id: 'demo_inc_05', reference: 'INC-2026-0005', days: -5, assetId: 'demo_ast_04', driverId: 'demo_drv_05',
      category: 'INJURY', severity: 'MINOR', status: 'ACTIONS_OPEN', fault: 'DRIVER_FAULT',
      description: 'Driver sustained a hand laceration while releasing a deck lock without gloves. Treated with the on-board first aid kit.',
      cause: 'PPE not worn for the task; deck lock edge burred.',
      immediate: 'Gloves not worn while handling the deck lock.',
      underlying: 'Burr on the lock edge had not been reported.',
      systemic: 'PPE is on the checklist but is not verified by anyone at loading.',
      where: 'Durban Car Terminal', injuries: 1, damage: false,
    },
    {
      id: 'demo_inc_06', reference: 'INC-2026-0006', days: -2, assetId: 'demo_ast_01', driverId: 'demo_drv_02',
      assignmentId: 'demo_trp_05', category: 'NEAR_MISS', severity: 'NEAR_MISS', status: 'REPORTED', nearMiss: true, fault: 'THIRD_PARTY_FAULT',
      description: 'Oncoming bus overtook on a blind rise near Makhado, forcing our driver onto the shoulder. No contact.',
      cause: 'Third-party overtaking manoeuvre in a no-overtaking zone.',
      where: 'N1 near Makhado', damage: false, thirdParty: true,
    },
  ];
  for (const i of INCIDENTS) {
    const data = {
      reference: i.reference, date: at(i.days, 11), assetId: i.assetId, driverId: i.driverId,
      assignmentId: i.assignmentId ?? null,
      description: i.description, cause: i.cause,
      categoryId: cat.get(i.category)?.id ?? null,
      statusId: need(inc, i.status, 'Incident status').id,
      severityId: sev.get(i.severity)?.id ?? null,
      faultCategory: i.fault ?? null, isNearMiss: i.nearMiss ?? false,
      sapsReportNumber: i.saps ?? null, sapsReportedAt: i.saps ? at(i.days, 14) : null,
      immediateCause: i.immediate ?? null, underlyingCause: i.underlying ?? null,
      systemicCause: i.systemic ?? null,
      locationText: i.where, injuries: i.injuries ?? 0,
      vehicleDamage: i.damage ?? false, thirdPartyInvolved: i.thirdParty ?? false,
      createdAt: at(i.days, 12),
    };
    await prisma.incident.upsert({ where: { id: i.id }, create: { id: i.id, ...data }, update: data });
  }

  // ── Audits (element 8) and findings ─────────────────────────────────────
  const AUDITS = [
    { id: 'demo_aud_01', reference: 'AUD-2025-02', scheduledFor: at(-210), conductedOn: at(-208), closedAt: at(-150), auditorName: 'M. van Wyk (RTMS lead auditor)', scope: 'Full RTMS SANS 1395 surveillance audit — all eight elements.', summary: 'Certification maintained. Three minor non-conformances raised, all closed within the agreed period.' },
    { id: 'demo_aud_02', reference: 'AUD-2026-01', scheduledFor: at(-30),  conductedOn: at(-28), closedAt: null,      auditorName: 'M. van Wyk (RTMS lead auditor)', scope: 'Elements 3, 5 and 6 — vehicle fitness, load management, journey management.', summary: 'One major non-conformance on load securing verification. Corrective actions in progress.' },
    { id: 'demo_aud_03', reference: 'AUD-2026-02', scheduledFor: at(62),   conductedOn: null,    closedAt: null,      auditorName: 'To be appointed', scope: 'Full surveillance audit — all eight elements.', summary: null },
  ];
  for (const a of AUDITS) {
    await prisma.audit.upsert({ where: { id: a.id }, create: a, update: a });
  }

  const FINDINGS: Array<{ id: string; auditId: string; element: any; conformity: any; description: string; evidence?: string }> = [
    { id: 'demo_af_01', auditId: 'demo_aud_01', element: 'VEHICLE_FITNESS',       conformity: 'MINOR_NON_CONFORMANCE', description: 'Two pre-trip inspection sheets in the sample were unsigned by the driver.', evidence: 'Sheets dated 14 and 19 of the sample month.' },
    { id: 'demo_af_02', auditId: 'demo_aud_01', element: 'DRIVER_WELLNESS',       conformity: 'MINOR_NON_CONFORMANCE', description: 'Medical certificate for one driver had lapsed by 11 days before renewal.', evidence: 'R15 medical schedule, employee 102.' },
    { id: 'demo_af_03', auditId: 'demo_aud_01', element: 'MONITORING_REVIEW',     conformity: 'OBSERVATION',           description: 'Management review minutes do not record attendance.', evidence: 'Review record for the previous period.' },
    { id: 'demo_af_04', auditId: 'demo_aud_01', element: 'MANAGEMENT_COMMITMENT', conformity: 'CONFORMS',              description: 'Policies signed by the accountable manager and displayed at the depot.' },
    { id: 'demo_af_05', auditId: 'demo_aud_02', element: 'LOAD_MANAGEMENT',       conformity: 'MAJOR_NON_CONFORMANCE', description: 'No documented verification that lashings are re-checked during long-haul journeys, despite a load-shift incident.', evidence: 'INC-2026-0002; P4 makes no provision for a mid-journey check.' },
    { id: 'demo_af_06', auditId: 'demo_aud_02', element: 'JOURNEY_MANAGEMENT',    conformity: 'MINOR_NON_CONFORMANCE', description: 'One route risk assessment is past its review date and still in use.', evidence: 'Durban port → Johannesburg briefing sheet.' },
    { id: 'demo_af_07', auditId: 'demo_aud_02', element: 'VEHICLE_FITNESS',       conformity: 'CONFORMS',              description: 'Licence and CoF schedule complete and current for the sampled vehicles.' },
  ];
  for (const f of FINDINGS) {
    const audit = AUDITS.find((a) => a.id === f.auditId)!;
    const data = {
      auditId: f.auditId, rtmsElement: f.element, conformity: f.conformity,
      description: f.description, evidence: f.evidence ?? null,
      createdAt: audit.conductedOn ?? audit.scheduledFor,
    };
    await prisma.auditFinding.upsert({ where: { id: f.id }, create: { id: f.id, ...data }, update: data });
  }

  // ── Corrective actions (R9) — the register that ties it all together ────
  const ACTIONS: Array<{ id: string; raised: number; source: any; incidentId?: string; findingId?: string; fineId?: string; driverId?: string; description: string; due: number; status: any; done?: number; notes?: string }> = [
    { id: 'demo_ca_01', raised: -206, source: 'AUDIT_FINDING', findingId: 'demo_af_01', description: 'Re-brief all drivers that the pre-trip sheet is invalid unless signed; controller to reject unsigned sheets.', due: -170, status: 'VERIFIED', done: -175, notes: 'Verified at the following audit — no unsigned sheets in the sample.' },
    { id: 'demo_ca_02', raised: -206, source: 'AUDIT_FINDING', findingId: 'demo_af_02', description: 'Bring medical renewals forward to 60 days before expiry and add them to the weekly compliance review.', due: -160, status: 'VERIFIED', done: -168 },
    { id: 'demo_ca_03', raised: -26, source: 'AUDIT_FINDING', findingId: 'demo_af_05', description: 'Amend P4 to require a lashing re-check at every scheduled stop, and add the check to the pre-trip sheet.', due: 12, status: 'IN_PROGRESS', notes: 'Draft policy revision with the fleet manager; checklist item to follow.' },
    { id: 'demo_ca_04', raised: -26, source: 'AUDIT_FINDING', findingId: 'demo_af_06', description: 'Review and re-issue the Durban port route briefing, then re-collect driver acknowledgements.', due: 5, status: 'OPEN' },
    { id: 'demo_ca_05', raised: -40, source: 'INCIDENT', incidentId: 'demo_inc_02', description: 'Re-train the driver on lashing tension and introduce a mid-journey lashing check at the Musina stop.', due: -8, status: 'DONE', done: -10, notes: 'M2 refresher completed; awaiting verification at the next audit.' },
    { id: 'demo_ca_06', raised: -22, source: 'INCIDENT', incidentId: 'demo_inc_03', description: 'Add the Beitbridge informal trading area to the route hazard sheet and brief all drivers on the corridor.', due: -3, status: 'DONE', done: -4 },
    { id: 'demo_ca_07', raised: -4, source: 'INCIDENT', incidentId: 'demo_inc_05', description: 'Deburr all deck-lock edges across both carriers and make glove use a verified item at loading.', due: -3, status: 'IN_PROGRESS', notes: 'Overdue: second carrier still to be done.' },
    { id: 'demo_ca_08', raised: -17, source: 'FINE', fineId: 'demo_fine_01', description: 'Counsel the driver on the Musina speed zone and re-check the next speed trend report.', due: -4, status: 'DONE', done: -6 },
    { id: 'demo_ca_09', raised: -2, source: 'FATIGUE_BREACH', driverId: 'demo_drv_02', description: 'Investigate the 11-hour driving day and agree a border-queue contingency with the controller.', due: 4, status: 'OPEN', notes: 'Raised from the P2 daily-hours check.' },
    { id: 'demo_ca_10', raised: -11, source: 'INSPECTION', description: 'Air dryer cartridge on WO-2026-0004 is on back-order — confirm the supplier lead time and keep the vehicle off long-haul.', due: -1, status: 'IN_PROGRESS', notes: 'Overdue: supplier has not confirmed a date.' },
  ];
  for (const a of ACTIONS) {
    const data = {
      sourceType: a.source,
      incidentId: a.incidentId ?? null, auditFindingId: a.findingId ?? null,
      fineId: a.fineId ?? null, driverId: a.driverId ?? null,
      description: a.description, dueDate: at(a.due), status: a.status,
      completedAt: a.done !== undefined ? at(a.done) : null,
      notes: a.notes ?? null,
      createdAt: at(a.raised),
    };
    await prisma.correctiveAction.upsert({ where: { id: a.id }, create: { id: a.id, ...data }, update: data });
  }

  console.log('  trips, gate checks, mass records, fines, incidents and audits written');

  const counts = {
    carriers: await prisma.carrier.count(), drivers: await prisma.driver.count(),
    assets: await prisma.asset.count(), complianceItems: await prisma.complianceItem.count(),
    routes: await prisma.routeRiskAssessment.count(), trips: await prisma.assignment.count(),
    gateChecks: await prisma.assignmentGateCheck.count(), massRecords: await prisma.tripMassRecord.count(),
    workOrders: await prisma.workOrder.count(), inspections: await prisma.inspection.count(),
    tyreRecords: await prisma.tyreRecord.count(), training: await prisma.trainingRecord.count(),
    dutyRecords: await prisma.driverDutyRecord.count(), fines: await prisma.fine.count(),
    incidents: await prisma.incident.count(), audits: await prisma.audit.count(),
    findings: await prisma.auditFinding.count(), correctiveActions: await prisma.correctiveAction.count(),
    speedTrends: await prisma.speedTrend.count(),
  };
  console.log('Demo data seeded:', counts);
  console.log('  Remove it all with:  npx ts-node prisma/seed-demo.ts --clear');
  console.log('  Then recompute the RAG:  POST /api/compliance/recompute');
}

const isClear = process.argv.includes('--clear');
(isClear ? clear() : main())
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
