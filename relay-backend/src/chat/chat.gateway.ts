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
    this.chat.conversationDeleted$.subscribe((event) => {
      for (const memberId of event.memberIds) {
        this.server
          .to(`user:${memberId}`)
          .emit('conv:deleted', { conversationId: event.conversationId });
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
    this.chat.memberAdded$.subscribe((event) => {
      // Notify the new member so their sidebar picks up the conversation
      this.server
        .to(`user:${event.addedUserId}`)
        .emit('conv:new', { conversationId: event.conversationId });
      // Notify everyone already in the room to refresh their member list
      this.server.to(event.conversationId).emit('group:member-added', {
        conversationId: event.conversationId,
        userId: event.addedUserId,
      });
    });
    this.chat.memberRemoved$.subscribe((event) => {
      // Tell the removed user their membership is gone
      this.server
        .to(`user:${event.removedUserId}`)
        .emit('group:kicked', { conversationId: event.conversationId });
      // Tell remaining members to refresh (and rotate key cache)
      this.server.to(event.conversationId).emit('group:member-removed', {
        conversationId: event.conversationId,
        userId: event.removedUserId,
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

  // ── WebRTC call signaling ──────────────────────────────────────────────────
  // All handlers are relay-only: validate membership then forward to the
  // target user's personal room. No call state is persisted on the server.

  @SubscribeMessage('call:offer')
  async handleCallOffer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    payload: {
      conversationId: string;
      recipientId: string;
      offer: RTCSessionDescriptionInit;
      isVideo: boolean;
    },
  ) {
    const userId = this.requireUser(client);
    const conv = await this.chat.findMembership(payload.conversationId, userId);
    if (!conv) throw new WsException('Not a member of this conversation');
    if (!conv.memberIds.includes(payload.recipientId)) {
      throw new WsException('Recipient is not in this conversation');
    }
    this.server.to(`user:${payload.recipientId}`).emit('call:incoming', {
      callerId: userId,
      conversationId: payload.conversationId,
      offer: payload.offer,
      isVideo: payload.isVideo,
    });
    return { ok: true };
  }

  @SubscribeMessage('call:answer')
  async handleCallAnswer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    payload: {
      conversationId: string;
      callerId: string;
      answer: RTCSessionDescriptionInit;
    },
  ) {
    const userId = this.requireUser(client);
    const conv = await this.chat.findMembership(payload.conversationId, userId);
    if (!conv) throw new WsException('Not a member of this conversation');
    this.server.to(`user:${payload.callerId}`).emit('call:answered', {
      answererId: userId,
      conversationId: payload.conversationId,
      answer: payload.answer,
    });
    return { ok: true };
  }

  @SubscribeMessage('call:ice-candidate')
  async handleIceCandidate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    payload: {
      conversationId: string;
      targetUserId: string;
      candidate: RTCIceCandidateInit;
    },
  ) {
    const userId = this.requireUser(client);
    const conv = await this.chat.findMembership(payload.conversationId, userId);
    if (!conv) throw new WsException('Not a member of this conversation');
    this.server.to(`user:${payload.targetUserId}`).emit('call:ice-candidate', {
      fromUserId: userId,
      candidate: payload.candidate,
    });
    return { ok: true };
  }

  @SubscribeMessage('call:reject')
  async handleCallReject(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { conversationId: string; callerId: string },
  ) {
    const userId = this.requireUser(client);
    this.server.to(`user:${payload.callerId}`).emit('call:rejected', {
      rejecterId: userId,
      conversationId: payload.conversationId,
    });
    return { ok: true };
  }

  @SubscribeMessage('call:hangup')
  async handleCallHangup(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { conversationId: string },
  ) {
    const userId = this.requireUser(client);
    const conv = await this.chat.findMembership(payload.conversationId, userId);
    if (!conv) throw new WsException('Not a member of this conversation');
    for (const memberId of conv.memberIds) {
      if (memberId !== userId) {
        this.server.to(`user:${memberId}`).emit('call:ended', {
          byUserId: userId,
          conversationId: payload.conversationId,
        });
      }
    }
    return { ok: true };
  }

  private requireUser(client: AuthedSocket): string {
    const id = client.data.userId;
    if (!id) throw new WsException('Unauthenticated');
    return id;
  }
}
