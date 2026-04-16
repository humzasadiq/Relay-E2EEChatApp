import { Injectable, Logger } from '@nestjs/common';
import {
  ChatStorageStrategy,
  CreateConversationInput,
  SaveMessageInput,
  StoredConversation,
  StoredMessage,
} from './chat-storage.strategy';
import { DatabaseChatStrategy } from './database-chat.strategy';
import { InMemoryChatStrategy } from './in-memory-chat.strategy';

/**
 * The Strategy pattern made per-conversation.
 *
 * Conversations created with `temporary: true` — or any conversation
 * created while DATABASE_URL is unset — live in the in-memory
 * strategy. Regular conversations with a database configured live in
 * the database strategy.
 *
 * Every call routes to the right underlying strategy without the
 * service layer (or the gateway) ever needing to know the rule.
 */
@Injectable()
export class DispatchingChatStrategy extends ChatStorageStrategy {
  readonly kind = 'dispatching' as const;

  private readonly logger = new Logger(DispatchingChatStrategy.name);
  private readonly routes = new Map<string, ChatStorageStrategy>();
  private readonly dbEnabled: boolean;

  constructor(
    private readonly db: DatabaseChatStrategy,
    private readonly mem: InMemoryChatStrategy,
  ) {
    super();
    this.dbEnabled = Boolean(process.env.DATABASE_URL);
    this.logger.log(
      `Routing: temporary→in-memory, default→${this.dbEnabled ? 'database' : 'in-memory'}`,
    );
  }

  async createConversation(input: CreateConversationInput): Promise<StoredConversation> {
    const target = input.temporary || !this.dbEnabled ? this.mem : this.db;
    const conv = await target.createConversation(input);
    this.routes.set(conv.id, target);
    return conv;
  }

  async findConversation(id: string): Promise<StoredConversation | null> {
    const strategy = await this.resolve(id);
    return strategy ? strategy.findConversation(id) : null;
  }

  async listConversationsForUser(userId: string): Promise<StoredConversation[]> {
    const [fromDb, fromMem] = await Promise.all([
      this.dbEnabled
        ? this.db.listConversationsForUser(userId)
        : Promise.resolve([]),
      this.mem.listConversationsForUser(userId),
    ]);
    for (const c of fromDb) this.routes.set(c.id, this.db);
    for (const c of fromMem) this.routes.set(c.id, this.mem);
    return [...fromDb, ...fromMem].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async saveMessage(input: SaveMessageInput): Promise<StoredMessage> {
    const strategy = await this.requireRoute(input.conversationId);
    return strategy.saveMessage(input);
  }

  async loadHistory(conversationId: string, limit?: number): Promise<StoredMessage[]> {
    const strategy = await this.requireRoute(conversationId);
    return strategy.loadHistory(conversationId, limit);
  }

  async findDirectConversation(
    userId1: string,
    userId2: string,
  ): Promise<StoredConversation | null> {
    const [fromDb, fromMem] = await Promise.all([
      this.dbEnabled
        ? this.db.findDirectConversation(userId1, userId2)
        : Promise.resolve(null),
      this.mem.findDirectConversation(userId1, userId2),
    ]);
    return fromDb ?? fromMem ?? null;
  }

  async addMember(conversationId: string, userId: string): Promise<void> {
    const strategy = await this.requireRoute(conversationId);
    await strategy.addMember(conversationId, userId);
  }

  async removeMember(conversationId: string, userId: string): Promise<void> {
    const strategy = await this.requireRoute(conversationId);
    await strategy.removeMember(conversationId, userId);
  }

  async deleteMessagesSince(conversationId: string, since: Date): Promise<void> {
    const strategy = await this.requireRoute(conversationId);
    await strategy.deleteMessagesSince(conversationId, since);
  }

  async saveConversationKeys(
    conversationId: string,
    wrappedKeys: Record<string, string>,
  ): Promise<void> {
    const strategy = await this.requireRoute(conversationId);
    await strategy.saveConversationKeys(conversationId, wrappedKeys);
  }

  async getWrappedKey(
    conversationId: string,
    userId: string,
  ): Promise<string | null> {
    const strategy = await this.requireRoute(conversationId);
    return strategy.getWrappedKey(conversationId, userId);
  }

  private async resolve(id: string): Promise<ChatStorageStrategy | null> {
    const cached = this.routes.get(id);
    if (cached) return cached;
    // Fast path from the ID shape: mem strategy always prefixes with mem_.
    if (id.startsWith('mem_')) {
      this.routes.set(id, this.mem);
      return this.mem;
    }
    if (this.dbEnabled && (await this.db.findConversation(id))) {
      this.routes.set(id, this.db);
      return this.db;
    }
    return null;
  }

  private async requireRoute(id: string): Promise<ChatStorageStrategy> {
    const s = await this.resolve(id);
    if (!s) throw new Error(`No storage route for conversation ${id}`);
    return s;
  }
}
