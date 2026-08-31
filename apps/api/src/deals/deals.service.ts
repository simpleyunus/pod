import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { NOTIFY_QUEUE, SEARCH_QUEUE } from '../queue/queue.module';
import { PrismaService } from '../prisma/prisma.service';

export interface DealListFilters {
  statusId?: string;
  locationId?: string;
  consultantId?: string;
  destinationCountry?: string;
  payment?: 'UNPAID' | 'PARTIAL' | 'PAID';
  q?: string;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SEARCH_QUEUE) private readonly searchQueue: Queue,
    @InjectQueue(NOTIFY_QUEUE) private readonly notifyQueue: Queue,
  ) {}

  async list(filters: DealListFilters) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));

    const where: Prisma.DealWhereInput = {
      archivedAt: null,
      ...(filters.statusId && { currentStatusId: filters.statusId }),
      ...(filters.locationId && { currentLocationId: filters.locationId }),
      ...(filters.consultantId && { consultantId: filters.consultantId }),
      ...(filters.destinationCountry && { destinationCountry: filters.destinationCountry }),
      ...((filters.createdFrom || filters.createdTo) && {
        createdAt: {
          ...(filters.createdFrom && { gte: new Date(filters.createdFrom) }),
          ...(filters.createdTo && { lte: new Date(filters.createdTo) }),
        },
      }),
      ...(filters.q && {
        OR: [
          { reference: { contains: filters.q, mode: 'insensitive' } },
          { make: { contains: filters.q, mode: 'insensitive' } },
          { model: { contains: filters.q, mode: 'insensitive' } },
          { registrationNo: { contains: filters.q, mode: 'insensitive' } },
          { vin: { contains: filters.q, mode: 'insensitive' } },
          { client: { fullName: { contains: filters.q, mode: 'insensitive' } } },
        ],
      }),
    };

    const include = {
      client: { select: { id: true, fullName: true, country: true } },
      consultant: { select: { id: true, fullName: true } },
      currentStatus: true,
      currentLocation: true,
      payments: { select: { amount: true, currency: true } },
    } as const;

    const stalledDays = Number(process.env.STALLED_DAYS ?? 7);
    const toItem = (d: any) => {
      const paid = d.payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      const price = d.sellingPrice ? Number(d.sellingPrice) : null;
      const paymentStatus =
        paid <= 0 ? 'UNPAID' : price !== null && paid >= price ? 'PAID' : 'PARTIAL';
      const idleDays = Math.floor((Date.now() - new Date(d.updatedAt).getTime()) / 86_400_000);
      const isStalled = idleDays >= stalledDays && !d.currentStatus?.isTerminal;
      const { payments, costPrice, costCurrency, ...rest } = d;
      return { ...rest, amountPaid: paid, paymentStatus, idleDays, isStalled };
    };

    // Payment status is derived (payments vs price), so it can't be a SQL
    // where-clause: fetch the whole filtered set, then paginate in memory.
    if (filters.payment) {
      const all = await this.prisma.deal.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include,
      });
      const matching = all.map(toItem).filter((i) => i.paymentStatus === filters.payment);
      return {
        total: matching.length,
        page,
        pageSize,
        items: matching.slice((page - 1) * pageSize, page * pageSize),
      };
    }

    const [total, deals] = await this.prisma.$transaction([
      this.prisma.deal.count({ where }),
      this.prisma.deal.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include,
      }),
    ]);

    return { total, page, pageSize, items: deals.map(toItem) };
  }

  async byId(id: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: {
        client: true,
        consultant: { select: { id: true, fullName: true, role: true } },
        currentStatus: true,
        currentLocation: true,
        payments: { orderBy: { paidAt: 'asc' } },
        media: true,
        documents: true,
        timeline: {
          orderBy: { createdAt: 'desc' },
          include: {
            status: true,
            location: true,
            createdBy: { select: { id: true, fullName: true } },
          },
        },
      },
    });
    if (!deal) throw new NotFoundException(`Deal ${id} not found`);
    return deal;
  }

  async create(data: {
    clientId: string;
    make: string;
    model: string;
    year?: number;
    registrationNo?: string;
    vin?: string;
    colour?: string;
    mileageKm?: number;
    supplier?: string;
    sourceCountry?: string;
    destinationCountry?: string;
    destinationCity?: string;
    sellingPrice?: number;
    sellingCurrency?: string;
    costPrice?: number;
    costCurrency?: string;
    expectedDeliveryDate?: string;
    consultantId?: string;
    currentStatusId?: string;
    currentLocationId?: string;
    leadStage?: any;
  }, actorId?: string) {
    const count = await this.prisma.deal.count();
    const reference = `POD-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    const result = await this.prisma.deal.create({
      data: {
        reference,
        clientId: data.clientId,
        make: data.make,
        model: data.model,
        year: data.year,
        registrationNo: data.registrationNo,
        vin: data.vin,
        colour: data.colour,
        mileageKm: data.mileageKm,
        supplier: data.supplier,
        sourceCountry: data.sourceCountry,
        destinationCountry: data.destinationCountry,
        destinationCity: data.destinationCity,
        sellingPrice: data.sellingPrice,
        sellingCurrency: data.sellingCurrency,
        costPrice: data.costPrice,
        costCurrency: data.costCurrency,
        expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : undefined,
        consultantId: data.consultantId,
        currentStatusId: data.currentStatusId,
        currentLocationId: data.currentLocationId,
        leadStage: data.leadStage,
        ...(data.currentStatusId && {
          timeline: {
            create: {
              type: 'STATUS_CHANGE',
              statusId: data.currentStatusId,
              createdById: actorId,
            },
          },
        }),
      },
      include: {
        client: true,
        currentStatus: true,
        currentLocation: true,
        consultant: { select: { id: true, fullName: true } },
      },
    });
    await this.searchQueue.add('index-deal', { dealId: result.id }).catch(() => {});
    return result;
  }

  async update(id: string, data: any) {
    await this.byId(id);
    const result = await this.prisma.deal.update({
      where: { id },
      data,
      include: {
        client: true,
        currentStatus: true,
        currentLocation: true,
        consultant: { select: { id: true, fullName: true } },
      },
    });
    await this.searchQueue.add('index-deal', { dealId: id }).catch(() => {});
    return result;
  }

  async changeStatus(id: string, statusId: string, note?: string, actorId?: string) {
    await this.byId(id);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.timelineEvent.create({
        data: { dealId: id, type: 'STATUS_CHANGE', statusId, note, createdById: actorId },
      });
      return tx.deal.update({
        where: { id },
        data: { currentStatusId: statusId },
        include: { currentStatus: true, currentLocation: true, client: { select: { id: true, fullName: true, country: true } } },
      });
    });
    // Milestone reached → WhatsApp update (worker respects the client's opt-in)
    await this.notifyQueue.add('status-change', { dealId: id });
    return result;
  }

  async changeLocation(id: string, locationId: string, note?: string, actorId?: string) {
    await this.byId(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.timelineEvent.create({
        data: { dealId: id, type: 'LOCATION_CHANGE', locationId, note, createdById: actorId },
      });
      return tx.deal.update({
        where: { id },
        data: { currentLocationId: locationId },
        include: { currentStatus: true, currentLocation: true, client: { select: { id: true, fullName: true, country: true } } },
      });
    });
  }

  async addPayment(
    dealId: string,
    data: { amount: number; currency: string; method?: string; reference?: string; paidAt: string; note?: string },
    actorId?: string,
  ) {
    await this.byId(dealId);
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          dealId,
          amount: data.amount,
          currency: data.currency,
          method: data.method,
          reference: data.reference,
          paidAt: new Date(data.paidAt),
          note: data.note,
          recordedById: actorId,
        },
      });
      await tx.timelineEvent.create({
        data: {
          dealId,
          type: 'PAYMENT',
          note: `${data.currency} ${data.amount}${data.method ? ` via ${data.method}` : ''}`,
          meta: { paymentId: payment.id },
          createdById: actorId,
        },
      });
      return payment;
    });
  }

  async listDocuments(dealId: string) {
    await this.byId(dealId);
    return this.prisma.document.findMany({ where: { dealId }, orderBy: { createdAt: 'asc' } });
  }

  async addDocument(dealId: string, data: { type: any; label?: string; received?: boolean; note?: string }, actorId?: string) {
    await this.byId(dealId);
    const doc = await this.prisma.document.create({ data: { dealId, ...data } });
    await this.prisma.timelineEvent.create({
      data: { dealId, type: 'DOCUMENT', note: `${data.type}${data.label ? ` — ${data.label}` : ''} added`, meta: { documentId: doc.id }, createdById: actorId },
    });
    return doc;
  }

  async updateDocument(dealId: string, docId: string, data: any) {
    return this.prisma.document.update({ where: { id: docId, dealId }, data });
  }

  async addNote(dealId: string, note: string, actorId?: string, clientVisible?: boolean) {
    await this.byId(dealId);
    return this.prisma.timelineEvent.create({
      data: { dealId, type: 'NOTE', note, createdById: actorId, meta: clientVisible ? { clientVisible: true } : undefined },
    });
  }
}
