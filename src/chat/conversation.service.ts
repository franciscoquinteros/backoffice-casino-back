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
    console.log(`ConversationService: Buscando conversación ID ${id}${officeId ? ` en oficina ${officeId}` : ''}`);

    const queryBuilder = this.conversationRepository.createQueryBuilder('conversation');

    queryBuilder.where('conversation.id = :id', { id }); // Siempre filtrar por ID

    // Si se proporciona officeId, añadir los JOINs y la condición WHERE
    if (officeId) {
      // Hacemos LEFT JOINs a las relaciones de usuario/agente
      // Esto nos permite filtrar por la oficina de cualquiera de los usuarios relacionados
      queryBuilder
        .leftJoin('conversation.initiatingUser', 'initiatorUser') // JOIN al usuario que inició
        .leftJoin('conversation.assignedAgent', 'agentUser') // JOIN al agente asignado
        // Añadir la condición WHERE para filtrar si el iniciador O el agente están en la oficina
        // Usamos AND WHERE para combinar con la condición del ID de conversación
        .andWhere('(initiatorUser.office = :userOffice OR agentUser.office = :userOffice)', { userOffice: officeId });
      // NOTA: Si una conversación NO tiene agente asignado (agentId es null), agentUser será null en el JOIN,
      // y la condición 'agentUser.office = :userOffice' será falsa para esa parte del OR,
      // pero la conversación se incluirá si el initiatingUser está en la oficina.
      // Si una conversación NO tiene initiatingUser (menos común), se incluirá si el assignedAgent está en la oficina.
    }


    // Añadir relaciones si son necesarias (ej: mensajes)
    // leftJoinAndSelect carga la relación. Si solo necesitas filtrar, usa leftJoin sin Select.
    queryBuilder.leftJoinAndSelect('conversation.messages', 'messages');
    // Opcional: Cargar los usuarios relacionados si los necesitas en el resultado
    // queryBuilder.leftJoinAndSelect('conversation.initiatingUser', 'initiatorUser');
    // queryBuilder.leftJoinAndSelect('conversation.assignedAgent', 'agentUser');


    const conversation = await queryBuilder.getOne(); // Usar getOne para obtener un solo resultado

    // La lógica de NotFoundException se mantiene igual
    if (!conversation) {
      // Si no se encontró la conversación (ya sea por ID incorrecto o porque no pertenece a la oficina filtrada)
      throw new NotFoundException(`Conversation with ID ${id} not found${officeId ? ` in office ${officeId}` : ''}`);
    }


    return conversation; // Devuelve ConversationEntity (con relaciones cargadas)
  }


  async getActiveConversationsByUserId(userId: string): Promise<Conversation[]> {
    return this.conversationRepository.find({
      where: { userId, status: 'active' },
      order: { updatedAt: 'DESC' },
    });
  }

  async getActiveConversations(officeId?: string): Promise<Conversation[]> { // <-- Aceptar officeId opcional
    console.log(`ConversationService: Buscando conversaciones activas${officeId ? ` para oficina ${officeId}` : ''}`);

    // Usar QueryBuilder para filtrar
    const queryBuilder = this.conversationRepository.createQueryBuilder('conversation'); // Alias principal

    // Condición WHERE para status activo
    queryBuilder.where('conversation.status = :status', { status: 'active' });

    // Si se proporciona officeId, añadir los JOINs y la condición WHERE de oficina
    if (officeId) {
      // Hacemos LEFT JOINs para incluir conversaciones incluso si no tienen agente/iniciador
      // Y filtramos si el iniciador O el agente están en la oficina del usuario
      queryBuilder
        .leftJoin('conversation.initiatingUser', 'initiatorUser') // JOIN al usuario que inició
        .leftJoin('conversation.assignedAgent', 'agentUser') // JOIN al agente asignado
        .andWhere('(initiatorUser.office = :userOffice OR agentUser.office = :userOffice)', { userOffice: officeId });
      // NOTA: Si una conversación NO tiene agente asignado (agentId es null), agentUser será null en el JOIN,
      // y la condición 'agentUser.office = :userOffice' será falsa para esa parte del OR,
      // pero la conversación se incluirá si el initiatingUser está en la oficina.
    }

    // Añadir ordenación
    queryBuilder.orderBy('conversation.updatedAt', 'DESC');

    // Opcional: Cargar relaciones si las necesitas en la lista
    // queryBuilder.leftJoinAndSelect('conversation.messages', 'messages');
    // queryBuilder.leftJoinAndSelect('conversation.initiatingUser', 'initiatorUser');
    // queryBuilder.leftJoinAndSelect('conversation.assignedAgent', 'agentUser');


    // Ejecutar la consulta
    const conversations = await queryBuilder.getMany();

    console.log(`ConversationService: Obtenidas ${conversations.length} conversaciones activas` + (officeId ? ` para oficina ${officeId}` : ''));
    return conversations; // Devuelve array de ConversationEntity
  }

  async getClosedConversations(officeId?: string): Promise<Conversation[]> { // <-- Aceptar officeId opcional
    console.log(`ConversationService: Buscando conversaciones cerradas${officeId ? ` para oficina ${officeId}` : ''}`);

    // Usar QueryBuilder para filtrar
    const queryBuilder = this.conversationRepository.createQueryBuilder('conversation'); // Alias principal

    // Condición WHERE para status cerrado
    queryBuilder.where('conversation.status = :status', { status: 'closed' });

    // Si se proporciona officeId, añadir los JOINs y la condición WHERE de oficina
    if (officeId) {
      // Hacemos LEFT JOINs para incluir conversaciones incluso si no tienen agente/iniciador
      // Y filtramos si el iniciador O el agente están en la oficina del usuario
      queryBuilder
        .leftJoin('conversation.initiatingUser', 'initiatorUser') // JOIN al usuario que inició
        .leftJoin('conversation.assignedAgent', 'agentUser') // JOIN al agente asignado
        .andWhere('(initiatorUser.office = :userOffice OR agentUser.office = :userOffice)', { userOffice: officeId });
    }

    // Añadir ordenación
    queryBuilder.orderBy('conversation.updatedAt', 'DESC');

    // Opcional: Cargar relaciones si las necesitas en la lista
    // queryBuilder.leftJoinAndSelect('conversation.messages', 'messages');
    // queryBuilder.leftJoinAndSelect('conversation.initiatingUser', 'initiatorUser');
    // queryBuilder.leftJoinAndSelect('conversation.assignedAgent', 'agentUser');


    // Ejecutar la consulta
    const conversations = await queryBuilder.getMany();

    console.log(`ConversationService: Obtenidas ${conversations.length} conversaciones cerradas` + (officeId ? ` para oficina ${officeId}` : ''));
    return conversations; // Devuelve array de ConversationEntity
  }


  async getAllConversationsByUserId(userId: string): Promise<Conversation[]> {
    return this.conversationRepository.find({
      where: { userId },
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
} 