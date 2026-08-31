import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { AuthUser, CurrentUser, Public } from './decorators';

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const ChangePasswordSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(8, 'New password must be at least 8 characters'),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } }) // brute-force guard
  @Post('login')
  login(@Body() body: unknown) {
    const { username, password } = LoginSchema.parse(body);
    return this.auth.login(username, password);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { current, next } = ChangePasswordSchema.parse(body);
    return this.auth.changePassword(user.id, current, next);
  }
}
