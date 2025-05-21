// src/chat/chat.module.ts
import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { Chat } from './entities/chat.entity';
import { Conversation } from './entities/conversation.entity';
import { ConversationService } from './conversation.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from './chat.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Chat, Conversation])],
  providers: [ChatGateway, ChatService, ConversationService],
  controllers: [ChatController],
  exports: [ChatService, ConversationService]
})
export class ChatModule { }
