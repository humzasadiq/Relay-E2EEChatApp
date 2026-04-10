import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
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

  @Patch('me')
  async updateMe(
    @CurrentUser() me: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    const updated = await this.users.update(me.sub, dto);
    if (!updated) throw new NotFoundException('User not found');
    return UsersService.toPublic(updated);
  }
}
