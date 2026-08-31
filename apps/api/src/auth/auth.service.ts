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
}
