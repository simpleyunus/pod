import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { MinRole } from '../auth/decorators';
import { ClientsService } from './clients.service';

// Whitelist editable fields so a request can't touch timestamps or relations.
const ClientWriteSchema = z.object({
  fullName: z.string().min(1).optional(),
  phoneE164: z.string().max(20).nullable().optional(),
  altPhone: z.string().max(20).nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal('').transform(() => null)),
  country: z.string().max(60).nullable().optional(),
  city: z.string().max(60).nullable().optional(),
  preferredLanguage: z.string().max(10).optional(),
  whatsappOptIn: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(@Query('q') q?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.clients.list({ q, page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined });
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.clients.byId(id);
  }

  @Post()
  @MinRole('CONSULTANT')
  create(@Body() body: unknown) {
    const data = ClientWriteSchema.parse(body);
    if (!data.fullName) throw new Error('fullName is required');
    return this.clients.create(data);
  }

  @Patch(':id')
  @MinRole('CONSULTANT')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.clients.update(id, ClientWriteSchema.parse(body));
  }
}
