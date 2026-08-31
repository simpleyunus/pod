import { Controller, Get, Header, Param, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthUser, CurrentUser, MinRole, Public } from '../auth/decorators';
import { AccountingService } from './accounting.service';
import { SageService } from './sage.service';

@Controller('accounting')
@MinRole('ADMIN')
export class AccountingController {
  constructor(
    private readonly accounting: AccountingService,
    private readonly sage: SageService,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  status() {
    return this.sage.status();
  }

  @Get('payments.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="pod-payments.csv"')
  payments(@Query('from') from?: string, @Query('to') to?: string) {
    return this.accounting.paymentsCsv(from, to);
  }

  @Get('invoices.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="pod-invoices.csv"')
  invoices() {
    return this.accounting.invoicesCsv();
  }

  // ── Sage Business Cloud ─────────────────────────────────────────────

  @Get('sage/connect')
  connect(@CurrentUser() actor: AuthUser) {
    return this.sage.connectUrl(actor.fullName);
  }

  // Sage's browser redirect lands here — no bearer token possible, so it's
  // public; the one-time code + state are the credentials.
  @Public()
  @Get('sage/callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const web = (this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3002').split(',')[0];
    try {
      await this.sage.handleCallback(code, state);
      res.redirect(`${web}/reports?sage=connected`);
    } catch (e: any) {
      res.redirect(`${web}/reports?sage=error&message=${encodeURIComponent(e.message ?? 'failed')}`);
    }
  }

  @Post('sage/sync')
  sync() {
    return this.sage.syncAll();
  }

  @Post('sage/push-invoice/:dealId')
  pushInvoice(@Param('dealId') dealId: string) {
    return this.sage.pushInvoice(dealId);
  }
}
