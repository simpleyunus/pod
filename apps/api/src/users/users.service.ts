import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, ROLE_RANK } from '../auth/decorators';

const SAFE_USER_SELECT = {
  id: true,
  username: true,
  fullName: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  _count: { select: { dealsResponsible: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      select: SAFE_USER_SELECT,
      orderBy: [{ active: 'desc' }, { fullName: 'asc' }],
    });
  }

  // Admins manage the team, but never accounts that outrank them —
  // and only owners can mint admins/owners.
  private assertCanManage(actor: AuthUser, targetRole: Role) {
    if (ROLE_RANK[targetRole] >= ROLE_RANK[actor.role] && actor.role !== 'OWNER') {
      throw new ForbiddenException(
        `Only an OWNER can manage ${targetRole} accounts`,
      );
    }
  }

  async create(
    actor: AuthUser,
    data: {
      username: string;
      password: string;
      fullName: string;
      email?: string;
      role: Role;
    },
  ) {
    this.assertCanManage(actor, data.role);
    const username = data.username.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) throw new ConflictException(`Username "${username}" is taken`);

    return this.prisma.user.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(data.password, 10),
        fullName: data.fullName,
        email: data.email || null,
        role: data.role,
      },
      select: SAFE_USER_SELECT,
    });
  }

  async update(
    actor: AuthUser,
    id: string,
    data: { fullName?: string; email?: string; role?: Role; active?: boolean },
  ) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException();

    this.assertCanManage(actor, target.role);
    if (data.role) this.assertCanManage(actor, data.role);

    if (id === actor.id && (data.role || data.active === false)) {
      throw new BadRequestException(
        'You cannot change your own role or deactivate yourself',
      );
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        fullName: data.fullName,
        email: data.email,
        role: data.role,
        active: data.active,
      },
      select: SAFE_USER_SELECT,
    });
  }

  async resetPassword(actor: AuthUser, id: string, password: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException();
    this.assertCanManage(actor, target.role);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    return { ok: true };
  }
}
