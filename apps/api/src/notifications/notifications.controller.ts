import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, MinRole } from '../auth/decorators';
import { NotificationsService } from './notifications.service';

const NotifySchema = z.object({ force: z.boolean().optional() });

@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // Manual "Send update on WhatsApp" from the deal page. force=true because
  // a human pressing the button outranks the opt-in default.
  @Post('deals/:id/notify')
  @MinRole('CONSULTANT')
  notify(@Param('id') dealId: string, @Body() body: unknown, @CurrentUser() _actor: AuthUser) {
    const { force } = NotifySchema.parse(body ?? {});
    return this.notifications.notifyDealUpdate(dealId, { force: force ?? true });
  }

  @Get('deals/:id/notifications')
  listForDeal(@Param('id') dealId: string) {
    return this.notifications.listForDeal(dealId);
  }

  @Get('notifications')
  @MinRole('CONSULTANT')
  listRecent(@Query('limit') limit?: string) {
    return this.notifications.listRecent(limit ? Number(limit) : 20);
  }

  @Get('notifications/provider')
  provider() {
    return { mode: this.notifications.providerMode };
  }

  // Manual trigger for the daily stalled-deal sweep (also runs on a cron).
  @Post('notifications/run-stalled-sweep')
  @MinRole('ADMIN')
  runStalledSweep() {
    return this.notifications.createStalledReminders();
  }
}
