import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Placeholder reference data so the board renders before the first real import.
// The importer replaces/extends these from Sheet2's actual lookup lists.
const STATUSES: Array<{ name: string; isTerminal?: boolean }> = [
  { name: 'Deposit paid' },
  { name: 'Purchased' },
  { name: 'Documents in progress' },
  { name: 'In transit' },
  { name: 'At border' },
  { name: 'Cleared' },
  { name: 'Ready for delivery' },
  { name: 'Delivered', isTerminal: true },
];

const LOCATIONS: Array<{ name: string; country?: string }> = [
  { name: 'Supplier (SA)', country: 'ZA' },
  { name: 'Clearing agent', country: 'ZA' },
  { name: 'Beitbridge border', country: 'ZW' },
  { name: 'Harare depot', country: 'ZW' },
  { name: 'With customer', country: 'ZW' },
];

// Pilot accounts. Everyone starts with the same default password and should
// change it via /auth/change-password on first login.
const DEFAULT_PASSWORD = 'ChangeMe123!';
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
  for (const [i, s] of STATUSES.entries()) {
    await prisma.dealStatus.upsert({
      where: { name: s.name },
      update: { sortOrder: i },
      create: { name: s.name, sortOrder: i, isTerminal: s.isTerminal ?? false },
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

  console.log('Seeded reference data and users.');
  console.log(`Default password for all seeded users: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
