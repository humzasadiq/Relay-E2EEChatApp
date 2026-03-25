import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ChatStorageStrategy,
  CreateConversationInput,
  SaveMessageInput,
  StoredConversation,
  StoredMessage,
} from './chat-storage.strategy';

@Injectable()
export class InMemoryChatStrategy extends ChatStorageStrategy {
  readonly kind = 'in-memory' as const;

  private readonly logger = new Logger(InMemoryChatStrategy.name);
  private readonly conversations = new Map<string, StoredConversation>();
  private readonly messages = new Map<string, StoredMessage[]>();

  constructor() {
    super();
    this.logger.warn('In-memory chat storage active — temporary/unpersisted.');
  }

  async createConversation(input: CreateConversationInput): Promise<StoredConversation> {
    const conv: StoredConversation = {
      id: `mem_${randomUUID()}`,
      type: input.type,
      name: input.name ?? null,
      memberIds: [...input.memberIds],
      temporary: input.temporary,
      createdAt: new Date(),
    };
    this.conversations.set(conv.id, conv);
    this.messages.set(conv.id, []);
    return conv;
  }

  async findConversation(id: string): Promise<StoredConversation | null> {
    return this.conversations.get(id) ?? null;
  }

  async listConversationsForUser(userId: string): Promise<StoredConversation[]> {
    return [...this.conversations.values()]
      .filter((c) => c.memberIds.includes(userId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async saveMessage(input: SaveMessageInput): Promise<StoredMessage> {
    const bucket = this.messages.get(input.conversationId);
    if (!bucket) throw new NotFoundException('Conversation not found');
    const msg: StoredMessage = {
      id: randomUUID(),
      conversationId: input.conversationId,
      senderId: input.senderId,
      ciphertext: input.ciphertext,
      nonce: input.nonce,
      createdAt: new Date(),
    };
    bucket.push(msg);
    return msg;
  }

  async loadHistory(conversationId: string, limit = 50): Promise<StoredMessage[]> {
    const bucket = this.messages.get(conversationId) ?? [];
    return bucket.slice(-limit);
  }

  async addMember(conversationId: string, userId: string): Promise<void> {
    const conv = this.conversations.get(conversationId);
    if (!conv) throw new NotFoundException('Conversation not found');
    if (!conv.memberIds.includes(userId)) conv.memberIds.push(userId);
  }

  async removeMember(conversationId: string, userId: string): Promise<void> {
    const conv = this.conversations.get(conversationId);
    if (!conv) throw new NotFoundException('Conversation not found');
    conv.memberIds = conv.memberIds.filter((id) => id !== userId);
  }
}
