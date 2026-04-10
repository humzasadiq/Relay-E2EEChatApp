import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import type { StoredConversation } from './storage/chat-storage.strategy';

export interface EnrichedConversation extends StoredConversation {
  /** displayName keyed by userId for every member in this conversation */
  memberNames: Record<string, string>;
}

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly users: UsersService,
  ) {}

  @Post('conversations')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateConversationDto,
  ) {
    const conv = await this.chat.createConversation(user.sub, {
      type: dto.type,
      name: dto.name ?? null,
      memberIds: dto.memberIds,
      temporary: dto.temporary ?? false,
    });
    return this.enrich(conv);
  }

  @Get('conversations')
  async list(@CurrentUser() user: AuthenticatedUser) {
    const convs = await this.chat.listConversations(user.sub);
    return Promise.all(convs.map((c) => this.enrich(c)));
  }

  @Get('conversations/:id/messages')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.chat.getHistory(user.sub, id, limit);
  }

  @Post('conversations/:id/messages')
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.sendMessage({
      conversationId: id,
      senderId: user.sub,
      ciphertext: dto.ciphertext,
      nonce: dto.nonce,
    });
  }

  /** Resolve all member userIds → displayNames in one shot. */
  private async enrich(conv: StoredConversation): Promise<EnrichedConversation> {
    const entries = await Promise.all(
      conv.memberIds.map(async (uid) => {
        const u = await this.users.findById(uid);
        return [uid, u?.displayName ?? uid] as [string, string];
      }),
    );
    return { ...conv, memberNames: Object.fromEntries(entries) };
  }
}
