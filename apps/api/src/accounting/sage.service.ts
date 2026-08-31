import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

// Sage Business Cloud Accounting (v3.1) adapter.
//
// Auth is OAuth2 authorization-code with ROTATING refresh tokens: access
// tokens live ~5 minutes, and every refresh returns a NEW refresh token
// that must be persisted (the old one dies). Hence the SageToken table.
//
// Object mapping:
//   POD Client  → Sage contact          (created on first push, id cached)
//   POD Deal    → Sage sales_invoice    (one line: the vehicle)
//   POD Payment → Sage contact_payment  (allocated to that invoice)

const AUTH_URL = 'https://www.sageone.com/oauth2/auth/central';
const TOKEN_URL = 'https://oauth.accounting.sage.com/token';
const API_BASE = 'https://api.accounting.sage.com/v3.1';

@Injectable()
export class SageService {
  private readonly logger = new Logger(SageService.name);
  private pendingState: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get clientId() {
    return this.config.get<string>('SAGE_CLIENT_ID');
  }
  private get clientSecret() {
    return this.config.get<string>('SAGE_CLIENT_SECRET');
  }
  private get redirectUri() {
    return this.config.get<string>(
      'SAGE_REDIRECT_URI',
      'http://localhost:4000/api/accounting/sage/callback',
    );
  }

  get configured() {
    return Boolean(this.clientId && this.clientSecret);
  }

  private assertConfigured() {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Sage is not configured. Set SAGE_CLIENT_ID, SAGE_CLIENT_SECRET and SAGE_REDIRECT_URI ' +
          '(register the app at developer.sage.com), then connect from the Reports page.',
      );
    }
  }

  // ── OAuth ────────────────────────────────────────────────────────────

  connectUrl(connectedBy?: string) {
    this.assertConfigured();
    this.pendingState = `${randomBytes(16).toString('hex')}:${connectedBy ?? ''}`;
    const params = new URLSearchParams({
      filter: 'apiv3.1',
      client_id: this.clientId!,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scopes: 'full_access',
      state: this.pendingState,
    });
    return { url: `${AUTH_URL}?${params}` };
  }

  async handleCallback(code: string, state?: string) {
    this.assertConfigured();
    if (!code) throw new BadRequestException('Missing authorization code');
    if (this.pendingState && state !== this.pendingState) {
      throw new BadRequestException('OAuth state mismatch — restart the connect flow');
    }
    const connectedBy = this.pendingState?.split(':')[1] || null;
    this.pendingState = null;

    const tokens = await this.exchangeToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });

    await this.saveTokens(tokens, connectedBy);

    // Best effort: label the connection with the Sage business name
    try {
      const biz: any = await this.api('GET', '/business');
      await this.prisma.sageToken.update({
        where: { id: 1 },
        data: { businessName: biz?.name ?? null },
      });
    } catch {
      /* non-fatal */
    }
    return { connected: true };
  }

  private async exchangeToken(body: Record<string, string>) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        ...body,
      }),
    });
    const data: any = await res.json();
    if (!res.ok) {
      this.logger.error(`token exchange failed: ${JSON.stringify(data).slice(0, 300)}`);
      throw new BadRequestException(data?.error_description ?? 'Sage token exchange failed');
    }
    return data as { access_token: string; refresh_token: string; expires_in: number };
  }

  private async saveTokens(
    t: { access_token: string; refresh_token: string; expires_in: number },
    connectedBy?: string | null,
  ) {
    const expiresAt = new Date(Date.now() + (t.expires_in - 30) * 1000);
    await this.prisma.sageToken.upsert({
      where: { id: 1 },
      update: { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt },
      create: {
        id: 1,
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt,
        connectedBy: connectedBy ?? undefined,
      },
    });
  }

  private async accessToken(): Promise<string> {
    const row = await this.prisma.sageToken.findUnique({ where: { id: 1 } });
    if (!row) {
      throw new ServiceUnavailableException(
        'Sage is configured but not connected yet — use "Connect Sage" on the Reports page.',
      );
    }
    if (row.expiresAt > new Date()) return row.accessToken;
    const tokens = await this.exchangeToken({
      grant_type: 'refresh_token',
      refresh_token: row.refreshToken,
    });
    await this.saveTokens(tokens);
    return tokens.access_token;
  }

  private async api(method: string, path: string, body?: unknown): Promise<any> {
    const token = await this.accessToken();
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data: any = res.status === 204 ? null : await res.json();
    if (!res.ok) {
      const msg = Array.isArray(data) ? data[0]?.$message : data?.$message ?? data?.message;
      this.logger.error(`${method} ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
      throw new BadRequestException(`Sage: ${msg ?? `HTTP ${res.status}`}`);
    }
    return data;
  }

  // ── Reference lookups (cached per process) ─────────────────────────

  private refCache: { ledgerAccountId?: string; taxRateId?: string; bankAccountId?: string } = {};

  private async salesLedgerAccountId(): Promise<string> {
    if (this.refCache.ledgerAccountId) return this.refCache.ledgerAccountId;
    const preferred = this.config.get<string>('SAGE_SALES_LEDGER_CODE'); // e.g. "4000"
    const res = await this.api('GET', '/ledger_accounts?visible_in=sales&items_per_page=200');
    const items: any[] = res?.$items ?? [];
    const match = preferred
      ? items.find((i) => String(i.nominal_code) === preferred)
      : items.find((i) => /sales/i.test(i.displayed_as));
    const chosen = match ?? items[0];
    if (!chosen) throw new BadRequestException('Sage: no sales ledger account found');
    this.refCache.ledgerAccountId = chosen.id;
    return chosen.id;
  }

  private async taxRateId(): Promise<string> {
    if (this.refCache.taxRateId) return this.refCache.taxRateId;
    const preferred = this.config.get<string>('SAGE_TAX_RATE_ID');
    if (preferred) return (this.refCache.taxRateId = preferred);
    const res = await this.api('GET', '/tax_rates?items_per_page=200');
    const items: any[] = res?.$items ?? [];
    // exports are typically zero-rated; fall back to the first rate
    const zero = items.find((i) => /zero|exempt|no tax/i.test(i.displayed_as)) ?? items[0];
    if (!zero) throw new BadRequestException('Sage: no tax rates found');
    this.refCache.taxRateId = zero.id;
    return zero.id;
  }

  private async bankAccountId(): Promise<string> {
    if (this.refCache.bankAccountId) return this.refCache.bankAccountId;
    const preferred = this.config.get<string>('SAGE_BANK_ACCOUNT_ID');
    if (preferred) return (this.refCache.bankAccountId = preferred);
    const res = await this.api('GET', '/bank_accounts?items_per_page=50');
    const first = res?.$items?.[0];
    if (!first) throw new BadRequestException('Sage: no bank accounts found');
    this.refCache.bankAccountId = first.id;
    return first.id;
  }

  // ── Push logic ──────────────────────────────────────────────────────

  async ensureContact(clientId: string): Promise<string> {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException();
    if (client.sageContactId) return client.sageContactId;

    const created = await this.api('POST', '/contacts', {
      contact: {
        name: client.fullName,
        contact_type_ids: ['CUSTOMER'],
        ...(client.email && { email: client.email }),
        ...(client.phoneE164 && { mobile: client.phoneE164 }),
        ...(client.notes && { notes: client.notes }),
      },
    });
    await this.prisma.client.update({
      where: { id: clientId },
      data: { sageContactId: created.id },
    });
    return created.id;
  }

  async pushInvoice(dealId: string): Promise<{ sageInvoiceId: string; created: boolean }> {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: { client: true },
    });
    if (!deal) throw new NotFoundException();
    if (deal.sageInvoiceId) return { sageInvoiceId: deal.sageInvoiceId, created: false };
    if (!deal.sellingPrice) throw new BadRequestException(`${deal.reference} has no selling price`);

    const [contactId, ledgerAccountId, taxRateId] = await Promise.all([
      this.ensureContact(deal.clientId),
      this.salesLedgerAccountId(),
      this.taxRateId(),
    ]);

    const invoice = await this.api('POST', '/sales_invoices', {
      sales_invoice: {
        contact_id: contactId,
        date: deal.createdAt.toISOString().slice(0, 10),
        reference: deal.reference,
        invoice_lines: [
          {
            description: `${deal.make} ${deal.model}${deal.year ? ` ${deal.year}` : ''} — vehicle import & delivery`,
            quantity: 1,
            unit_price: Number(deal.sellingPrice),
            ledger_account_id: ledgerAccountId,
            tax_rate_id: taxRateId,
          },
        ],
      },
    });
    await this.prisma.deal.update({
      where: { id: dealId },
      data: { sageInvoiceId: invoice.id },
    });
    return { sageInvoiceId: invoice.id, created: true };
  }

  async pushPayment(paymentId: string): Promise<{ sagePaymentId: string; created: boolean }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { deal: true },
    });
    if (!payment) throw new NotFoundException();
    if (payment.sagePaymentId) return { sagePaymentId: payment.sagePaymentId, created: false };

    const { sageInvoiceId } = await this.pushInvoice(payment.dealId);
    const [contactId, bankAccountId] = await Promise.all([
      this.ensureContact(payment.deal.clientId),
      this.bankAccountId(),
    ]);

    const created = await this.api('POST', '/contact_payments', {
      contact_payment: {
        transaction_type_id: 'CUSTOMER_RECEIPT',
        contact_id: contactId,
        bank_account_id: bankAccountId,
        date: payment.paidAt.toISOString().slice(0, 10),
        total_amount: Number(payment.amount),
        ...(payment.reference && { reference: payment.reference }),
        allocated_artefacts: [{ artefact_id: sageInvoiceId, amount: Number(payment.amount) }],
      },
    });
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { sagePaymentId: created.id },
    });
    return { sagePaymentId: created.id, created: true };
  }

  // Push everything not yet in Sage. Continues past per-record failures and
  // reports them, so one bad record can't block the rest of the books.
  async syncAll() {
    this.assertConfigured();
    const [deals, payments] = await Promise.all([
      this.prisma.deal.findMany({
        where: { archivedAt: null, sellingPrice: { not: null }, sageInvoiceId: null },
        select: { id: true, reference: true },
      }),
      this.prisma.payment.findMany({
        where: { sagePaymentId: null },
        select: { id: true, deal: { select: { reference: true } } },
      }),
    ]);

    const errors: string[] = [];
    let invoices = 0;
    let receipts = 0;
    for (const d of deals) {
      try {
        const r = await this.pushInvoice(d.id);
        if (r.created) invoices++;
      } catch (e: any) {
        errors.push(`${d.reference}: ${e.message}`);
      }
    }
    for (const p of payments) {
      try {
        const r = await this.pushPayment(p.id);
        if (r.created) receipts++;
      } catch (e: any) {
        errors.push(`payment on ${p.deal.reference}: ${e.message}`);
      }
    }
    return { invoicesPushed: invoices, paymentsPushed: receipts, errors: errors.slice(0, 10) };
  }

  async status() {
    const token = await this.prisma.sageToken.findUnique({ where: { id: 1 } });
    const [unsyncedInvoices, unsyncedPayments] = await Promise.all([
      this.prisma.deal.count({
        where: { archivedAt: null, sellingPrice: { not: null }, sageInvoiceId: null },
      }),
      this.prisma.payment.count({ where: { sagePaymentId: null } }),
    ]);
    return {
      provider: 'sage-business-cloud',
      configured: this.configured,
      connected: Boolean(token),
      businessName: token?.businessName ?? null,
      lastTokenRefresh: token?.updatedAt ?? null,
      unsyncedInvoices,
      unsyncedPayments,
      note: !this.configured
        ? 'Register an app at developer.sage.com, then set SAGE_CLIENT_ID / SAGE_CLIENT_SECRET / SAGE_REDIRECT_URI. CSV export works today.'
        : !token
          ? 'Configured — press "Connect Sage" to authorize.'
          : 'Connected.',
    };
  }
}
