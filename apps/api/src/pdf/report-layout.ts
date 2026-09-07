// Shared print stylesheet for every RTMS report, so the audit pack reads as
// one document set rather than a dozen unrelated pages. Deliberately plain:
// this is evidence for an auditor, not a dashboard.
export const REPORT_CSS = `
  @page { size: A4; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 9.5pt; color: #171B26; margin: 0; padding: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .cover { padding: 60mm 0 0; text-align: center; }
  .cover h1 { font-size: 26pt; margin: 0 0 6mm; letter-spacing: -0.5pt; }
  .cover .sub { font-size: 12pt; color: #5B6472; margin-bottom: 3mm; }
  .cover .meta { font-size: 9pt; color: #98A0AC; margin-top: 20mm; line-height: 1.7; }
  h2 { font-size: 14pt; margin: 0 0 1mm; letter-spacing: -0.2pt; }
  .subtitle { font-size: 8.5pt; color: #98A0AC; margin: 0 0 5mm;
              text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6mm; }
  th {
    text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em;
    color: #5B6472; border-bottom: 1.2pt solid #171B26; padding: 2mm 1.5mm; font-weight: 700;
  }
  td { padding: 1.8mm 1.5mm; border-bottom: 0.4pt solid #E9E9E4; vertical-align: top; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .pill {
    display: inline-block; padding: 0.6mm 2mm; border-radius: 2mm;
    font-size: 7.5pt; font-weight: 700;
  }
  .rag-GREEN, .s-VALID  { background: #E6F6EE; color: #067647; }
  .rag-AMBER, .s-DUE_SOON { background: #FCF3E1; color: #9A6208; }
  .rag-RED, .s-EXPIRED  { background: #FEE4E2; color: #B42318; }
  .empty { color: #98A0AC; font-style: italic; padding: 4mm 0; }
  .kpis { display: flex; gap: 4mm; margin-bottom: 6mm; flex-wrap: wrap; }
  .kpi { border: 0.5pt solid #E9E9E4; border-radius: 2mm; padding: 3mm 4mm; min-width: 32mm; }
  .kpi .v { font-size: 16pt; font-weight: 700; line-height: 1; }
  .kpi .l { font-size: 7pt; color: #98A0AC; text-transform: uppercase;
            letter-spacing: 0.08em; font-weight: 600; margin-top: 1.5mm; }
  .note { font-size: 8pt; color: #5B6472; margin-top: 4mm; line-height: 1.5; }
  .page-break { page-break-before: always; }
`;

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const escapeHtml = esc;

// POD's registers write dates DD/MM/YYYY (R2 "31/03/2027", R16 "30/10/2023").
export const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return '';
  const x = new Date(d);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(x.getUTCDate())}/${p2(x.getUTCMonth() + 1)}/${x.getUTCFullYear()}`;
};

// R1 writes masses as "20 TONNE"; R3 as "7.4 TONNE".
export const fmtTonnes = (kg: number | null | undefined) => {
  if (kg === null || kg === undefined) return '';
  const t = kg / 1000;
  return `${Number.isInteger(t) ? t.toFixed(0) : t.toFixed(1)} TONNE`;
};

export const fmtNum = (n: number | null | undefined, dp = 0) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('en-ZA', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export interface Column<T> {
  header: string;
  // The index is passed because several registers open with a "No." column
  // that simply numbers the rows (R8, R9, R10, R16).
  value: (row: T, index: number) => string;
  numeric?: boolean;
  raw?: boolean; // value() already returns safe HTML (pills)
}

export function table<T>(rows: T[], columns: Column<T>[], emptyText = 'No records for this period.') {
  if (!rows.length) return `<p class="empty">${esc(emptyText)}</p>`;
  const head = columns.map((c) => `<th${c.numeric ? ' class="num"' : ''}>${esc(c.header)}</th>`).join('');
  const body = rows
    .map(
      (r, rowIndex) =>
        '<tr>' +
        columns
          .map((c) => {
            const v = c.value(r, rowIndex);
            return `<td${c.numeric ? ' class="num"' : ''}>${c.raw ? v : esc(v)}</td>`;
          })
          .join('') +
        '</tr>',
    )
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export const statusPill = (s: string) => `<span class="pill s-${esc(s)}">${esc(s.replace(/_/g, ' '))}</span>`;
export const ragPill = (s: string) => `<span class="pill rag-${esc(s)}">${esc(s)}</span>`;

export function reportPage(opts: {
  title: string;
  reportCode: string;
  periodLabel: string;
  bodyHtml: string;
}) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${REPORT_CSS}</style></head><body>
    <h2>${esc(opts.title)}</h2>
    <p class="subtitle">${esc(opts.reportCode)} &middot; ${esc(opts.periodLabel)}</p>
    ${opts.bodyHtml}
  </body></html>`;
}

export const footerHtml = (label: string) =>
  `<!doctype html><html><head><style>
     body { font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 7pt;
            color: #98A0AC; width: 100%; margin: 0 10mm; }
     .row { display: flex; justify-content: space-between; gap: 12mm; width: 100%; }
     .row span { white-space: nowrap; }
   </style></head><body><div class="row">
     <span>${escapeHtml(label)}</span>
     <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
   </div></body></html>`;
