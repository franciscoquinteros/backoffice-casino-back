import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { CreateConversationDto } from './dto/conversation.dto';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
  ) { }

  /* async createConversation(createConversationDto: CreateConversationDto | string): Promise<Conversation> {
    let conversation;
    
    if (typeof createConversationDto === 'string') {
      // Si se pasa un string, asumimos que es el userId
      conversation = this.conversationRepository.create({
        userId: createConversationDto,
        title: `Conversación de ${createConversationDto}`,
        status: 'active',
      });
    } else {
      // Caso normal con DTO
      conversation = this.conversationRepository.create({
        userId: createConversationDto.userId,
        title: createConversationDto.title || `Conversación de ${createConversationDto.userId}`,
        status: 'active',
      });
    }
    
    return this.conversationRepository.save(conversation);
  } */

  async createConversation(createConversationDto: CreateConversationDto | string): Promise<Conversation> {
    let conversation;

    if (typeof createConversationDto === 'string') {
      // Si se pasa un string, asumimos que es el userId
      conversation = this.conversationRepository.create({
        userId: createConversationDto,
        title: `Conversación de ${createConversationDto}`,
        status: 'active',
        // Las relaciones initiatingUser y assignedAgent se establecerán si asignas User objects
        // o si TypeORM las resuelve automáticamente al guardar si los IDs existen.
      });
    } else {
      // Caso normal con DTO
      conversation = this.conversationRepository.create({
        userId: createConversationDto.userId,
        title: createConversationDto.title || `Conversación de ${createConversationDto.userId}`,
        status: 'active',
        officeId: createConversationDto.officeId,
        // Si el DTO incluye agentId, asegúrate de que se asigne aquí y que la relación se resuelva.
        // agentId: createConversationDto.agentId, // <-- Si viene en el DTO
      });
    }

    return this.conversationRepository.save(conversation);
  }


  /* async getConversationById(id: string): Promise<Conversation> {
    return this.conversationRepository.findOne({
      where: { id },
      relations: ['messages']
    });
  } */
  async getConversationById(id: string, officeId?: string): Promise<Conversation | null> { // <-- Aceptar officeId opcional

    const queryBuilder = this.conversationRepository.createQueryBuilder('conversation');

    queryBuilder.where('conversation.id = :id', { id }); // Siempre filtrar por ID

    // Si se proporciona officeId, filtrar directamente por office_id
    if (officeId) {
      queryBuilder.andWhere('conversation.office_id = :officeId', { officeId });
    }

    // Añadir relaciones
    queryBuilder.leftJoinAndSelect('conversation.messages', 'messages');

    const conversation = await queryBuilder.getOne();

    if (!conversation) {
      throw new NotFoundException(`Conversation with ID ${id} not found${officeId ? ` in office ${officeId}` : ''}`);
    }

    return conversation;
  }


  async getActiveConversationsByUserId(userId: string, officeId?: string): Promise<Conversation[]> {
    const query: any = { userId, status: 'active' };

    // Si se proporciona officeId, añadirlo al filtro
    if (officeId) {
      query.officeId = officeId;
    }

    return this.conversationRepository.find({
      where: query,
      order: { updatedAt: 'DESC' },
    });
  }

  async getActiveConversations(officeId?: string, agentId?: string): Promise<Conversation[]> { // <-- Aceptar officeId y agentId opcional

    // Usar QueryBuilder para filtrar
    const queryBuilder = this.conversationRepository.createQueryBuilder('conversation'); // Alias principal

    // Condición WHERE para status activo
    queryBuilder.where('conversation.status = :status', { status: 'active' });

    // Si se proporciona officeId, filtrar directamente por el office_id de la conversación
    if (officeId) {
      queryBuilder.andWhere('conversation.office_id = :officeId', { officeId });
    }

    // Si se proporciona agentId, filtrar para mostrar solo las conversaciones:
    // 1. Asignadas a este agente, O
    // 2. Sin agente asignado (agentId es NULL)
    if (agentId) {
      queryBuilder.andWhere('(conversation.agent_id = :agentId OR conversation.agent_id IS NULL)', { agentId });
    }

    // Añadir ordenación
    queryBuilder.orderBy('conversation.updatedAt', 'DESC');

    // Ejecutar la consulta
    const conversations = await queryBuilder.getMany();

    return conversations; // Devuelve array de ConversationEntity
  }

  async getClosedConversations(officeId?: string, agentId?: string): Promise<Conversation[]> { // <-- Aceptar officeId y agentId opcional

    // Usar QueryBuilder para filtrar
    const queryBuilder = this.conversationRepository.createQueryBuilder('conversation'); // Alias principal

    // Condición WHERE para status cerrado
    queryBuilder.where('conversation.status = :status', { status: 'closed' });

    // Si se proporciona officeId, filtrar directamente por el office_id de la conversación
    if (officeId) {
      queryBuilder.andWhere('conversation.office_id = :officeId', { officeId });
    }

    // Si se proporciona agentId, filtrar para mostrar solo las conversaciones:
    // 1. Asignadas a este agente, O
    // 2. Sin agente asignado (agentId es NULL)
    if (agentId) {
      queryBuilder.andWhere('(conversation.agent_id = :agentId OR conversation.agent_id IS NULL)', { agentId });
    }

    // Añadir ordenación
    queryBuilder.orderBy('conversation.updatedAt', 'DESC');

    // Ejecutar la consulta
    const conversations = await queryBuilder.getMany();

    return conversations; // Devuelve array de ConversationEntity
  }


  async getAllConversationsByUserId(userId: string, officeId?: string): Promise<Conversation[]> {
    const query: any = { userId };

    // Si se proporciona officeId, añadirlo al filtro
    if (officeId) {
      query.officeId = officeId;
    }

    return this.conversationRepository.find({
      where: query,
      order: { updatedAt: 'DESC' },
    });
  }

  async assignAgentToConversation(conversationId: string, agentId: string): Promise<Conversation> {
    await this.conversationRepository.update(
      { id: conversationId },
      { agentId }
    );
    return this.getConversationById(conversationId);
  }

  async closeConversation(conversationId: string): Promise<Conversation> {
    await this.conversationRepository.update(
      { id: conversationId },
      { status: 'closed' }
    );
    return this.getConversationById(conversationId);
  }

  async reopenConversation(conversationId: string): Promise<Conversation> {
    await this.conversationRepository.update(
      { id: conversationId },
      { status: 'active' }
    );
    return this.getConversationById(conversationId);
  }

  /* async getActiveConversations(): Promise<Conversation[]> {
    return this.conversationRepository.find({
      where: { status: 'active' },
      order: { updatedAt: 'DESC' },
    });
  } */

  a/* sync getClosedConversations(): Promise<Conversation[]> {
    return this.conversationRepository.find({
      where: { status: 'closed' },
      order: { updatedAt: 'DESC' },
    });
  } */


  async getUserConversations(userId: string): Promise<Conversation[]> {
    return this.conversationRepository.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  async updateConversationTimestamp(conversationId: string): Promise<void> {
    await this.conversationRepository.update(
      { id: conversationId },
      { updatedAt: new Date() }
    );
  }

  // Método de ayuda para obtener conversaciones cerradas por userId
  async getClosedConversationsByUserId(userId: string, officeId?: string): Promise<Conversation[]> {
    const allConversations = await this.getAllConversationsByUserId(userId, officeId);
    return allConversations.filter(conv => conv.status === 'closed');
  }
} 