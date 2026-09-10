import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

const SAFE_USER_SELECT = {
  id: true,
  username: true,
  fullName: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username: username.trim().toLowerCase() },
    });
    // Same error for unknown user / wrong password / disabled account,
    // so the login form can't be used to probe which usernames exist.
    if (!user?.passwordHash || !user.active)
      throw new UnauthorizedException('Invalid username or password');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid username or password');

    const token = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: SAFE_USER_SELECT,
    });
    if (!user || !user.active) throw new UnauthorizedException();
    return user;
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) throw new NotFoundException();
    const ok = await bcrypt.compare(current, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(next, 10) },
    });
    return { ok: true };
  }
  /**
   * Self-service password reset request.
   *
   * POD has no email transport — the only outbound channel is WhatsApp, aimed
   * at customers rather than staff — so this cannot send a reset link. What it
   * does instead is raise an INTERNAL notification that an admin picks up and
   * acts on from the Team page, which is where the reset already lives.
   *
   * The response is deliberately identical whether or not the username exists,
   * so this cannot be used to discover who has an account.
   */
  async requestPasswordReset(username: string) {
    const clean = username.trim().slice(0, 60);
    const user = clean
      ? await this.prisma.user.findFirst({
          where: { username: clean, active: true },
          select: { id: true, fullName: true, username: true },
        })
      : null;

    if (user) {
      // One request per user per hour; a flood of rows helps nobody.
      const recent = await this.prisma.notification.findFirst({
        where: {
          template: 'password-reset-request',
          body: { contains: `[user:${user.id}]` },
          createdAt: { gt: new Date(Date.now() - 3_600_000) },
        },
      });
      if (!recent) {
        await this.prisma.notification.create({
          data: {
            channel: 'INTERNAL',
            template: 'password-reset-request',
            body:
              `🔑 ${user.fullName} (@${user.username}) asked for a password reset. ` +
              `Reset it on the Team page. [user:${user.id}]`,
            status: 'LOGGED',
          },
        });
      }
    }

    return { requested: true };
  }

}
