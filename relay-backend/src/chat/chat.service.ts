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

export interface TempSessionEvent {
  conversationId: string;
  since: Date;
}

export interface ConversationCreatedEvent {
  conv: StoredConversation;
}

@Injectable()
export class ChatService {
  /**
   * Observer pattern publisher. The gateway subscribes and broadcasts.
   * Other subscribers (notifications, unread counters, analytics) can
   * plug in without touching the publish site below.
   */
  readonly messageCreated$ = new Subject<MessageCreatedEvent>();
  readonly conversationCreated$ = new Subject<ConversationCreatedEvent>();
  readonly tempStarted$ = new Subject<TempSessionEvent>();
  readonly tempEnded$ = new Subject<TempSessionEvent>();

  /** In-memory map of conversationId → session start time */
  private readonly tempSessions = new Map<string, Date>();

  constructor(
    @Inject(CHAT_STORAGE) private readonly storage: ChatStorageStrategy,
  ) {}

  async createConversation(
    creatorId: string,
    input: Omit<CreateConversationInput, 'memberIds'> & { memberIds: string[] },
  ): Promise<StoredConversation> {
    const memberIds = Array.from(new Set([creatorId, ...input.memberIds]));
    if (input.type === 'DIRECT' && memberIds.length !== 2) {
      throw new ForbiddenException('Direct conversations need exactly 2 members');
    }
    // Find-or-create: reuse an existing DM rather than creating duplicates
    if (input.type === 'DIRECT') {
      const existing = await this.storage.findDirectConversation(
        memberIds[0],
        memberIds[1],
      );
      if (existing) return existing;
    }
    const conv = await this.storage.createConversation({ ...input, memberIds });
    this.conversationCreated$.next({ conv });
    return conv;
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

  getTempSession(conversationId: string): Date | null {
    return this.tempSessions.get(conversationId) ?? null;
  }

  async toggleTempSession(
    conversationId: string,
    userId: string,
  ): Promise<{ started: boolean; since: Date }> {
    await this.requireMember(conversationId, userId);
    const existing = this.tempSessions.get(conversationId);
    if (existing) {
      this.tempSessions.delete(conversationId);
      await this.storage.deleteMessagesSince(conversationId, existing);
      this.tempEnded$.next({ conversationId, since: existing });
      return { started: false, since: existing };
    } else {
      const since = new Date();
      this.tempSessions.set(conversationId, since);
      this.tempStarted$.next({ conversationId, since });
      return { started: true, since };
    }
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
