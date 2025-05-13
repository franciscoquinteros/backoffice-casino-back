import { Controller, Post, Body, Get, Param, Put, Query, Delete, HttpException, HttpStatus, UnauthorizedException, Req, ForbiddenException, Logger, UseGuards } from '@nestjs/common';
import { ZendeskService } from './zendesk.service';
import { ApiOperation, ApiTags, ApiBody, ApiResponse } from '@nestjs/swagger';
import { CreateTicketDto, ChangeTicketStatusDto, AssignTicketDto, TicketResponseDto, CommentResponseDto, UserResponseDto, CreateAgentDto } from './dto/zendesk.dto';
import { ApiKeyAuth } from '../auth/apikeys/decorators/api-key-auth.decorator';
import { API_PERMISSIONS } from '../auth/apikeys/permissions.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedUser {
    id: string | number;
    office: string; // Campo de oficina
    officeId?: string;
    role?: string;
}

interface RequestWithUser extends Request {
    user?: AuthenticatedUser;
}

@ApiTags('Zendesk')
@UseGuards(JwtAuthGuard)
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
        const userOfficeId = user?.office || user?.officeId;

        if (!userOfficeId) {
            this.logger.error(`User ${user?.id} is missing office information.`);
            throw new ForbiddenException("User office information is missing.");
        }

        this.logger.log(`Fetching all tickets for office: ${userOfficeId}`);

        // El servicio filtrará los tickets por oficina
        return this.zendeskService.getAllTickets(userOfficeId);
    }

    @Get('tickets/:ticketId')
    @ApiOperation({ summary: 'Get a ticket by ID (from Zendesk, no internal validation)' })
    @ApiResponse({ status: 200, description: 'The ticket, if it exists in Zendesk', type: TicketResponseDto })
    @ApiResponse({ status: 404, description: 'Ticket not found in Zendesk' })
    async getTicket(
        @Param('ticketId') ticketId: string,
        @Req() request: RequestWithUser
    ): Promise<TicketResponseDto> {
        return this.zendeskService.getTicket(ticketId);
    }

    @Get('tickets/:ticketId/comments')
    @ApiOperation({ summary: 'Get the comments of a ticket' })
    @ApiResponse({ type: [CommentResponseDto] })
    async getTicketComments(
        @Param('ticketId') ticketId: string,
        @Req() request: RequestWithUser
    ) {
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
        return this.zendeskService.addTicketComment(ticketId, comment, authorId);
    }

    @Put('tickets/:ticketId/assign')
    @ApiOperation({ summary: 'Assign a ticket to an agent' })
    @ApiResponse({ type: TicketResponseDto })
    async assignTicket(
        @Param('ticketId') ticketId: string,
        @Body() assignDto: AssignTicketDto,
        @Req() request: RequestWithUser
    ) {
        return this.zendeskService.asignTicket(ticketId, assignDto.userId);
    }

    @Get('tickets-by-operator/:operatorId')
    @ApiOperation({ summary: 'Get tickets assigned to an operator' })
    @ApiResponse({ type: [TicketResponseDto] })
    async getTicketsByOperator(
        @Param('operatorId') operatorId: string,
        @Req() request: RequestWithUser
    ) {
        return this.zendeskService.getTicketsAssignedToOperator(Number(operatorId));
    }

    @Get('operators-with-ticket-counts')
    @ApiOperation({ summary: 'Get operators with their ticket counts' })
    async getOperatorsWithTicketCounts(@Req() request: RequestWithUser) {
        try {
            // Log completo del objeto request.user
            console.log('Request completo en getOperatorsWithTicketCounts:', {
                headers: request.headers,
                user: request.user,
                method: request.method,
                url: request.url
            });

            const user = request.user;
            console.log('User object en controller:', JSON.stringify(user));

            const userRole = user?.role;
            const userOfficeId = user?.office || user?.officeId;

            console.log('Office ID extraído:', userOfficeId);
            if (!userOfficeId) {
                this.logger.warn(`[getOperatorsWithTicketCounts] User ${user?.id} is missing office information`);
                throw new ForbiddenException("User office information is missing.");
            }

            // Get operators from the user's office
            this.logger.debug(`[getOperatorsWithTicketCounts] Fetching operators for office: ${userOfficeId}`);
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
                        officeId: operator.office,
                        ticketCount
                    };
                })
            );

            return operatorsWithCounts;
        }
        catch (error) {
            console.error('Error en getOperatorsWithTicketCounts:', error);
            throw error;
        }
    }

    @Put('reassign-ticket/:ticketId/to-operator/:operatorId')
    @ApiOperation({ summary: 'Reassign a ticket to a different operator' })
    @ApiResponse({ type: TicketResponseDto })
    async reassignTicket(
        @Param('ticketId') ticketId: string,
        @Param('operatorId') operatorId: string,
        @Req() request: RequestWithUser
    ) {
        // Solo reasigna en Zendesk y en la base interna, sin validación de oficina
        await this.zendeskService.updateInternalAssignment(ticketId, operatorId);
        return this.zendeskService.asignTicket(ticketId, operatorId);
    }
}