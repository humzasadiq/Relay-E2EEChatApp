import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
  /** email keyed by userId — used as stable avatar seed on the client */
  memberEmails: Record<string, string>;
  /** ISO timestamp if a temporary-chat session is active, null otherwise */
  tempSessionSince: string | null;
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
      wrappedKeys: dto.wrappedKeys,
    });
    return this.enrich(conv);
  }

  @Get('conversations/:id/key')
  async myKey(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const wrappedKey = await this.chat.getWrappedKey(user.sub, id);
    return { wrappedKey };
  }

  /**
   * Upsert wrapped conversation keys — used to lazily provision keys
   * for conversations created before M3, or to rotate them after a
   * membership change.
   */
  @Post('conversations/:id/keys')
  async upsertKeys(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { wrappedKeys: Record<string, string> },
  ) {
    await this.chat.saveWrappedKeys(user.sub, id, body.wrappedKeys);
    return { ok: true };
  }

  @Get('conversations')
  async list(@CurrentUser() user: AuthenticatedUser) {
    const convs = await this.chat.listConversations(user.sub);
    return Promise.all(convs.map((c) => this.enrich(c)));
  }

  @Post('conversations/:id/members')
  async addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { userId: string; wrappedKey: string },
  ) {
    const conv = await this.chat.addGroupMember(id, user.sub, body.userId, body.wrappedKey);
    return this.enrich(conv);
  }

  @Delete('conversations/:id/members/:userId')
  @HttpCode(204)
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    await this.chat.removeGroupMember(id, user.sub, userId);
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  async deleteConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.chat.deleteConversation(user.sub, id);
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

  /** Resolve all member userIds → displayNames and emails in one shot. */
  private async enrich(conv: StoredConversation): Promise<EnrichedConversation> {
    const entries = await Promise.all(
      conv.memberIds.map(async (uid) => {
        const u = await this.users.findById(uid);
        return { uid, name: u?.displayName ?? uid, email: u?.email ?? uid };
      }),
    );
    const tempSession = this.chat.getTempSession(conv.id);
    return {
      ...conv,
      memberNames: Object.fromEntries(entries.map((e) => [e.uid, e.name])),
      memberEmails: Object.fromEntries(entries.map((e) => [e.uid, e.email])),
      tempSessionSince: tempSession ? tempSession.toISOString() : null,
    };
  }
}
