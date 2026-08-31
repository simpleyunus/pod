import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Role hierarchy: a route marked MinRole(CONSULTANT) also admits ADMIN and OWNER.
export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  CONSULTANT: 1,
  ADMIN: 2,
  OWNER: 3,
};

export const MIN_ROLE_KEY = 'minRole';
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE_KEY, role);

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
