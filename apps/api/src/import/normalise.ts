export interface NormalizeResult<T> {
  value: T | null;
  issue?: string;
}

export function normalizePhone(raw: unknown, defaultCountry = 'ZA'): NormalizeResult<string> {
  if (!raw || String(raw).trim() === '') return { value: null, issue: 'Phone number is missing' };
  let digits = String(raw).replace(/[\s\-().+]/g, '');
  // Already E.164
  if (/^\+\d{10,15}$/.test('+' + digits) && String(raw).trim().startsWith('+')) {
    return { value: String(raw).trim().replace(/\s/g, '') };
  }
  // Strip leading zeros
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);

  // ZW numbers: 9 digits after stripping
  // SA numbers: 9 digits after stripping
  const countryCode = defaultCountry === 'ZW' ? '263' : '27';
  if (digits.length === 9) {
    return { value: `+${countryCode}${digits}` };
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return { value: `+${digits}` };
  }
  return { value: null, issue: `Cannot parse phone '${raw}' — check country code` };
}

export function normalizePrice(raw: unknown): NormalizeResult<number> {
  if (!raw || String(raw).trim() === '') return { value: null, issue: 'Price is missing' };
  const cleaned = String(raw)
    .replace(/R\s*/gi, '')
    .replace(/ZAR\s*/gi, '')
    .replace(/USD\s*/gi, '')
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .trim();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return { value: null, issue: `Cannot parse price '${raw}'` };
  if (num < 0) return { value: null, issue: `Price cannot be negative: ${num}` };
  if (num > 10_000_000) return { value: null, issue: `Price ${num} seems implausibly large` };
  return { value: num };
}

export function normalizeDate(raw: unknown): NormalizeResult<string> {
  if (!raw || String(raw).trim() === '') return { value: null, issue: 'Date is missing' };

  // Excel serial date (number)
  if (typeof raw === 'number') {
    const ms = (raw - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return { value: d.toISOString().slice(0, 10) };
    return { value: null, issue: `Cannot parse Excel date serial ${raw}` };
  }

  const s = String(raw).trim();

  // ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return { value: s };
  }

  // DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const day = parseInt(d), month = parseInt(m), year = parseInt(y);
    if (month > 12) {
      // Must be MM/DD/YYYY since month > 12 is impossible
      const date = new Date(year, day - 1, month);
      if (!isNaN(date.getTime())) return { value: date.toISOString().slice(0, 10) };
    }
    if (day > 12) {
      // Must be DD/MM/YYYY
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) return { value: date.toISOString().slice(0, 10) };
    }
    // Ambiguous: assume DD/MM/YYYY (common in ZA/ZW)
    const date = new Date(year, month - 1, day);
    if (!isNaN(date.getTime())) {
      return { value: date.toISOString().slice(0, 10), issue: `Date '${s}' is ambiguous — assumed DD/MM/YYYY` };
    }
  }

  // Fallback
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return { value: fallback.toISOString().slice(0, 10) };

  return { value: null, issue: `Cannot parse date '${s}'` };
}

export const SYSTEM_FIELDS: Record<string, string> = {
  clientFullName: 'Client Full Name',
  phoneE164: 'Phone (E.164)',
  email: 'Email',
  country: 'Client Country',
  make: 'Vehicle Make',
  model: 'Vehicle Model',
  year: 'Year',
  colour: 'Colour',
  vin: 'VIN / Chassis',
  registrationNo: 'Registration No',
  sellingPrice: 'Selling Price',
  sellingCurrency: 'Currency',
  destinationCountry: 'Destination Country',
  destinationCity: 'Destination City',
  supplier: 'Supplier',
  expectedDeliveryDate: 'Expected Delivery',
  statusName: 'Status',
  consultantName: 'Consultant',
};

const REQUIRED_FIELDS = ['clientFullName', 'make', 'model'];

export function mapRow(
  rawObj: Record<string, unknown>,
  columnMap: Record<string, string>,
): { mapped: Record<string, unknown>; issues: Array<{ field: string; problem: string; suggestion?: string }>; status: 'PENDING' | 'NEEDS_REVIEW' } {
  const mapped: Record<string, unknown> = {};
  const issues: Array<{ field: string; problem: string; suggestion?: string }> = [];

  for (const [systemField, colHeader] of Object.entries(columnMap)) {
    if (!colHeader || colHeader === '__ignore__') continue;
    const raw = rawObj[colHeader];

    if (systemField === 'phoneE164') {
      const r = normalizePhone(raw);
      mapped[systemField] = r.value;
      if (r.issue) issues.push({ field: systemField, problem: r.issue });
    } else if (systemField === 'sellingPrice') {
      const r = normalizePrice(raw);
      mapped[systemField] = r.value;
      if (r.issue) issues.push({ field: systemField, problem: r.issue });
    } else if (systemField === 'expectedDeliveryDate') {
      const r = normalizeDate(raw);
      mapped[systemField] = r.value;
      if (r.issue) issues.push({ field: systemField, problem: r.issue, suggestion: r.value ?? undefined });
    } else if (systemField === 'year') {
      const num = parseInt(String(raw));
      if (isNaN(num) || num < 1980 || num > new Date().getFullYear() + 2) {
        mapped[systemField] = null;
        if (raw) issues.push({ field: 'year', problem: `Year '${raw}' is out of expected range` });
      } else {
        mapped[systemField] = num;
      }
    } else {
      mapped[systemField] = raw !== undefined && raw !== null && String(raw).trim() !== '' ? String(raw).trim() : null;
    }
  }

  for (const req of REQUIRED_FIELDS) {
    if (!mapped[req]) {
      issues.push({ field: req, problem: `Required field '${req}' is missing or empty` });
    }
  }

  return {
    mapped,
    issues,
    status: issues.length > 0 ? 'NEEDS_REVIEW' : 'PENDING',
  };
}
