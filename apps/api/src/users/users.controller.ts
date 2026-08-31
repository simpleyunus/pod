import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { AuthUser, CurrentUser, MinRole } from '../auth/decorators';
import { UsersService } from './users.service';

const RoleSchema = z.nativeEnum(Role);

const CreateUserSchema = z.object({
  username: z.string().min(3).regex(/^[a-z0-9._-]+$/i, 'Letters, numbers, dots, dashes only'),
  password: z.string().min(8),
  fullName: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  role: RoleSchema,
});

const UpdateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal('')),
  role: RoleSchema.optional(),
  active: z.boolean().optional(),
});

const ResetPasswordSchema = z.object({ password: z.string().min(8) });

@Controller('users')
@MinRole('ADMIN')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    return this.users.create(actor, CreateUserSchema.parse(body));
  }

  @Patch(':id')
  update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.users.update(actor, id, UpdateUserSchema.parse(body));
  }

  @Post(':id/reset-password')
  resetPassword(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.users.resetPassword(actor, id, ResetPasswordSchema.parse(body).password);
  }
}
