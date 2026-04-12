import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

interface AuthedSocket extends Socket {
  data: { userId?: string; email?: string };
}

/**
 * Observer (the explicit half of Pub/Sub):
 *   ChatService.messageCreated$  ── publisher
 *   ChatGateway                  ── observer; broadcasts to the room
 * Services stay ignorant of Socket.io; new subscribers can attach to
 * the same subject without any change in the publish path.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer() private readonly server!: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chat: ChatService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.chat.messageCreated$.subscribe((event) => {
      this.server.to(event.conversationId).emit('message:new', event.message);
    });
    this.chat.conversationCreated$.subscribe((event) => {
      // Notify each member via their personal room so they can refresh their list
      for (const memberId of event.conv.memberIds) {
        this.server
          .to(`user:${memberId}`)
          .emit('conv:new', { conversationId: event.conv.id });
      }
    });
    this.chat.tempStarted$.subscribe((event) => {
      this.server.to(event.conversationId).emit('temp:started', {
        conversationId: event.conversationId,
        since: event.since.toISOString(),
      });
    });
    this.chat.tempEnded$.subscribe((event) => {
      this.server.to(event.conversationId).emit('temp:ended', {
        conversationId: event.conversationId,
        since: event.since.toISOString(),
      });
    });
  }

  async handleConnection(client: AuthedSocket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.query?.token as string | undefined);
      if (!token) throw new Error('Missing token');
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string }>(
        token,
        { secret: this.config.get<string>('JWT_ACCESS_SECRET') },
      );
      client.data.userId = payload.sub;
      client.data.email = payload.email;
      // Auto-join personal room so the client receives conversation notifications
      await client.join(`user:${payload.sub}`);
      this.logger.debug(`ws connect: ${payload.email} (${client.id})`);
    } catch (err) {
      this.logger.warn(`ws auth failed: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket) {
    this.logger.debug(`ws disconnect: ${client.id}`);
  }

  @SubscribeMessage('chat:join')
  async join(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { conversationId: string },
  ) {
    const userId = this.requireUser(client);
    const conv = await this.chat.findMembership(payload.conversationId, userId);
    if (!conv) throw new WsException('Not a member of this conversation');
    await client.join(conv.id);
    return { ok: true };
  }

  @SubscribeMessage('chat:leave')
  async leave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { conversationId: string },
  ) {
    await client.leave(payload.conversationId);
    return { ok: true };
  }

  @SubscribeMessage('chat:send')
  async send(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    payload: { conversationId: string; ciphertext: string; nonce: string },
  ) {
    const userId = this.requireUser(client);
    const message = await this.chat.sendMessage({
      conversationId: payload.conversationId,
      senderId: userId,
      ciphertext: payload.ciphertext,
      nonce: payload.nonce,
    });
    return { ok: true, message };
  }

  @SubscribeMessage('temp:toggle')
  async toggleTemp(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { conversationId: string },
  ) {
    const userId = this.requireUser(client);
    const result = await this.chat.toggleTempSession(
      payload.conversationId,
      userId,
    );
    return { ok: true, started: result.started, since: result.since.toISOString() };
  }

  private requireUser(client: AuthedSocket): string {
    const id = client.data.userId;
    if (!id) throw new WsException('Unauthenticated');
    return id;
  }
}
