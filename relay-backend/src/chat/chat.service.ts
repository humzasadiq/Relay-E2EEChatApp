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

export interface ConversationDeletedEvent {
  conversationId: string;
  memberIds: string[];
}

@Injectable()
export class ChatService {
  /**
   * Observer pattern publisher. The gateway subscribes and broadcasts.
   * Other subscribers (notifications, unread counters, analytics) can
   * plug in without touching the publish site below.
   */
  readonly messageCreated$ = new Subject<MessageCreatedEvent>();
  readonly messageDeleted$ = new Subject<{ conversationId: string; messageId: string }>();
  readonly conversationCreated$ = new Subject<ConversationCreatedEvent>();
  readonly conversationDeleted$ = new Subject<ConversationDeletedEvent>();
  readonly tempStarted$ = new Subject<TempSessionEvent>();
  readonly tempEnded$ = new Subject<TempSessionEvent>();
  readonly memberAdded$ = new Subject<{ conversationId: string; addedUserId: string; memberIds: string[] }>();
  readonly memberRemoved$ = new Subject<{ conversationId: string; removedUserId: string; remainingMemberIds: string[] }>();


  constructor(
    @Inject(CHAT_STORAGE) private readonly storage: ChatStorageStrategy,
  ) {}

  async createConversation(
    creatorId: string,
    input: Omit<CreateConversationInput, 'memberIds'> & {
      memberIds: string[];
      wrappedKeys?: Record<string, string>;
    },
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
    if (input.wrappedKeys) {
      await this.storage.saveConversationKeys(conv.id, input.wrappedKeys);
    }
    this.conversationCreated$.next({ conv });
    return conv;
  }

  async getWrappedKey(
    userId: string,
    conversationId: string,
  ): Promise<string | null> {
    await this.requireMember(conversationId, userId);
    return this.storage.getWrappedKey(conversationId, userId);
  }

  async saveWrappedKeys(
    userId: string,
    conversationId: string,
    wrappedKeys: Record<string, string>,
  ): Promise<void> {
    await this.requireMember(conversationId, userId);
    await this.storage.saveConversationKeys(conversationId, wrappedKeys);
  }

  listConversations(userId: string): Promise<StoredConversation[]> {
    return this.storage.listConversationsForUser(userId);
  }

  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    const conv = await this.requireMember(conversationId, userId);
    const memberIds = [...conv.memberIds];
    this.storage.deactivateTempSession(conversationId);
    await this.storage.deleteConversation(conversationId);
    this.conversationDeleted$.next({ conversationId, memberIds });
  }

  async getHistory(
    userId: string,
    conversationId: string,
    limit?: number,
  ): Promise<StoredMessage[]> {
    await this.requireMember(conversationId, userId);
    return this.storage.loadHistory(conversationId, limit);
  }

  async deleteMessage(
    conversationId: string,
    messageId: string,
    senderId: string,
  ): Promise<boolean> {
    await this.requireMember(conversationId, senderId);
    const deleted = await this.storage.deleteMessage(conversationId, messageId, senderId);
    if (deleted) {
      this.messageDeleted$.next({ conversationId, messageId });
    }
    return deleted;
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
    return this.storage.getTempSession(conversationId);
  }

  async toggleTempSession(
    conversationId: string,
    userId: string,
  ): Promise<{ started: boolean; since: Date }> {
    await this.requireMember(conversationId, userId);
    const existing = this.storage.getTempSession(conversationId);
    if (existing) {
      this.storage.deactivateTempSession(conversationId);
      this.tempEnded$.next({ conversationId, since: existing });
      return { started: false, since: existing };
    } else {
      const since = this.storage.activateTempSession(conversationId);
      this.tempStarted$.next({ conversationId, since });
      return { started: true, since };
    }
  }

  async addGroupMember(
    conversationId: string,
    requesterId: string,
    targetUserId: string,
    wrappedKey: string,
  ): Promise<StoredConversation> {
    const conv = await this.requireMember(conversationId, requesterId);
    if (conv.type !== 'GROUP')
      throw new ForbiddenException('Only group conversations support adding members');
    if (conv.ownerId !== requesterId)
      throw new ForbiddenException('Only the group owner can add members');
    if (conv.memberIds.includes(targetUserId))
      throw new ForbiddenException('User is already a member');
    await this.storage.addMember(conversationId, targetUserId);
    await this.storage.saveConversationKeys(conversationId, { [targetUserId]: wrappedKey });
    const updated = (await this.storage.findConversation(conversationId))!;
    this.memberAdded$.next({
      conversationId,
      addedUserId: targetUserId,
      memberIds: updated.memberIds,
    });
    return updated;
  }

  async removeGroupMember(
    conversationId: string,
    requesterId: string,
    targetUserId: string,
  ): Promise<void> {
    const conv = await this.requireMember(conversationId, requesterId);
    if (conv.type !== 'GROUP')
      throw new ForbiddenException('Only group conversations support removing members');
    if (conv.ownerId !== requesterId)
      throw new ForbiddenException('Only the group owner can remove members');
    if (targetUserId === requesterId)
      throw new ForbiddenException('Cannot remove yourself — delete the conversation instead');
    if (!conv.memberIds.includes(targetUserId))
      throw new NotFoundException('User is not a member of this conversation');
    await this.storage.removeMember(conversationId, targetUserId);
    const remainingMemberIds = conv.memberIds.filter((id) => id !== targetUserId);
    this.memberRemoved$.next({ conversationId, removedUserId: targetUserId, remainingMemberIds });
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
