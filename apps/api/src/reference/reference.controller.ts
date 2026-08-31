import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('reference')
export class ReferenceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('statuses')
  statuses() {
    return this.prisma.dealStatus.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Get('locations')
  locations() {
    return this.prisma.location.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Get('users')
  users() {
    return this.prisma.user.findMany({
      where: { active: true },
      select: { id: true, fullName: true, role: true, email: true },
      orderBy: { fullName: 'asc' },
    });
  }

  @Get('countries')
  async countries() {
    const rows = await this.prisma.deal.findMany({
      where: { destinationCountry: { not: null } },
      distinct: ['destinationCountry'],
      select: { destinationCountry: true },
      orderBy: { destinationCountry: 'asc' },
    });
    return rows.map((r) => r.destinationCountry);
  }
}
