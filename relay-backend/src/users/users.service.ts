import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  passwordHash: string;
  createdAt: Date;
}

export type PublicUser = Omit<UserRecord, 'passwordHash'>;

/**
 * UsersService transparently switches between Prisma and an in-memory
 * Map when DATABASE_URL is unset — same spirit as the chat storage
 * strategy, kept inline here because the user schema is tiny.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly byId = new Map<string, UserRecord>();
  private readonly byEmail = new Map<string, UserRecord>();
  private readonly usingDb: boolean;

  constructor(private readonly prisma: PrismaService) {
    this.usingDb = Boolean(process.env.DATABASE_URL);
    if (!this.usingDb) {
      this.logger.warn('Users running in-memory — accounts lost on restart.');
    }
  }

  async create(input: {
    email: string;
    displayName: string;
    passwordHash: string;
  }): Promise<UserRecord> {
    if (this.usingDb) {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash: input.passwordHash,
        },
      });
      return toRecord(user);
    }
    const user: UserRecord = {
      id: randomUUID(),
      email: input.email,
      displayName: input.displayName,
      avatarUrl: null,
      passwordHash: input.passwordHash,
      createdAt: new Date(),
    };
    this.byId.set(user.id, user);
    this.byEmail.set(user.email.toLowerCase(), user);
    return user;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    if (this.usingDb) {
      const u = await this.prisma.user.findUnique({ where: { email } });
      return u ? toRecord(u) : null;
    }
    return this.byEmail.get(email.toLowerCase()) ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    if (this.usingDb) {
      const u = await this.prisma.user.findUnique({ where: { id } });
      return u ? toRecord(u) : null;
    }
    return this.byId.get(id) ?? null;
  }

  async update(
    id: string,
    patch: { displayName?: string },
  ): Promise<UserRecord | null> {
    if (this.usingDb) {
      const u = await this.prisma.user.update({
        where: { id },
        data: patch,
      });
      return toRecord(u);
    }
    const existing = this.byId.get(id);
    if (!existing) return null;
    const updated: UserRecord = {
      ...existing,
      displayName: patch.displayName ?? existing.displayName,
    };
    this.byId.set(id, updated);
    this.byEmail.set(updated.email.toLowerCase(), updated);
    return updated;
  }

  static toPublic(user: UserRecord): PublicUser {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...rest } = user;
    return rest;
  }
}

function toRecord(u: {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  passwordHash: string;
  createdAt: Date;
}): UserRecord {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    passwordHash: u.passwordHash,
    createdAt: u.createdAt,
  };
}
