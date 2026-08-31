import { Injectable } from '@nestjs/common';
import { FleetEntityType, FleetEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// The fleet module's audit trail. Same discipline as TimelineEvent — rows are
// appended and never updated or deleted — but polymorphic, because
// TimelineEvent.dealId is required and FK'd to Deal, so it cannot carry
// asset, driver, work-order or incident history.
@Injectable()
export class FleetEventsService {
  constructor(private readonly prisma: PrismaService) {}

  record(
    entityType: FleetEntityType,
    entityId: string,
    type: FleetEventType,
    note?: string,
    meta?: unknown,
    createdById?: string,
  ) {
    return this.prisma.fleetEvent.create({
      data: { entityType, entityId, type, note, meta: meta as any, createdById },
    });
  }

  list(entityType: FleetEntityType, entityId: string, take = 100) {
    return this.prisma.fleetEvent.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, take),
    });
  }

  // Actor names for a page of events, resolved in one query. Fleet tables
  // reference User by plain id (no FK) to keep the User model untouched, so
  // the join happens here instead of in Prisma.
  async withActors<T extends { createdById: string | null }>(events: T[]) {
    const ids = [...new Set(events.map((e) => e.createdById).filter((x): x is string => !!x))];
    if (!ids.length) return events.map((e) => ({ ...e, createdBy: null }));
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return events.map((e) => ({ ...e, createdBy: e.createdById ? byId.get(e.createdById) ?? null : null }));
  }
}
