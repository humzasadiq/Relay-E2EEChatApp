import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { CHAT_STORAGE } from './storage/chat-storage.token';
import { DatabaseChatStrategy } from './storage/database-chat.strategy';
import { DispatchingChatStrategy } from './storage/dispatching-chat.strategy';
import { InMemoryChatStrategy } from './storage/in-memory-chat.strategy';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatGateway,
    DatabaseChatStrategy,
    InMemoryChatStrategy,
    DispatchingChatStrategy,
    { provide: CHAT_STORAGE, useExisting: DispatchingChatStrategy },
  ],
})
export class ChatModule {}
