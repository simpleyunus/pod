// R15 and R16 both split the driver's name into Surname and Name columns, so
// that is how the Driver model stores it. The UI and the registers still need
// a single display string, and Prisma has no computed columns, so the join
// happens here — one definition rather than a dozen template literals.

export interface NameParts {
  surname: string;
  firstName: string;
}

/** "Mark Musvari" — natural reading order, for prose and the UI. */
export const driverName = (d: NameParts) => `${d.firstName} ${d.surname}`.trim();

/** "Musvari, Mark" — the sort order R15/R16 list drivers in. */
export const driverNameFiled = (d: NameParts) => `${d.surname}, ${d.firstName}`.trim();

/** Adds a `fullName` to a driver row (or to a nested `driver`) for the client. */
export function withDriverName<T extends NameParts>(d: T): T & { fullName: string } {
  return { ...d, fullName: driverName(d) };
}

// Asset identity as R1/R11/R12 print it: fleet number first, registration
// second.
export const assetLabel = (a: { fleetNo: string; registrationNo: string }) =>
  `${a.fleetNo} · ${a.registrationNo}`;

/** Kilograms as the registers show them: R1 "20 TONNE", R3 "7.4 TONNE". */
export function tonnes(kg: number | null | undefined, dp = 1): string {
  if (kg === null || kg === undefined) return '—';
  const t = kg / 1000;
  return `${Number.isInteger(t) ? t.toFixed(0) : t.toFixed(dp)} TONNE`;
}
