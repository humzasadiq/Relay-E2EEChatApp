import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Singleton pattern:
 * Nest providers are singletons, so every module that injects PrismaService
 * shares one PrismaClient instance — one connection pool for the whole app.
 *
 * If DATABASE_URL is empty we skip the Prisma connect entirely; the app
 * will run on the in-memory chat strategy (see ChatStorageProvider).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly enabled: boolean;

  constructor() {
    const enabled = Boolean(process.env.DATABASE_URL);
    super(
      enabled
        ? undefined
        : { datasources: { db: { url: 'postgresql://disabled:disabled@localhost:5432/disabled' } } },
    );
    this.enabled = enabled;
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('DATABASE_URL not set — Prisma will not connect.');
      return;
    }
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy() {
    if (this.enabled) await this.$disconnect();
  }
}
