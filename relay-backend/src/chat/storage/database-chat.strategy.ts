import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import {
  ChatStorageStrategy,
  CreateConversationInput,
  SaveMessageInput,
  StoredConversation,
  StoredMessage,
} from './chat-storage.strategy';

@Injectable()
export class DatabaseChatStrategy extends ChatStorageStrategy {
  readonly kind = 'database' as const;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async createConversation(
    input: CreateConversationInput,
  ): Promise<StoredConversation> {
    const conv = await this.prisma.conversation.create({
      data: {
        type: input.type,
        name: input.name ?? null,
        memberships: {
          create: input.memberIds.map((userId, i) => ({
            userId,
            role: i === 0 ? 'OWNER' : 'MEMBER',
          })),
        },
      },
      include: { memberships: true },
    });
    return toStored(conv);
  }

  async findConversation(id: string): Promise<StoredConversation | null> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id },
      include: { memberships: true },
    });
    return conv ? toStored(conv) : null;
  }

  async listConversationsForUser(userId: string): Promise<StoredConversation[]> {
    const convs = await this.prisma.conversation.findMany({
      where: { memberships: { some: { userId } } },
      include: { memberships: true },
      orderBy: { createdAt: 'desc' },
    });
    return convs.map(toStored);
  }

  async saveMessage(input: SaveMessageInput): Promise<StoredMessage> {
    const msg = await this.prisma.message.create({
      data: {
        conversationId: input.conversationId,
        senderId: input.senderId,
        ciphertext: input.ciphertext,
        nonce: input.nonce,
      },
    });
    return { ...msg };
  }

  async loadHistory(conversationId: string, limit = 50): Promise<StoredMessage[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.reverse().map((r) => ({ ...r }));
  }

  async findDirectConversation(
    userId1: string,
    userId2: string,
  ): Promise<StoredConversation | null> {
    const conv = await this.prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { memberships: { some: { userId: userId1 } } },
          { memberships: { some: { userId: userId2 } } },
        ],
      },
      include: { memberships: true },
    });
    return conv ? toStored(conv) : null;
  }

  async addMember(conversationId: string, userId: string): Promise<void> {
    await this.prisma.membership.upsert({
      where: { userId_conversationId: { userId, conversationId } },
      update: {},
      create: { userId, conversationId },
    });
  }

  async removeMember(conversationId: string, userId: string): Promise<void> {
    await this.prisma.membership
      .delete({ where: { userId_conversationId: { userId, conversationId } } })
      .catch(() => {
        throw new NotFoundException('Membership not found');
      });
  }

  async deleteMessagesSince(conversationId: string, since: Date): Promise<void> {
    await this.prisma.message.deleteMany({
      where: { conversationId, createdAt: { gte: since } },
    });
  }
}

function toStored(conv: {
  id: string;
  type: 'DIRECT' | 'GROUP';
  name: string | null;
  createdAt: Date;
  memberships: { userId: string }[];
}): StoredConversation {
  return {
    id: conv.id,
    type: conv.type,
    name: conv.name,
    memberIds: conv.memberships.map((m) => m.userId),
    temporary: false,
    createdAt: conv.createdAt,
  };
}
