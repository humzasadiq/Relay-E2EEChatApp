/**
 * Strategy pattern contract.
 *
 * Three actors live behind this interface:
 *   - DatabaseChatStrategy    — Prisma-backed, durable.
 *   - InMemoryChatStrategy    — Map-backed, wiped on restart.
 *   - DispatchingChatStrategy — the one Nest actually injects. Picks
 *                               between the two above per-conversation
 *                               based on the `temporary` flag and whether
 *                               a database is configured.
 */

export interface StoredMessage {
  id: string;
  conversationId: string;
  senderId: string;
  ciphertext: string;
  nonce: string;
  createdAt: Date;
}

export interface StoredConversation {
  id: string;
  type: 'DIRECT' | 'GROUP';
  name: string | null;
  memberIds: string[];
  temporary: boolean;
  createdAt: Date;
}

export interface CreateConversationInput {
  type: 'DIRECT' | 'GROUP';
  name?: string | null;
  memberIds: string[];
  temporary: boolean;
}

export interface SaveMessageInput {
  conversationId: string;
  senderId: string;
  ciphertext: string;
  nonce: string;
}

export abstract class ChatStorageStrategy {
  abstract readonly kind: 'database' | 'in-memory' | 'dispatching';

  abstract createConversation(
    input: CreateConversationInput,
  ): Promise<StoredConversation>;

  abstract findConversation(id: string): Promise<StoredConversation | null>;

  abstract listConversationsForUser(
    userId: string,
  ): Promise<StoredConversation[]>;

  abstract saveMessage(input: SaveMessageInput): Promise<StoredMessage>;

  abstract loadHistory(
    conversationId: string,
    limit?: number,
  ): Promise<StoredMessage[]>;

  abstract addMember(conversationId: string, userId: string): Promise<void>;

  abstract removeMember(conversationId: string, userId: string): Promise<void>;
}
