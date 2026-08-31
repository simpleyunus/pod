import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccountingModule } from './accounting/accounting.module';
import { AuthModule } from './auth/auth.module';
import { ClamAvModule } from './clamav/clamav.module';
import { ClientsModule } from './clients/clients.module';
import { DealsModule } from './deals/deals.module';
import { HealthController } from './health/health.controller';
import { ImportModule } from './import/import.module';
import { MediaModule } from './media/media.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReferenceModule } from './reference/reference.module';
import { ReportsModule } from './reports/reports.module';
import { SearchModule } from './search/search.module';
import { StorageModule } from './storage/storage.module';
import { TrackingModule } from './tracking/tracking.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 300 requests/min per IP by default; login and public uploads are stricter.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get('REDIS_URL', 'redis://localhost:6379') },
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    StorageModule,
    ClamAvModule,
    DealsModule,
    ReferenceModule,
    ClientsModule,
    SearchModule,
    MediaModule,
    ImportModule,
    TrackingModule,
    NotificationsModule,
    AccountingModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
