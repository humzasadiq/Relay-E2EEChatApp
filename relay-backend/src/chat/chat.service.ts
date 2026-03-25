import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Subject } from 'rxjs';
import { CHAT_STORAGE } from './storage/chat-storage.token';
import {
  ChatStorageStrategy,
  CreateConversationInput,
  StoredConversation,
  StoredMessage,
} from './storage/chat-storage.strategy';

export interface MessageCreatedEvent {
  conversationId: string;
  message: StoredMessage;
}

@Injectable()
export class ChatService {
  /**
   * Observer pattern publisher. The gateway subscribes and broadcasts.
   * Other subscribers (notifications, unread counters, analytics) can
   * plug in without touching the publish site below.
   */
  readonly messageCreated$ = new Subject<MessageCreatedEvent>();

  constructor(
    @Inject(CHAT_STORAGE) private readonly storage: ChatStorageStrategy,
  ) {}

  createConversation(
    creatorId: string,
    input: Omit<CreateConversationInput, 'memberIds'> & { memberIds: string[] },
  ): Promise<StoredConversation> {
    const memberIds = Array.from(
      new Set([creatorId, ...input.memberIds]),
    );
    if (input.type === 'DIRECT' && memberIds.length !== 2) {
      throw new ForbiddenException('Direct conversations need exactly 2 members');
    }
    return this.storage.createConversation({ ...input, memberIds });
  }

  listConversations(userId: string): Promise<StoredConversation[]> {
    return this.storage.listConversationsForUser(userId);
  }

  async getHistory(
    userId: string,
    conversationId: string,
    limit?: number,
  ): Promise<StoredMessage[]> {
    await this.requireMember(conversationId, userId);
    return this.storage.loadHistory(conversationId, limit);
  }

  async sendMessage(input: {
    conversationId: string;
    senderId: string;
    ciphertext: string;
    nonce: string;
  }): Promise<StoredMessage> {
    await this.requireMember(input.conversationId, input.senderId);
    const message = await this.storage.saveMessage(input);
    this.messageCreated$.next({
      conversationId: input.conversationId,
      message,
    });
    return message;
  }

  async findMembership(
    conversationId: string,
    userId: string,
  ): Promise<StoredConversation | null> {
    const conv = await this.storage.findConversation(conversationId);
    if (!conv) return null;
    return conv.memberIds.includes(userId) ? conv : null;
  }

  private async requireMember(
    conversationId: string,
    userId: string,
  ): Promise<StoredConversation> {
    const conv = await this.storage.findConversation(conversationId);
    if (!conv) throw new NotFoundException('Conversation not found');
    if (!conv.memberIds.includes(userId)) {
      throw new ForbiddenException('Not a member of this conversation');
    }
    return conv;
  }
}
