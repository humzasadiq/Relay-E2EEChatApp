import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import {
  PublicUser,
  UserRecord,
  UsersService,
} from '../users/users.service';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

interface StoredSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly sessionsByHash = new Map<string, StoredSession>();
  private readonly usingDb: boolean;

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.usingDb = Boolean(process.env.DATABASE_URL);
  }

  async signup(input: {
    email: string;
    displayName: string;
    password: string;
  }): Promise<AuthResult> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await this.users.create({
      email: input.email,
      displayName: input.displayName,
      passwordHash,
    });
    const tokens = await this.issueTokens(user);
    return { user: UsersService.toPublic(user), tokens };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.users.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const tokens = await this.issueTokens(user);
    return { user: UsersService.toPublic(user), tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const hash = hashToken(refreshToken);
    const session = await this.findSession(hash);
    if (!session || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session expired');
    }
    await this.revokeSession(hash);
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException('User missing');
    return this.issueTokens(user);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.revokeSession(hashToken(refreshToken));
  }

  private async issueTokens(user: UserRecord): Promise<AuthTokens> {
    const accessSecret = this.config.get<string>('JWT_ACCESS_SECRET')!;
    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET')!;
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL') ?? '15m';
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL') ?? '30d';
    const jti = randomBytes(16).toString('hex');

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email },
      { secret: accessSecret, expiresIn: accessTtl as unknown as number },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti },
      { secret: refreshSecret, expiresIn: refreshTtl as unknown as number },
    );

    const refreshExpiresAt = new Date(
      Date.now() + parseDuration(refreshTtl),
    );
    await this.storeSession({
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
    });
    return { accessToken, refreshToken, refreshExpiresAt };
  }

  private async storeSession(input: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    if (this.usingDb) {
      await this.prisma.session.create({
        data: {
          userId: input.userId,
          refreshTokenHash: input.refreshTokenHash,
          expiresAt: input.expiresAt,
        },
      });
      return;
    }
    this.sessionsByHash.set(input.refreshTokenHash, {
      id: randomBytes(8).toString('hex'),
      ...input,
    });
  }

  private async findSession(hash: string): Promise<StoredSession | null> {
    if (this.usingDb) {
      const s = await this.prisma.session.findUnique({
        where: { refreshTokenHash: hash },
      });
      if (!s) return null;
      return {
        id: s.id,
        userId: s.userId,
        refreshTokenHash: s.refreshTokenHash,
        expiresAt: s.expiresAt,
      };
    }
    return this.sessionsByHash.get(hash) ?? null;
  }

  private async revokeSession(hash: string): Promise<void> {
    if (this.usingDb) {
      await this.prisma.session
        .delete({ where: { refreshTokenHash: hash } })
        .catch(() => undefined);
      return;
    }
    this.sessionsByHash.delete(hash);
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseDuration(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2];
  const mult = unit === 's' ? 1e3 : unit === 'm' ? 6e4 : unit === 'h' ? 36e5 : 864e5;
  return n * mult;
}
