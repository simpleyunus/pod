import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { seedRtms } from './seed-rtms';

const prisma = new PrismaClient();

// Placeholder reference data so the board renders before the first real import.
// The importer replaces/extends these from Sheet2's actual lookup lists.
// stalledAfterDays: how long a car may sit in this stage before it is chased.
// Explicit per stage because the stages are not comparable — customs takes
// weeks, a handover should take days. New stages default to 10.
const STATUSES: Array<{ name: string; isTerminal?: boolean; stalledAfterDays?: number }> = [
  { name: 'Deposit paid',          stalledAfterDays: 7 },
  { name: 'Purchased',             stalledAfterDays: 10 },
  { name: 'Documents in progress', stalledAfterDays: 21 },
  { name: 'In transit',            stalledAfterDays: 7 },
  { name: 'At border',             stalledAfterDays: 14 },
  { name: 'Cleared',               stalledAfterDays: 5 },
  { name: 'Ready for delivery',    stalledAfterDays: 4 },
  { name: 'Delivered', isTerminal: true },
];

const LOCATIONS: Array<{ name: string; country?: string }> = [
  { name: 'Supplier (SA)', country: 'ZA' },
  { name: 'Clearing agent', country: 'ZA' },
  { name: 'Beitbridge border', country: 'ZW' },
  { name: 'Harare depot', country: 'ZW' },
  { name: 'With customer', country: 'ZW' },
];

// Pilot accounts. Everyone starts with the same password and should change it
// via /auth/change-password on first login.
//
// The fallback below is published in this repository, so it is refused in
// production — the same stance main.ts takes on JWT_SECRET. Set SEED_PASSWORD
// when seeding anything reachable from outside your machine.
const DEFAULT_PASSWORD = process.env.SEED_PASSWORD ?? 'ChangeMe123!';
const USERS: Array<{ username: string; fullName: string; email: string; role: Role }> = [
  { username: 'owner',     fullName: 'POD Owner',  email: 'owner@pod.example',     role: 'OWNER' },
  { username: 'admin',     fullName: 'POD Admin',  email: 'admin@pod.example',     role: 'ADMIN' },
  { username: 'theo',      fullName: 'Theo',       email: 'theo@pod.example',      role: 'CONSULTANT' },
  { username: 'farai',     fullName: 'Farai',      email: 'farai@pod.example',     role: 'CONSULTANT' },
  { username: 'armstrong', fullName: 'Armstrong',  email: 'armstrong@pod.example', role: 'CONSULTANT' },
  { username: 'juliet',    fullName: 'Juliet',     email: 'juliet@pod.example',    role: 'CONSULTANT' },
  { username: 'viewer',    fullName: 'Front Desk', email: 'viewer@pod.example',    role: 'VIEWER' },
];

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.env.SEED_PASSWORD) {
    throw new Error(
      'SEED_PASSWORD must be set when seeding in production — the default is public.',
    );
  }

  for (const [i, s] of STATUSES.entries()) {
    await prisma.dealStatus.upsert({
      where: { name: s.name },
      update: { sortOrder: i, ...(s.stalledAfterDays && { stalledAfterDays: s.stalledAfterDays }) },
      create: {
        name: s.name,
        sortOrder: i,
        isTerminal: s.isTerminal ?? false,
        ...(s.stalledAfterDays && { stalledAfterDays: s.stalledAfterDays }),
      },
    });
  }

  for (const [i, l] of LOCATIONS.entries()) {
    await prisma.location.upsert({
      where: { name: l.name },
      update: { sortOrder: i },
      create: { name: l.name, country: l.country, sortOrder: i },
    });
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      // Backfill username/role on users that existed before local auth;
      // the password hash is only filled in below where none exists yet,
      // so a password someone already changed is never overwritten.
      update: { username: u.username, role: u.role },
      create: { ...u, passwordHash },
    });
    await prisma.user.updateMany({
      where: { email: u.email, passwordHash: null },
      data: { passwordHash },
    });
  }

  await seedRtms(prisma);

  console.log('Seeded reference data and users.');
  if (process.env.SEED_PASSWORD) {
    console.log('Seeded users with the password supplied in SEED_PASSWORD.');
  } else {
    console.log(`Default password for all seeded users: ${DEFAULT_PASSWORD}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
