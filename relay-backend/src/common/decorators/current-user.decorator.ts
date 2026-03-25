import { ExecutionContext, createParamDecorator } from '@nestjs/common';

export interface AuthenticatedUser {
  sub: string;
  email: string;
}

/**
 * Decorator pattern: pulls the authenticated user off the request without
 * every handler having to touch `req.user` directly.
 *   @Get('me')
 *   me(@CurrentUser() user: AuthenticatedUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as AuthenticatedUser;
  },
);
