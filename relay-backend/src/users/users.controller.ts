import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SaveKeyBundleDto } from './dto/save-key-bundle.dto';
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
    const bundle = await this.users.findKeyBundle(user.id);
    return [
      {
        ...UsersService.toPublic(user),
        exchangePubKey: bundle?.exchangePubKey ?? null,
      },
    ];
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

  @Put('me/keys')
  async saveMyKeys(
    @CurrentUser() me: AuthenticatedUser,
    @Body() dto: SaveKeyBundleDto,
  ) {
    return this.users.saveKeyBundle({ userId: me.sub, ...dto });
  }

  @Get('me/keys')
  async myKeys(@CurrentUser() me: AuthenticatedUser) {
    return this.users.findKeyBundle(me.sub);
  }

  @Get(':id/keys')
  async keysFor(@Param('id') id: string) {
    const bundle = await this.users.findKeyBundle(id);
    if (!bundle) throw new NotFoundException('No key bundle for user');
    // Expose only public half — private blob is irrelevant to other users.
    return {
      userId: bundle.userId,
      identityPubKey: bundle.identityPubKey,
      exchangePubKey: bundle.exchangePubKey,
    };
  }
}
