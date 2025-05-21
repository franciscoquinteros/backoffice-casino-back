import {
    Controller,
    Get,
    UseGuards,
    Req,
    ForbiddenException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { ConversationService } from './conversation.service';
import { ChatService } from './chat.service';

// Definir interfaces para autenticación
interface AuthenticatedUser {
    id: string | number;
    office: string;
    role?: string;
    username?: string;
    email?: string;
}

interface RequestWithUser extends Request {
    user?: AuthenticatedUser;
}

@ApiTags('Chats')
@Controller('chats')
@ApiBearerAuth()
export class ChatController {
    constructor(
        private readonly conversationService: ConversationService,
        private readonly chatService: ChatService
    ) { }

    @Get('all')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get all conversations from all offices (superadmin only)' })
    @ApiResponse({ status: 200, description: 'List of all conversations in the system' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
    @ApiResponse({ status: 403, description: 'Forbidden - User is not a superadmin' })
    async getAllConversations(
        @Req() request: RequestWithUser
    ): Promise<{ active: any[], closed: any[] }> {
        // Verificar si el usuario es superadmin
        const user = request.user;
        console.log('GET /chats/all - Usuario autenticado:', user);

        if (!user) {
            console.error('GET /chats/all - No hay usuario autenticado');
            throw new ForbiddenException('Usuario no autenticado');
        }

        if (user.role !== 'superadmin') {
            console.error(`GET /chats/all - Usuario ${user.id} con rol ${user.role} intentó acceder a todos los chats`);
            throw new ForbiddenException('Sólo los superadmins pueden acceder a todos los chats');
        }

        console.log(`[ChatController] getAllConversations: Obteniendo todas las conversaciones para superadmin ${user.id}`);

        // Obtener todas las conversaciones (sin filtrar por officeId ni agentId)
        const activeConversations = await this.conversationService.getActiveConversations();
        const closedConversations = await this.conversationService.getClosedConversations();

        console.log(`Se encontraron ${activeConversations.length} conversaciones activas y ${closedConversations.length} conversaciones cerradas en total`);

        return {
            active: activeConversations,
            closed: closedConversations
        };
    }
} 