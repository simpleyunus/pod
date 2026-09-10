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
    // Whatever prompted the reset, the request is now answered.
    await this.clearResetRequests(id, 'SENT');
    return { ok: true };
  }

  // ── "Forgot password" requests ──────────────────────────────────────────
  //
  // POD has no mail transport, so /auth/forgot-password cannot send a reset
  // link; it records an internal Notification instead. These two methods are
  // the other half of that loop — without them the request would sit in a
  // table nobody reads.
  //
  // The requesting user's id is carried in the body as "[user:<id>]" rather
  // than a column, because Notification has no userId and the brief allows no
  // further migrations. Handled requests are moved to an existing status
  // rather than deleted, so the audit trail survives.

  async listResetRequests() {
    const rows = await this.prisma.notification.findMany({
      where: { template: 'password-reset-request', status: 'LOGGED' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const ids = rows
      .map((n) => /\[user:([^\]]+)\]/.exec(n.body)?.[1])
      .filter((v): v is string => Boolean(v));
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, username: true, fullName: true, role: true, active: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    return rows.flatMap((n) => {
      const userId = /\[user:([^\]]+)\]/.exec(n.body)?.[1];
      const user = userId ? byId.get(userId) : undefined;
      // A request whose account has since been deleted or disabled is not
      // actionable, so it is not shown.
      if (!user || !user.active) return [];
      return [{ id: n.id, requestedAt: n.createdAt, user }];
    });
  }

  /** Marks a user's outstanding requests handled: SENT when reset, SKIPPED when dismissed. */
  async clearResetRequests(userId: string, status: 'SENT' | 'SKIPPED') {
    const { count } = await this.prisma.notification.updateMany({
      where: {
        template: 'password-reset-request',
        status: 'LOGGED',
        body: { contains: `[user:${userId}]` },
      },
      data: { status, sentAt: new Date() },
    });
    return { cleared: count };
  }
}
