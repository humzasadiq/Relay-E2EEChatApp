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
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post('conversations')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateConversationDto,
  ) {
    return this.chat.createConversation(user.sub, {
      type: dto.type,
      name: dto.name ?? null,
      memberIds: dto.memberIds,
      temporary: dto.temporary ?? false,
    });
  }

  @Get('conversations')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.listConversations(user.sub);
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
}
