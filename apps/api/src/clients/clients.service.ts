import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: { q?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, filters.pageSize ?? 25);
    const where = filters.q
      ? {
          OR: [
            { fullName: { contains: filters.q, mode: 'insensitive' as const } },
            { phoneE164: { contains: filters.q, mode: 'insensitive' as const } },
            { email: { contains: filters.q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [total, items] = await this.prisma.$transaction([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        orderBy: { fullName: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { deals: true } } },
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async byId(id: string) {
    const c = await this.prisma.client.findUnique({
      where: { id },
      include: {
        deals: {
          orderBy: { updatedAt: 'desc' },
          include: { currentStatus: true, currentLocation: true },
        },
      },
    });
    if (!c) throw new NotFoundException(`Client ${id} not found`);
    return c;
  }

  async create(data: any) {
    return this.prisma.client.create({ data });
  }

  async update(id: string, data: any) {
    return this.prisma.client.update({ where: { id }, data });
  }
}
