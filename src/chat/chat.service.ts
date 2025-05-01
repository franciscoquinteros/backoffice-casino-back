// src/chat/chat.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Chat } from './entities/chat.entity';


@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Chat)
    private chatRepository: Repository<Chat>,
  ) { }

  async saveMessage(userId: string, message: string, sender: string, conversationId: string, agentId?: string): Promise<Chat> {
    const chat = this.chatRepository.create({
      userId,
      message,
      sender,
      agentId,
      conversationId,
    });
    return this.chatRepository.save(chat);
  }

  async getMessagesByUserId(userId: string): Promise<Chat[]> {
    return this.chatRepository.find({
      where: { userId },
      order: { timestamp: 'ASC' },
    });
  }

  async getMessagesByConversationId(conversationId: string): Promise<Chat[]> {
    return this.chatRepository.find({
      where: { conversationId },
      order: { timestamp: 'ASC' },
    });
  }

  async assignAgent(userId: string, agentId: string): Promise<void> {
    const existingMessages = await this.chatRepository.findOne({ where: { userId } });
    if (!existingMessages || !existingMessages.agentId) {
      await this.chatRepository.update({ userId }, { agentId });
    }
  }

  async getAssignedAgent(userId: string): Promise<string | null> {
    const message = await this.chatRepository.findOne({ where: { userId, agentId: null } });
    return message ? null : (await this.chatRepository.findOne({ where: { userId } })).agentId;
  }

  async getActiveChats(): Promise<Chat[]> { // Asegura que el tipo de retorno sea Chat[]
    // EJEMPLO: Si buscas directamente en Chat
    return this.chatRepository.find({
      where: { /* tu condición para "activo", ej: status: 'active' */ },
      relations: [/* 'conversation', 'user', 'agent' si necesitas esas relaciones */],
      // ¡NO USES UN 'select' QUE LIMITE LOS CAMPOS NECESARIOS!
      // select: ['id', 'message', 'sender', 'timestamp', 'userId', 'agentId', 'conversationId'] // Si necesitas ser explícito, incluye TODO
    });

    // EJEMPLO: Si se basa en Conversaciones activas
    /*
    const activeConversations = await this.conversationRepository.find({
         where: { status: 'active' },
         relations: ['chats', 'chats.user', 'chats.agent'] // Carga los chats asociados
    });
    // Extrae todos los chats de esas conversaciones
    const allChats = activeConversations.flatMap(conv => conv.chats || []);
    return allChats;
    */
  }

  /* async getActiveChats(): Promise<{ userId: string; agentId: string | null }[]> {
    const messages = await this.chatRepository
      .createQueryBuilder('chat')
      .distinctOn(['chat.userId'])
      .select(['chat.userId', 'chat.agentId', 'chat.conversationId'])
      .orderBy('chat.userId')
      .getRawMany();
    return messages;
  } */
}