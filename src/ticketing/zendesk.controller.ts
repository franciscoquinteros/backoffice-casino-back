import { Controller, Post, Body, Get, Param, Put, Query, Delete, HttpException, HttpStatus, UnauthorizedException, Req, ForbiddenException, Logger } from '@nestjs/common';
import { ZendeskService } from './zendesk.service';
import { ApiOperation, ApiTags, ApiBody, ApiResponse } from '@nestjs/swagger';
import { CreateTicketDto, ChangeTicketStatusDto, AssignTicketDto, TicketResponseDto, CommentResponseDto, UserResponseDto, CreateAgentDto } from './dto/zendesk.dto';
import { ApiKeyAuth } from '../auth/apikeys/decorators/api-key-auth.decorator';
import { API_PERMISSIONS } from '../auth/apikeys/permissions.constants';

interface AuthenticatedUser {
    id: string | number;
    office: string; // Campo de oficina
    role?: string;
}

interface RequestWithUser extends Request {
    user?: AuthenticatedUser;
}

@ApiTags('Zendesk')
@Controller('zendesk')
export class ZendeskController {
    private readonly logger = new Logger(ZendeskController.name);
    
    constructor(private readonly zendeskService: ZendeskService) { }

    @Post('create-ticket')
    @ApiKeyAuth(API_PERMISSIONS.ZENDESK_CREATE_TICKET)
    @ApiOperation({ summary: 'Create a new ticket' })
    @ApiResponse({ type: TicketResponseDto })
    async createTicket(@Body() createTicketDto: CreateTicketDto) {
        return this.zendeskService.createTicket(createTicketDto);
    }

    @Get('agents')
    @ApiOperation({ summary: 'Get all Zendesk agents' })
    @ApiResponse({ type: [UserResponseDto] })
    async getAllAgents() {
        return this.zendeskService.getAllAgents();
    }

    @Post('new-agents')
    //@ApiKeyAuth(API_PERMISSIONS.ZENDESK_CREATE_AGENT) 
    @ApiOperation({ summary: 'Create a new Zendesk agent' })
    @ApiBody({ type: CreateAgentDto })
    @ApiResponse({ type: UserResponseDto })
    async createAgent(@Body() createAgentDto: CreateAgentDto) {
        return this.zendeskService.createAgent(createAgentDto);
    }

    @Post('contributors')
    async createContributor(@Body() createContributorDto: {
        name: string;
        email: string;
        group_id?: number;
    }) {
        try {
            return await this.zendeskService.createContributor(createContributorDto);
        } catch (error) {
            throw new HttpException(
                `Failed to create contributor: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    @Post('team-members')
    async createTeamMember(@Body() createTeamMemberDto: any) {
        try {
            // Verificar los límites de la cuenta
            const limits = await this.zendeskService.checkAccountLimits();

            if (limits.recommendedAction) {
                this.logger.log(`Account limits check: ${limits.recommendedAction}`);
            }

            return await this.zendeskService.createTeamMember({
                name: createTeamMemberDto.name,
                email: createTeamMemberDto.email,
                group_id: createTeamMemberDto.group_id
            });
        } catch (error) {
            throw new HttpException(
                `Failed to create team member: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    @Delete('agents/:userId')
    @ApiOperation({ summary: 'Delete a Zendesk agent by ID' })
    @ApiResponse({ status: 200, description: 'Agent deleted successfully', type: Object })
    async deleteAgent(@Param('userId') userId: string) {
        return this.zendeskService.deleteAgent(userId);
    }

    @Get('users')
    @ApiOperation({ summary: 'Get all Zendesk users' })
    @ApiResponse({ type: [UserResponseDto] })
    async getAllUsers() {
        return this.zendeskService.getAllUsers();
    }

    @Get('tickets/all')
    @ApiOperation({ summary: 'Get all tickets (filtered by user office via internal assignment)' })
    @ApiResponse({ status: 200, description: 'List of tickets for the user\'s office', type: [TicketResponseDto] })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden / User office missing' })
    async getAllTickets(@Req() request: RequestWithUser): Promise<TicketResponseDto[]> {
        const user = request.user;
        const userOfficeId = user?.office;

        if (!userOfficeId) {
            this.logger.error(`User ${user?.id} is missing office information.`);
            throw new ForbiddenException("User office information is missing.");
        }
        
        this.logger.log(`Fetching all tickets for office: ${userOfficeId}`);

        // El servicio filtrará los tickets por oficina
        return this.zendeskService.getAllTickets(userOfficeId);
    }

    @Get('tickets/:ticketId')
    @ApiOperation({ summary: 'Get a ticket by ID (filtered by user office)' })
    @ApiResponse({
        status: 200,
        description: 'The ticket, if it has an internal assignment in the user\'s office',
        type: TicketResponseDto
    })
    @ApiResponse({
        status: 404,
        description: 'Ticket not found or does not have an internal assignment in the user\'s office'
    })
    async getTicket(
        @Param('ticketId') ticketId: string,
        @Req() request: RequestWithUser
    ): Promise<TicketResponseDto> {
        const user = request.user;
        const userOfficeId = user?.office;
        
        if (!userOfficeId) {
            throw new ForbiddenException("User office information is missing.");
        }
        
        this.logger.log(`Fetching ticket ${ticketId} for office: ${userOfficeId}`);
        
        // El servicio verificará si el ticket pertenece a la oficina del usuario
        return this.zendeskService.getTicket(ticketId, userOfficeId);
    }

    @Get('tickets/:ticketId/comments')
    @ApiOperation({ summary: 'Get the comments of a ticket' })
    @ApiResponse({ type: [CommentResponseDto] })
    async getTicketComments(
        @Param('ticketId') ticketId: string,
        @Req() request: RequestWithUser
    ) {
        const user = request.user;
        const userOfficeId = user?.office;
        
        if (!userOfficeId) {
            throw new ForbiddenException("User office information is missing.");
        }
        
        // Primero verificamos si el usuario tiene acceso al ticket
        await this.zendeskService.getTicket(ticketId, userOfficeId);
        
        // Si no se lanzó una excepción, el usuario tiene acceso
        return this.zendeskService.getTicketComments(ticketId);
    }

    @Put('tickets/:ticketId/status')
    @ApiOperation({ summary: 'Change the status of a ticket' })
    @ApiResponse({ type: TicketResponseDto })
    async changeTicketStatus(
        @Param('ticketId') ticketId: string,
        @Body() statusDto: ChangeTicketStatusDto,
        @Req() request: RequestWithUser
    ) {
        const user = request.user;
        const userOfficeId = user?.office;
        
        if (!userOfficeId) {
            throw new ForbiddenException("User office information is missing.");
        }
        
        // Verificar acceso al ticket
        await this.zendeskService.getTicket(ticketId, userOfficeId);
        
        return this.zendeskService.changeTicketStatus(ticketId, statusDto.status);
    }

    @Post('tickets/:ticketId/comments')
    @ApiOperation({ summary: 'Add a comment to a ticket' })
    @ApiResponse({ type: TicketResponseDto })
    async addTicketComment(
        @Param('ticketId') ticketId: string,
        @Body('comment') comment: string,
        @Body('authorId') authorId: string,
        @Body('currentUserId') currentUserId: string,
        @Req() request: RequestWithUser
    ) {
        try {
            const user = request.user;
            const userOfficeId = user?.office;
            
            if (!userOfficeId) {
                throw new ForbiddenException("User office information is missing.");
            }
            
            // Verificar acceso al ticket
            await this.zendeskService.getTicket(ticketId, userOfficeId);
            
            // Intentar asignar el ticket al usuario actual internamente
            if (currentUserId && currentUserId !== 'unknown') {
                try {
                    await this.updateInternalAssignment(ticketId, currentUserId);
                } catch (error) {
                    this.logger.error(`Error al asignar el ticket internamente: ${error.message}`);
                }
            }

            return this.zendeskService.addTicketComment(ticketId, comment, authorId);
        } catch (error) {
            throw new HttpException(
                `Error al añadir comentario: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    private async updateInternalAssignment(ticketId: string, operatorId: string): Promise<void> {
        // Buscar si ya existe una asignación para este ticket
        const ticketAssignment = await this.zendeskService.getTicketAssignmentRepository().findOne({
            where: { zendeskTicketId: ticketId }
        });

        if (ticketAssignment) {
            // Actualizar la asignación existente
            ticketAssignment.userId = Number(operatorId);
            await this.zendeskService.getTicketAssignmentRepository().save(ticketAssignment);
        } else {
            // Crear una nueva asignación
            const newAssignment = this.zendeskService.getTicketAssignmentRepository().create({
                ticketId: parseInt(ticketId),
                zendeskTicketId: ticketId,
                userId: Number(operatorId),
                status: 'open'
            });
            await this.zendeskService.getTicketAssignmentRepository().save(newAssignment);
        }
    }

    @Put('tickets/:ticketId/assign')
    @ApiOperation({ summary: 'Assign a ticket to an agent' })
    @ApiResponse({ type: TicketResponseDto })
    async assignTicket(
        @Param('ticketId') ticketId: string,
        @Body() assignDto: AssignTicketDto,
        @Req() request: RequestWithUser
    ) {
        const user = request.user;
        const userOfficeId = user?.office;
        
        if (!userOfficeId) {
            throw new ForbiddenException("User office information is missing.");
        }
        
        // Verificar acceso al ticket
        await this.zendeskService.getTicket(ticketId, userOfficeId);
        
        return this.zendeskService.asignTicket(ticketId, assignDto.userId);
    }

    @Get('tickets-by-operator/:operatorId')
    @ApiOperation({ summary: 'Get tickets assigned to an operator' })
    @ApiResponse({ type: [TicketResponseDto] })
    async getTicketsByOperator(
        @Param('operatorId') operatorId: string,
        @Req() request: RequestWithUser
    ) {
        const user = request.user;
        const userOfficeId = user?.office;
        
        if (!userOfficeId) {
            throw new ForbiddenException("User office information is missing.");
        }
        
        // Verificar que el operador pertenece a la misma oficina
        const operator = await this.zendeskService.getUserService().findOne(Number(operatorId));
        
        if (!operator || operator.office !== userOfficeId) {
            throw new ForbiddenException("No tienes acceso a los tickets de este operador.");
        }
        
        return this.zendeskService.getTicketsAssignedToOperator(Number(operatorId));
    }

    @Get('operators-with-ticket-counts')
    @ApiOperation({ summary: 'Get operators with their ticket counts' })
    async getOperatorsWithTicketCounts(@Req() request: RequestWithUser) {
        const user = request.user;
        const userOfficeId = user?.office;
        
        if (!userOfficeId) {
            throw new ForbiddenException("User office information is missing.");
        }
        
        // Get operators from the user's office
        const operators = await this.zendeskService.getUserService().findUsersByRoleAndOffice('operador', userOfficeId);

        // Get ticket counts for each operator
        const operatorsWithCounts = await Promise.all(
            operators.map(async (operator) => {
                const ticketCount = await this.zendeskService.getTicketAssignmentRepository().count({
                    where: { userId: operator.id, status: 'open' }
                });
                return {
                    id: operator.id,
                    username: operator.username,
                    email: operator.email,
                    ticketCount
                };
            })
        );

        return operatorsWithCounts;
    }

    @Put('reassign-ticket/:ticketId/to-operator/:operatorId')
    @ApiOperation({ summary: 'Reassign a ticket to a different operator' })
    @ApiResponse({ type: TicketResponseDto })
    async reassignTicket(
        @Param('ticketId') ticketId: string,
        @Param('operatorId') operatorId: string,
        @Req() request: RequestWithUser
    ) {
        try {
            const user = request.user;
            const userOfficeId = user?.office;
            
            if (!userOfficeId) {
                throw new ForbiddenException("User office information is missing.");
            }
            
            // 1. Verificar que el usuario tiene acceso al ticket
            await this.zendeskService.getTicket(ticketId, userOfficeId);
            
            // 2. Verificar que el operador al que se quiere asignar es de la misma oficina
            const operator = await this.zendeskService.getUserService().findOne(Number(operatorId));
            
            if (!operator) {
                throw new HttpException(`Operator with ID ${operatorId} not found`, HttpStatus.NOT_FOUND);
            }
            
            if (operator.office !== userOfficeId) {
                throw new ForbiddenException("Cannot assign ticket to an operator from a different office.");
            }
            
            // 3. Buscar si ya existe una asignación para este ticket
            const ticketAssignment = await this.zendeskService.getTicketAssignmentRepository().findOne({
                where: { zendeskTicketId: ticketId },
                relations: ['user'] // Cargar la relación con el usuario
            });

            // 4. Actualizar o crear la asignación
            if (ticketAssignment) {
                ticketAssignment.userId = Number(operatorId);
                await this.zendeskService.getTicketAssignmentRepository().save(ticketAssignment);
                this.logger.log(`Ticket ${ticketId} reassigned from ${ticketAssignment.user?.username || 'unknown'} to operator ${operator.username}`);
            } else {
                const ticketIdNumber = parseInt(ticketId);
                const newAssignment = this.zendeskService.getTicketAssignmentRepository().create({
                    ticketId: isNaN(ticketIdNumber) ? 0 : ticketIdNumber,
                    zendeskTicketId: ticketId,
                    userId: Number(operatorId),
                    status: 'open'
                });
                await this.zendeskService.getTicketAssignmentRepository().save(newAssignment);
                this.logger.log(`New assignment created for ticket ${ticketId} to operator ${operator.username}`);
            }

            // 5. Obtener el ticket actualizado con toda la información
            const updatedTicket = await this.zendeskService.getTicket(ticketId, userOfficeId);
            
            return updatedTicket;
        } catch (error) {
            this.logger.error(`Error reassigning ticket: ${error.message}`, error.stack);
            throw new HttpException(
                `Error reassigning ticket: ${error.message}`,
                error instanceof ForbiddenException || error instanceof HttpException ? 
                    error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }}