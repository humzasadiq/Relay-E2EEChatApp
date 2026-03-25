import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('search')
  async search(
    @CurrentUser() me: AuthenticatedUser,
    @Query('email') email?: string,
  ) {
    if (!email) return [];
    const user = await this.users.findByEmail(email);
    if (!user || user.id === me.sub) return [];
    return [UsersService.toPublic(user)];
  }
}
