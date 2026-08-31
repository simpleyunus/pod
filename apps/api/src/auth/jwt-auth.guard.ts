import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { IS_PUBLIC_KEY, MIN_ROLE_KEY, ROLE_RANK } from './decorators';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    req.user = {
      id: payload.sub,
      username: payload.username,
      fullName: payload.fullName,
      role: payload.role as Role,
    };

    const minRole = this.reflector.getAllAndOverride<Role>(MIN_ROLE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (minRole && ROLE_RANK[req.user.role as Role] < ROLE_RANK[minRole]) {
      throw new ForbiddenException(`Requires ${minRole} role or higher`);
    }

    return true;
  }
}
