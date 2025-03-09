// src/chat/chat.gateway.ts
import { WebSocketGateway, SubscribeMessage, MessageBody, WebSocketServer, ConnectedSocket, WsException } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { ConversationService } from './conversation.service';
import { JoinChatDto, JoinAgentDto, AssignAgentDto } from './dto/chat.dto';
import { MessageDto, AgentMessageDto } from './dto/message.dto';

@WebSocketGateway({
  cors: {
    origin: [
      'https://backoffice-casino-front-production.up.railway.app',
      'https://chat-casi-production.up.railway.app',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:8000',
    ],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  debug: true,
  pingInterval: 10000, // Añadir ping para mantener conexiones activas
  pingTimeout: 5000
})
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  private activeChats: Map<string, string> = new Map();
  private agentSockets: Map<string, string> = new Map();
  // Mapa inverso para buscar por socketId
  private socketToUser: Map<string, string> = new Map();
  private socketToAgent: Map<string, string> = new Map();

  constructor(
    private readonly chatService: ChatService,
    private readonly conversationService: ConversationService
  ) {
    console.log('ChatGateway inicializado');
    
    // Usar un intervalo más largo para el log de estado de conexiones
    // y evitar posibles problemas de rendimiento
    setInterval(() => this.logConnectionStatus(), 300000); // Log cada 5 minutos
  }

  // Método para loguear el estado de las conexiones
  private logConnectionStatus() {
    try {
      console.log('=== ESTADO DE CONEXIONES ===');
      console.log(`Clientes activos: ${this.activeChats.size}`);
      console.log(`Agentes activos: ${this.agentSockets.size}`);
      
      // Limitar el número de conexiones que se muestran en el log para evitar sobrecarga
      let userCount = 0;
      this.activeChats.forEach((socketId, userId) => {
        if (userCount < 10) { // Solo mostrar los primeros 10 usuarios
          console.log(`Usuario ${userId} -> Socket ${socketId}`);
          userCount++;
        }
      });
      
      if (this.activeChats.size > 10) {
        console.log(`... y ${this.activeChats.size - 10} usuarios más`);
      }
      
      let agentCount = 0;
      this.agentSockets.forEach((socketId, agentId) => {
        if (agentCount < 10) { // Solo mostrar los primeros 10 agentes
          console.log(`Agente ${agentId} -> Socket ${socketId}`);
          agentCount++;
        }
      });
      
      if (this.agentSockets.size > 10) {
        console.log(`... y ${this.agentSockets.size - 10} agentes más`);
      }
      
      console.log('===========================');
    } catch (error) {
      console.error('Error al loguear estado de conexiones:', error);
    }
  }

  afterInit() {
    console.log('WebSocket Server inicializado');
  }

  handleConnection(client: Socket) {
    console.log(`Cliente conectado: ${client.id}`);
    // Unir al cliente a una sala general para broadcast
    client.join('general');
  }

  handleDisconnect(client: Socket) {
    console.log(`Cliente desconectado: ${client.id}`);

    // Limpiar mapeos cuando un cliente se desconecta
    const userId = this.socketToUser.get(client.id);
    if (userId) {
      console.log(`Eliminando usuario ${userId} de activeChats`);
      this.activeChats.delete(userId);
      this.socketToUser.delete(client.id);
      
      // Notificar a todos sobre la desconexión del usuario
      this.server.to('general').emit('connectionStatus', {
        type: 'user',
        id: userId,
        status: 'disconnected'
      });
    }

    const agentId = this.socketToAgent.get(client.id);
    if (agentId) {
      console.log(`Eliminando agente ${agentId} de agentSockets`);
      this.agentSockets.delete(agentId);
      this.socketToAgent.delete(client.id);
      
      // Notificar a todos sobre la desconexión del agente
      this.server.to('general').emit('connectionStatus', {
        type: 'agent',
        id: agentId,
        status: 'disconnected'
      });
    }
  }

  @SubscribeMessage('joinChat')
  async handleJoinChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinChatDto
  ) {
    console.log(`Usuario ${payload.userId} se unió al chat con socket ${client.id}`);

    // Guardar la relación en ambos mapas
    this.activeChats.set(payload.userId, client.id);
    this.socketToUser.set(client.id, payload.userId);

    // Unir al cliente a una sala específica para este usuario
    client.join(`user_${payload.userId}`);

    // Búsqueda de conversaciones existentes para este usuario
    const conversations = await this.conversationService.getUserConversations(payload.userId);

    // Enviamos las conversaciones al cliente
    client.emit('userConversations', conversations);

    // Notificar a los agentes que este usuario está conectado
    this.server.to('agents').emit('connectionStatus', {
      type: 'user',
      id: payload.userId,
      status: 'connected'
    });

    console.log(`Usuario ${payload.userId} unido exitosamente. Socket: ${client.id}`);
    return { success: true, message: 'Joined chat successfully' };
  }

  @SubscribeMessage('createConversation')
  async handleCreateConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { userId: string }
  ) {
    try {
      console.log(`Solicitud para crear conversación para usuario ${payload.userId}`);

      // Verificar si ya existe una conversación activa
      const existingConversations = await this.conversationService.getUserConversations(payload.userId);
      const activeConversation = existingConversations.find(c => c.status === 'active');

      if (activeConversation) {
        console.log(`Ya existe una conversación activa para ${payload.userId}: ${activeConversation.id}`);

        // Unir al cliente a la sala de esta conversación
        client.join(`conversation_${activeConversation.id}`);

        return {
          success: true,
          message: 'Conversación existente recuperada',
          data: { conversationId: activeConversation.id }
        };
      }

      // Crear una nueva conversación
      const newConversation = await this.conversationService.createConversation(payload.userId);
      console.log(`Nueva conversación creada para ${payload.userId}: ${newConversation.id}`);

      // Unir al cliente a la sala de esta conversación
      client.join(`conversation_${newConversation.id}`);

      // Notificar a los agentes sobre la nueva conversación
      const activeConversations = await this.conversationService.getActiveConversations();
      this.server.to('agents').emit('activeChats', activeConversations);

      return {
        success: true,
        message: 'Conversación creada exitosamente',
        data: { conversationId: newConversation.id }
      };
    } catch (error) {
      console.error(`Error al crear conversación para ${payload.userId}:`, error);
      return {
        success: false,
        message: error.message || 'Error al crear conversación'
      };
    }
  }

  @SubscribeMessage('joinAgent')
  async handleJoinAgent(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinAgentDto
  ) {
    console.log(`Agente ${payload.agentId} se unió con socket ${client.id}`);

    // Guardar la relación en ambos mapas
    this.agentSockets.set(payload.agentId, client.id);
    this.socketToAgent.set(client.id, payload.agentId);

    // Unir al agente a salas específicas
    client.join('agents'); // Sala general de agentes
    client.join(`agent_${payload.agentId}`); // Sala específica para este agente

    // Enviar conversaciones activas al agente
    const activeConversations = await this.conversationService.getActiveConversations();
    client.emit('activeChats', activeConversations);

    // Notificar a otros agentes que este agente está conectado
    this.server.to('agents').emit('connectionStatus', {
      type: 'agent',
      id: payload.agentId,
      status: 'connected'
    });

    console.log(`Agente ${payload.agentId} unido exitosamente. Socket: ${client.id}`);
    return { success: true, message: 'Agent joined successfully' };
  }

  @SubscribeMessage('assignAgent')
  async handleAssignAgent(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: AssignAgentDto
  ) {
    console.log(`Asignando conversación ${data.conversationId} a ${data.agentId}`);

    try {
      // Asignar agente a la conversación
      const conversation = await this.conversationService.getConversationById(data.conversationId);
      if (!conversation) {
        // Responder con error si la conversación no existe
        return {
          success: false,
          error: `Conversación con ID ${data.conversationId} no encontrada`
        };
      }

      // Si ya hay un agente asignado, rechazar la asignación
      if (conversation.agentId) {
        return {
          success: false,
          error: `La conversación ya tiene asignado al agente ${conversation.agentId}`
        };
      }

      // Asignar agente a la conversación
      await this.conversationService.assignAgentToConversation(data.conversationId, data.agentId);

      // Unir al agente a la sala de esta conversación
      const agentSocketId = this.agentSockets.get(data.agentId);
      if (agentSocketId) {
        const agentSocket = this.server.sockets.sockets.get(agentSocketId);
        if (agentSocket) {
          agentSocket.join(`conversation_${data.conversationId}`);
        }

        // Enviar mensajes de la conversación al agente
        const messages = await this.chatService.getMessagesByConversationId(data.conversationId);
        this.server.to(agentSocketId).emit('assignedConversation', {
          conversationId: data.conversationId,
          userId: conversation.userId,
          messages
        });
      }

      // Notificar al cliente que un agente ha sido asignado
      const clientSocketId = this.activeChats.get(conversation.userId);
      if (clientSocketId) {
        this.server.to(clientSocketId).emit('agentAssigned', {
          conversationId: data.conversationId,
          agentId: data.agentId
        });
      }

      // Notificar a todos los agentes que el agente fue asignado
      this.server.to('agents').emit('agentAssigned', {
        userId: conversation.userId,
        agentId: data.agentId,
        conversationId: data.conversationId,
        success: true
      });

      // Actualizar lista de conversaciones activas
      const activeConversations = await this.conversationService.getActiveConversations();
      this.server.to('agents').emit('activeChats', activeConversations);

      // Enviar respuesta de éxito
      return { success: true };
    } catch (error) {
      console.error('Error al asignar agente:', error.message);
      // Enviar respuesta de error
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('message')
  async handleMessage(@ConnectedSocket() client: Socket, @MessageBody() data: AgentMessageDto) {
    console.log(`Mensaje de agente ${data.agentId} para conversación ${data.conversationId}: ${data.message}`);

    try {
      // Verificar que la conversación existe
      const conversation = await this.conversationService.getConversationById(data.conversationId);
      if (!conversation) {
        throw new WsException(`Conversación con ID ${data.conversationId} no encontrada`);
      }

      // Si la conversación no tiene un agente asignado, asignar este agente
      if (!conversation.agentId) {
        await this.conversationService.assignAgentToConversation(data.conversationId, data.agentId);

        // Unir al agente a la sala de esta conversación
        client.join(`conversation_${data.conversationId}`);
      }

      // Actualizar timestamp de la conversación
      await this.conversationService.updateConversationTimestamp(data.conversationId);

      // Guardar el mensaje
      const savedMessage = await this.chatService.saveMessage(
        data.userId,
        data.message,
        'agent',
        data.conversationId,
        data.agentId
      );

      // Crear el objeto de mensaje para broadcast
      const messageToSend = {
        id: savedMessage.id,
        userId: data.userId,
        message: data.message,
        sender: 'agent',
        agentId: data.agentId,
        timestamp: savedMessage.timestamp,
        conversationId: data.conversationId,
      };

      // Enviar mensaje al cliente
      const clientSocketId = this.activeChats.get(data.userId);
      if (clientSocketId) {
        console.log(`Enviando mensaje a cliente ${data.userId} con socket ${clientSocketId}`);

        // Enviar a través de la sala específica del usuario
        this.server.to(`user_${data.userId}`).emit('message', messageToSend);
        this.server.to(`user_${data.userId}`).emit('newMessage', messageToSend);

        // También enviar directamente al socket del usuario
        this.server.to(clientSocketId).emit('message', messageToSend);
        this.server.to(clientSocketId).emit('newMessage', messageToSend);

        // Enviar a través de la sala de la conversación
        this.server.to(`conversation_${data.conversationId}`).emit('message', messageToSend);
        this.server.to(`conversation_${data.conversationId}`).emit('newMessage', messageToSend);
      } else {
        console.log(`No se encontró socket para el cliente ${data.userId}`);
      }

      // Enviar mensaje al dashboard del agente
      const agentSocketId = this.agentSockets.get(data.agentId);
      if (agentSocketId) {
        this.server.to(agentSocketId).emit('newMessage', messageToSend);
      }

      // Notificar a otros agentes que estén viendo la misma conversación
      this.server.to(`conversation_${data.conversationId}`).emit('newMessage', messageToSend);

      // Actualizar lista de conversaciones activas
      const activeConversations = await this.conversationService.getActiveConversations();
      this.server.to('agents').emit('activeChats', activeConversations);

      return {
        success: true,
        data: {
          messageId: savedMessage.id,
          timestamp: savedMessage.timestamp
        }
      };
    } catch (error) {
      console.error('Error al procesar mensaje del agente:', error);
      return {
        success: false,
        message: error.message || 'Error al procesar el mensaje'
      };
    }
  }

  @SubscribeMessage('selectConversation')
  async handleSelectConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; agentId: string }
  ) {
    console.log(`Agente ${data.agentId} seleccionó la conversación ${data.conversationId}`);

    // Unir al agente a la sala de esta conversación
    client.join(`conversation_${data.conversationId}`);

    // Obtener mensajes de la conversación
    const messages = await this.chatService.getMessagesByConversationId(data.conversationId);
    client.emit('conversationMessages', {
      conversationId: data.conversationId,
      messages
    });

    return { success: true };
  }

  @SubscribeMessage('getMessages')
  async handleGetMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string }
  ) {
    console.log(`Solicitando mensajes para conversación ${data.conversationId}`);

    try {
      // Unir al cliente a la sala de esta conversación
      client.join(`conversation_${data.conversationId}`);

      // Obtener mensajes de la conversación
      const messages = await this.chatService.getMessagesByConversationId(data.conversationId);

      // Enviar mensajes al cliente
      client.emit('messageHistory', messages);

      return { success: true };
    } catch (error) {
      console.error('Error al obtener mensajes:', error);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('clientMessage')
  async handleClientMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: MessageDto
  ) {
    console.log(`Mensaje de cliente ${data.userId} para conversación ${data.conversationId}: ${data.message}`);

    try {
      // Verificar que la conversación existe
      const conversation = await this.conversationService.getConversationById(data.conversationId);
      if (!conversation) {
        throw new WsException(`Conversación con ID ${data.conversationId} no encontrada`);
      }

      // Unir al cliente a la sala de esta conversación si no está ya
      client.join(`conversation_${data.conversationId}`);

      // Actualizar timestamp de la conversación
      await this.conversationService.updateConversationTimestamp(data.conversationId);

      // Guardar el mensaje
      const savedMessage = await this.chatService.saveMessage(
        data.userId,
        data.message,
        'client',
        data.conversationId,
        null // No hay agentId para mensajes de cliente
      );

      // Crear el objeto de mensaje para broadcast
      const messageToSend = {
        id: savedMessage.id,
        userId: data.userId,
        message: data.message,
        sender: 'client',
        timestamp: savedMessage.timestamp,
        conversationId: data.conversationId,
      };

      // Si hay un agente asignado, enviar el mensaje al agente
      if (conversation.agentId) {
        const agentSocketId = this.agentSockets.get(conversation.agentId);
        if (agentSocketId) {
          console.log(`Enviando mensaje a agente ${conversation.agentId} con socket ${agentSocketId}`);

          // Enviar a través de la sala específica del agente
          this.server.to(`agent_${conversation.agentId}`).emit('newMessage', messageToSend);

          // También enviar directamente al socket del agente
          this.server.to(agentSocketId).emit('newMessage', messageToSend);
        } else {
          console.log(`No se encontró socket para el agente ${conversation.agentId}`);
        }
      } else {
        // Si no hay agente asignado, notificar a todos los agentes
        console.log('No hay agente asignado, notificando a todos los agentes');
        this.server.to('agents').emit('newMessage', messageToSend);
      }

      // Enviar a través de la sala de la conversación
      this.server.to(`conversation_${data.conversationId}`).emit('message', messageToSend);
      this.server.to(`conversation_${data.conversationId}`).emit('newMessage', messageToSend);

      // Enviar confirmación al cliente
      client.emit('messageConfirmation', {
        success: true,
        data: {
          messageId: savedMessage.id,
          timestamp: savedMessage.timestamp
        }
      });

      // También enviar el mensaje al cliente para mantener la consistencia
      client.emit('message', messageToSend);

      // Actualizar lista de conversaciones activas para todos los agentes
      const activeConversations = await this.conversationService.getActiveConversations();
      this.server.to('agents').emit('activeChats', activeConversations);

      return {
        success: true,
        data: {
          messageId: savedMessage.id,
          timestamp: savedMessage.timestamp
        }
      };
    } catch (error) {
      console.error('Error al procesar mensaje del cliente:', error);
      return {
        success: false,
        message: error.message || 'Error al procesar el mensaje'
      };
    }
  }

  @SubscribeMessage('archiveChat')
  async handleArchiveChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; agentId: string; conversationId: string }
  ) {
    console.log(`Archivando conversación ${data.conversationId} del usuario ${data.userId}`);

    try {
      // Cerrar la conversación
      await this.conversationService.closeConversation(data.conversationId);

      // Obtener la conversación actualizada
      const updatedConversation = await this.conversationService.getConversationById(data.conversationId);
      
      if (!updatedConversation) {
        return { success: false, error: 'No se pudo encontrar la conversación' };
      }

      // Crear el formato de respuesta
      const formattedChat = {
        userId: updatedConversation.userId,
        agentId: updatedConversation.agentId,
        conversationId: updatedConversation.id
      };

      // Notificar a los agentes sobre el cambio
      this.server.to('agents').emit('chatArchived', {
        conversationId: data.conversationId,
        chat: formattedChat
      });

      // Notificar al cliente que su conversación ha sido archivada
      const clientSocketId = this.activeChats.get(data.userId);
      if (clientSocketId) {
        this.server.to(clientSocketId).emit('chatArchived', {
          conversationId: data.conversationId
        });
      }

      return { success: true };
    } catch (error) {
      console.error(`Error al archivar conversación ${data.conversationId}:`, error);
      return { success: false, error: 'Error al archivar la conversación' };
    }
  }

  @SubscribeMessage('unarchiveChat')
  async handleUnarchiveChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; agentId: string; conversationId: string }
  ) {
    console.log(`Desarchivando conversación ${data.conversationId} del usuario ${data.userId}`);

    try {
      // Reabrir la conversación
      await this.conversationService.reopenConversation(data.conversationId);

      // Obtener la conversación actualizada
      const updatedConversation = await this.conversationService.getConversationById(data.conversationId);
      
      if (!updatedConversation) {
        return { success: false, error: 'No se pudo encontrar la conversación' };
      }

      // Crear el formato de respuesta
      const formattedChat = {
        userId: updatedConversation.userId,
        agentId: updatedConversation.agentId,
        conversationId: updatedConversation.id
      };

      // Notificar a los agentes sobre el cambio
      this.server.to('agents').emit('chatUnarchived', {
        conversationId: data.conversationId,
        chat: formattedChat
      });

      // Notificar al cliente que su conversación ha sido desarchivada
      const clientSocketId = this.activeChats.get(data.userId);
      if (clientSocketId) {
        this.server.to(clientSocketId).emit('chatUnarchived', {
          conversationId: data.conversationId
        });
      }

      return { success: true };
    } catch (error) {
      console.error(`Error al desarchivar conversación ${data.conversationId}:`, error);
      return { success: false, error: 'Error al desarchivar la conversación' };
    }
  }

  @SubscribeMessage('getArchivedChats')
  async handleGetArchivedChats(@ConnectedSocket() client: Socket) {
    console.log('Obteniendo conversaciones archivadas');

    try {
      // Obtener conversaciones archivadas (cerradas)
      const archivedConversations = await this.conversationService.getClosedConversations();

      // Mapear conversaciones al formato esperado
      const formattedChats = archivedConversations.map(conversation => ({
        userId: conversation.userId,
        agentId: conversation.agentId,
        conversationId: conversation.id
      }));

      // Solo loguear un resumen para evitar sobrecarga en la consola
      console.log(`Enviando ${formattedChats.length} conversaciones archivadas`);
      
      // Emitir las conversaciones archivadas al cliente que las solicitó
      client.emit('archivedChats', formattedChats);

      return { success: true };
    } catch (error) {
      console.error('Error al obtener chats archivados:', error.message);
      // Enviar un array vacío en caso de error
      client.emit('archivedChats', []);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('getActiveChats')
  async handleGetActiveChats(@ConnectedSocket() client: Socket) {
    console.log('Obteniendo conversaciones activas');

    try {
      // Get active conversations from the conversation service
      const activeConversations = await this.conversationService.getActiveConversations();

      // Map conversations to the expected format with userId, agentId, and conversationId
      const formattedChats = activeConversations.map(conversation => ({
        userId: conversation.userId,
        agentId: conversation.agentId,
        conversationId: conversation.id
      }));

      // Solo loguear un resumen para evitar sobrecarga en la consola
      console.log(`Enviando ${formattedChats.length} conversaciones activas`);
      
      // Emitir solo al cliente que lo solicitó
      client.emit('activeChats', formattedChats);

      return { success: true };
    } catch (error) {
      console.error('Error al obtener chats activos:', error.message);
      // Send an empty array if there's an error
      client.emit('activeChats', []);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('getConversationId')
  async handleGetConversationId(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; isArchived?: boolean }
  ) {
    console.log(`Buscando ID de conversación para usuario ${data.userId}${data.isArchived ? ' (archivada)' : ''}`);

    try {
      let conversations;
      
      if (data.isArchived) {
        // Si estamos buscando conversaciones archivadas
        const allConversations = await this.conversationService.getAllConversationsByUserId(data.userId);
        conversations = allConversations.filter(conv => conv.status === 'closed');
      } else {
        // Buscar conversaciones activas existentes para este usuario
        conversations = await this.conversationService.getActiveConversationsByUserId(data.userId);
      }

      if (conversations && conversations.length > 0) {
        // Si hay conversaciones, usar la más reciente
        const conversationId = conversations[0].id;
        console.log(`Encontrada conversación ${data.isArchived ? 'archivada' : 'activa'} para ${data.userId}: ${conversationId}`);

        // Unir al cliente a la sala de esta conversación
        client.join(`conversation_${conversationId}`);

        return {
          success: true,
          conversationId
        };
      } else {
        // Si no hay conversaciones, devolver un error
        const statusType = data.isArchived ? 'archivada' : 'activa';
        console.log(`No se encontraron conversaciones ${statusType}s para el usuario ${data.userId}`);
        return {
          success: false,
          error: `El usuario no tiene una conversación ${statusType}. ${!data.isArchived ? 'Debe iniciar una nueva conversación desde el chat.' : ''}`
        };
      }
    } catch (error) {
      console.error(`Error al buscar conversación para ${data.userId}:`, error);
      return {
        success: false,
        error: 'Error al buscar la conversación'
      };
    }
  }

  // Método para verificar el estado de conexión de un cliente
  @SubscribeMessage('checkConnection')
  async handleCheckConnection(@ConnectedSocket() client: Socket) {
    return {
      success: true,
      socketId: client.id,
      connected: true,
      rooms: Array.from(client.rooms)
    };
  }

  @SubscribeMessage('getUserConversations')
  async handleGetUserConversations(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string }
  ) {
    console.log(`Obteniendo conversaciones para usuario ${data.userId}`);

    try {
      // Obtener conversaciones del usuario desde el servicio
      const conversations = await this.conversationService.getUserConversations(data.userId);

      console.log(`Encontradas ${conversations.length} conversaciones para usuario ${data.userId}`);

      // Enviar las conversaciones al cliente
      client.emit('userConversations', conversations);

      return { success: true };
    } catch (error) {
      console.error(`Error al obtener conversaciones para usuario ${data.userId}:`, error.message);
      // Enviar un array vacío en caso de error
      client.emit('userConversations', []);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('getConnectedUsers')
  async handleGetConnectedUsers(@ConnectedSocket() client: Socket) {
    console.log('Obteniendo usuarios conectados');

    // Crear un array con todos los IDs de usuarios conectados
    const connectedUsers = Array.from(this.activeChats.keys());
    
    // Enviar la lista completa de usuarios conectados en un solo evento
    client.emit('connectedUsers', connectedUsers);

    return { success: true };
  }
}