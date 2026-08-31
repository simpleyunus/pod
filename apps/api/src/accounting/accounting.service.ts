import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

// CSV cell: quote when needed, double internal quotes.
function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Direct Sage push activates when credentials arrive; until then the CSV
  // exports below are the working bridge (Sage Business Cloud imports CSV).
  status() {
    const configured = Boolean(
      this.config.get('SAGE_CLIENT_ID') && this.config.get('SAGE_CLIENT_SECRET'),
    );
    return {
      provider: 'sage-business-cloud',
      configured,
      mode: configured ? 'api' : 'csv-export',
      note: configured
        ? 'Sage API credentials present.'
        : 'Set SAGE_CLIENT_ID / SAGE_CLIENT_SECRET to enable direct push; CSV export works today.',
    };
  }

  async paymentsCsv(from?: string, to?: string) {
    const payments = await this.prisma.payment.findMany({
      where: {
        ...(from && { paidAt: { gte: new Date(from) } }),
        ...(to && { paidAt: { lte: new Date(to) } }),
      },
      orderBy: { paidAt: 'asc' },
      include: {
        deal: { select: { reference: true, make: true, model: true, client: { select: { fullName: true } } } },
        recordedBy: { select: { fullName: true } },
      },
    });

    return toCsv(
      ['Date', 'Type', 'Reference', 'Customer', 'Details', 'Currency', 'Amount', 'Method', 'Bank Reference', 'Recorded By'],
      payments.map((p) => [
        p.paidAt.toISOString().slice(0, 10),
        'Customer Receipt',
        p.deal.reference,
        p.deal.client.fullName,
        `Payment — ${p.deal.make} ${p.deal.model}${p.note ? ` (${p.note})` : ''}`,
        p.currency,
        Number(p.amount).toFixed(2),
        p.method ?? '',
        p.reference ?? '',
        p.recordedBy?.fullName ?? '',
      ]),
    );
  }

  async invoicesCsv() {
    const deals = await this.prisma.deal.findMany({
      where: { archivedAt: null, sellingPrice: { not: null } },
      orderBy: { createdAt: 'asc' },
      include: {
        client: { select: { fullName: true, email: true, country: true } },
        payments: { select: { amount: true } },
      },
    });

    return toCsv(
      ['Date', 'Type', 'Reference', 'Customer', 'Customer Email', 'Description', 'Currency', 'Amount', 'Amount Paid', 'Balance'],
      deals.map((d) => {
        const paid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
        const price = Number(d.sellingPrice);
        return [
          d.createdAt.toISOString().slice(0, 10),
          'Sales Invoice',
          d.reference,
          d.client.fullName,
          d.client.email ?? '',
          `${d.make} ${d.model}${d.year ? ` ${d.year}` : ''} — vehicle import & delivery`,
          d.sellingCurrency ?? '',
          price.toFixed(2),
          paid.toFixed(2),
          (price - paid).toFixed(2),
        ];
      }),
    );
  }
}
