import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { env } from 'process';
import { AxiosResponse } from 'axios';
import { CreateTicketDto, TicketResponseDto, CommentResponseDto, UserResponseDto, CreateAgentDto } from './dto/zendesk.dto';
import { Ticket, TicketWithoutUser, User } from './zendesk.types';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketAssignment } from './entities/ticket-assignment.entity';
import { UserService } from '../users/user.service';
import { TicketAssignmentRepository } from './ticket-assignment.repository';

@Injectable()
export class ZendeskService {
    private readonly logger = new Logger(ZendeskService.name);
    constructor(
        private readonly httpService: HttpService,
        @InjectRepository(TicketAssignment)
        private readonly ticketAssignmentRepo: Repository<TicketAssignment>,
        private readonly userService: UserService,
        private readonly ticketAssignmentRepository: TicketAssignmentRepository
    ) { }
    private ws: WebSocket | null = null; // Propiedad para almacenar el WebSocket

    // Getters para acceder a los servicios y repositorios desde el controlador
    getUserService(): UserService {
        return this.userService;
    }

    getTicketAssignmentRepository(): TicketAssignmentRepository {
        return this.ticketAssignmentRepository;
    }

    onModuleDestroy() {
        if (this.ws) {
            this.ws.close();
            this.logger.log('WebSocket connection closed');
        }
    }

    async getAllAgents(): Promise<UserResponseDto[]> {
        const auth = Buffer.from(`${env.ZENDESK_EMAIL}/token:${env.ZENDESK_TOKEN}`).toString('base64');

        try {
            const response = await firstValueFrom(
                this.httpService.get(`${env.ZENDESK_URL_USERS}`, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                    },
                    params: {
                        query: 'role:agent'
                    }
                })
            );

            return response.data.users.map(user => ({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                default_group_id: user.default_group_id
            }));
        } catch (error) {
            console.log(error.response.data);
            throw new Error(`Error fetching agents: ${error.message}`);
        }
    }

    async getAllUsers(): Promise<UserResponseDto[]> {
        const auth = Buffer.from(`${env.ZENDESK_EMAIL}/token:${env.ZENDESK_TOKEN}`).toString('base64');

        try {
            const response = await firstValueFrom(
                this.httpService.get(env.ZENDESK_URL_USERS, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                    },
                })
            );

            return response.data.users.map(user => ({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                default_group_id: user.default_group_id,
                organization_id: user.organization_id,
                custom_role_id: user.custom_role_id
            }));
        } catch (error) {
            throw new Error(`Error fetching users: ${error.message}`);
        }
    }

    async getAllTickets(): Promise<TicketResponseDto[]> {
        const auth = Buffer.from(`${env.ZENDESK_EMAIL}/token:${env.ZENDESK_TOKEN}`).toString('base64');

        try {
            // Obtener todos los usuarios primero
            const usersResponse = await firstValueFrom(
                this.httpService.get(env.ZENDESK_URL_USERS, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                    },
                })
            );

            const users: User[] = usersResponse.data.users;

            // Obtener todos los tickets
            const ticketsResponse: AxiosResponse<{ tickets: TicketWithoutUser[] }> = await firstValueFrom(
                this.httpService.get(env.ZENDESK_URL_TICKETS, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                    },
                })
            );

            // Obtener TODAS las asignaciones de tickets
            const allTicketAssignments = await this.ticketAssignmentRepository.find({
                relations: ['user'] // Cargar la relación con el usuario
            });

            // Crear un mapa para búsqueda rápida por ID de ticket
            const assignmentMap = new Map();
            allTicketAssignments.forEach(assignment => {
                assignmentMap.set(assignment.zendeskTicketId, assignment);
            });

            // Mapear tickets y añadir información de usuarios y asignaciones internas
            return Promise.all(ticketsResponse.data.tickets.map(async (ticket) => {
                // Buscar usuario solicitante
                const user = users.find(user => user.id === ticket.requester_id);

                // Buscar asignación interna
                const ticketAssignment = assignmentMap.get(ticket.id.toString());

                // Preparar la información del operador asignado interno
                let internalAssignee = undefined;
                if (ticketAssignment && ticketAssignment.user) {
                    internalAssignee = {
                        id: ticketAssignment.user.id,
                        name: ticketAssignment.user.username,
                        email: ticketAssignment.user.email
                    };
                }

                return {
                    id: ticket.id,
                    subject: ticket.subject,
                    description: ticket.description,
                    status: ticket.status,
                    requester_id: ticket.requester_id,
                    assignee_id: ticket.assignee_id,
                    created_at: ticket.created_at,
                    updated_at: ticket.updated_at,
                    user: user ? {
                        name: user.name,
                        email: user.email,
                    } : undefined,
                    group_id: ticket.group_id,
                    custom_fields: ticket.custom_fields,
                    internal_assignee: internalAssignee
                };
            }));
        } catch (error) {
            this.logger.error(`Error fetching all tickets: ${error.message}`, error.stack);
            throw new Error(`Error fetching tickets: ${error.message}`);
        }
    }

    async createAgent(createAgentDto: CreateAgentDto): Promise<UserResponseDto> {
        const auth = Buffer.from(`${env.ZENDESK_EMAIL}/token:${env.ZENDESK_TOKEN}`).toString('base64');

        // Datos del usuario con más configuraciones específicas para agentes
        const agentData = {
            user: {
                name: createAgentDto.name,
                email: createAgentDto.email,
                role: createAgentDto.role || 'contributor', // Cambiado de 'agent' a 'contributor'
                verified: true, // Marcar como verificado para evitar el email de verificación
                active: true,   // Asegurarse de que la cuenta está activa
                default_group_id: createAgentDto.default_group_id,
                // Opcional: incluir configuraciones adicionales según sea necesario
                user_fields: {
                    agent_oboard_complete: true // Campo personalizado que puede ser necesario
                }
            }
        };

        try {
            // 1. Crear el usuario
            const response: AxiosResponse<{ user: User }> = await firstValueFrom(
                this.httpService.post(env.ZENDESK_URL_USERS, agentData, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                    },
                })
            );

            const user = response.data.user;

            // 2. Si es necesario, agregar explícitamente al usuario como agente
            // Este paso podría ser necesario en algunas configuraciones de Zendesk
            if (user.role === 'agent' && createAgentDto.default_group_id) {
                try {
                    // Crear membresía de grupo explícitamente
                    await firstValueFrom(
                        this.httpService.post(
                            `${env.ZENDESK_URL}/api/v2/group_memberships`,
                            {
                                group_membership: {
                                    user_id: user.id,
                                    group_id: createAgentDto.default_group_id
                                }
                            },
                            {
                                headers: {
                                    'Authorization': `Basic ${auth}`,
                                    'Content-Type': 'application/json',
                                },
                            }
                        )
                    );
                    this.logger.log(`Added user ${user.id} to group ${createAgentDto.default_group_id}`);
                } catch (groupError) {
                    this.logger.error('Error adding user to group:', groupError.response?.data || groupError.message);
                    // No lanzamos error aquí, ya que el usuario ya fue creado
                }
            }

            return {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                default_group_id: user.default_group_id,
            };
        } catch (error) {
            // Registrar detalles completos del error
            console.error('Error creating agent:', {
                message: error.message,
                status: error.response?.status,
                data: JSON.stringify(error.response?.data, null, 2),
                details: JSON.stringify(error.response?.data?.details, null, 2)
            });

            // Si hay detalles específicos, mostrarlos
            if (error.response?.data?.details?.base) {
                throw new Error(`Error creating agent: ${error.response.data.error} - ${error.response.data.details.base[0].message || 'Unknown details'}`);
            } else {
                throw new Error(`Error creating agent: ${error.response?.data?.error || error.message}`);
            }
        }
    }

    async createTeamMember(createTeamMemberDto: {
        name: string;
        email: string;
        group_id?: number;
    }): Promise<UserResponseDto> {
        const auth = Buffer.from(`${env.ZENDESK_EMAIL}/token:${env.ZENDESK_TOKEN}`).toString('base64');

        // Datos específicos para un Team Member con rol contributor
        const teamMemberData = {
            user: {
                name: createTeamMemberDto.name,
                email: createTeamMemberDto.email,
                role: 'contributor', // Rol específico que parece funcionar en tu cuenta
                verified: true,
                active: true
            }
        };

        // Si se proporciona un ID de grupo, añadirlo a los datos
        if (createTeamMemberDto.group_id) {
            teamMemberData.user['default_group_id'] = createTeamMemberDto.group_id;
        }

        try {
            this.logger.log(`Creating team member with email: ${createTeamMemberDto.email}`);

            // Intentar crear el usuario
            const response: AxiosResponse<{ user: User }> = await firstValueFrom(
                this.httpService.post(env.ZENDESK_URL_USERS, teamMemberData, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                    },
                })
            );

            const user = response.data.user;
            this.logger.log(`Team member created successfully with ID: ${user.id}`);

            // Si se proporcionó un grupo pero no se asignó durante la creación, asignarlo explícitamente
            if (createTeamMemberDto.group_id && !user.default_group_id) {
                try {
                    await this.assignUserToGroup(user.id, createTeamMemberDto.group_id);
                } catch (groupError) {
                    this.logger.warn(`Created user but couldn't assign to group: ${groupError.message}`);
                }
            }

            return {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                default_group_id: user.default_group_id
            };
        } catch (error) {
            // Registrar detalles completos del error
            this.logger.error('Error creating team member:', {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data,
                details: error.response?.data?.details
            });

            throw new Error(`Error creating team member: ${error.response?.data?.details?.base?.[0]?.message ||
                error.response?.data?.error ||
                error.message
                }`);
        }
    }

    async checkAccountLimits(): Promise<any> {
        const auth = Buffer.from(`${env.ZENDESK_EMAIL}/token:${env.ZENDESK_TOKEN}`).toString('base64');

        try {
            // Verificar la información de la cuenta y los usuarios actuales
            const [usersResponse, accountResponse] = await Promise.all([
                firstValueFrom(
                    this.httpService.get(`${env.ZENDESK_URL}/api/v2/users`, {
                        headers: {
                            'Authorization': `Basic ${auth}`,
                            'Content-Type': 'application/json',
                        },
                        params: {
                            role: ['agent', 'admin', 'contributor']
                        }
                    })
                ),
                firstValueFrom(
                    this.httpService.get(`${env.ZENDESK_URL}/api/v2/account/settings`, {
                        headers: {
                            'Authorization': `Basic ${auth}`,
                            'Content-Type': 'application/json',
                        },
                    })
                )
            ]);

            // Contar usuarios por rol
            const users = usersResponse.data.users;
            const userCounts = {
                total: users.length,
                byRole: users.reduce((acc, user) => {
                    acc[user.role] = (acc[user.role] || 0) + 1;
                    return acc;
                }, {})
            };

            // Obtener información sobre roles disponibles
            const rolesResponse = await firstValueFrom(
                this.httpService.get(`${env.ZENDESK_URL}/api/v2/custom_roles`, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                    },
                })
            );

            return {
                accountSettings: accountResponse.data.settings,
                userCounts,
                customRoles: rolesResponse.data.custom_roles,
                recommendedAction: userCounts.byRole.agent >= accountResponse.data.settings.agent_limit
                    ? "You've reached your agent limit. Try creating contributors instead."
                    : "You have agent capacity available."
            };
        } catch (error) {
            this.logger.error('Error checking account limits:', error.response?.data || error.message);
            throw new Error(`Error checking account limits: ${error.response?.data?.error || error.message}`);
        }
    }

    async createContributor(createContributorDto: {
        name: string;
        email: string;
        group_id?: number;
    }): Promise<UserResponseDto> {
        const auth = Buffer.from(`${env.ZENDESK_EMAIL}/token:${env.ZENDESK_TOKEN}`).toString('base64');

        // 1. Primero, obtenemos los roles personalizados para encontrar el ID del rol "Contributor"
        let contributorRoleId: number | null = null;

        try {
            const rolesResponse = await firstValueFrom(
                this.httpService.get(`${env.ZENDESK_URL}/api/v2/custom_roles`, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                    },
                })
            );

            // Verificar y guardar la respuesta completa para debugging
            this.logger.log('Custom roles API response:', JSON.stringify(rolesResponse.data, null, 2));

            // Verificar que tenemos una estructura de datos válida
            if (rolesResponse.data && rolesResponse.data.custom_roles && Array.isArray(rolesResponse.data.custom_roles)) {
                const customRoles = rolesResponse.data.custom_roles;

                // Buscar el rol que contenga "contributor" en su nombre (insensible a mayúsculas/minúsculas)
                const contributorRole = customRoles.find(role =>
                    role && role.name && role.name.toLowerCase().includes('contributor')
                );

                if (contributorRole) {
                    contributorRoleId = contributorRole.id;
                    this.logger.log(`Found contributor role: ${contributorRole.name} (ID: ${contributorRoleId})`);
                } else {
                    this.logger.warn('No contributor role found in custom roles. Will create as regular agent.');
                }
            } else {
                this.logger.warn('Custom roles API response does not contain expected data structure');
            }
        } catch (error) {
            this.logger.warn('Failed to fetch custom roles, continuing as regular agent:', error.message);
        }

        // 2. Crear el usuario como agente (con o sin rol personalizado)
        const userData = {
            user: {
                name: createContributorDto.name,
                email: createContributorDto.email,
                role: 'agent', // Rol base válido para la API
                verified: true, // Marcar como verificado para evitar el email de verificación
                active: true    // Asegurarse de que la cuenta está activa
            }
        };

        // Solo añadir custom_role_id si lo encontramos
        if (contributorRoleId) {
            userData.user['custom_role_id'] = contributorRoleId;
        }

        // Si se proporciona un grupo, añadirlo a los datos del usuario
        if (createContributorDto.group_id) {
            userData.user['default_group_id'] = createContributorDto.group_id;
        }

        try {
            this.logger.log(`Creating contributor with email: ${createContributorDto.email}`);
            this.logger.log('Request payload:', JSON.stringify(userData, null, 2));

            // Crear el usuario
            const response = await firstValueFrom(
                this.httpService.post(env.ZENDESK_URL_USERS, userData, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                    },
                })
            );

            const user = response.data.user;
            this.logger.log(`User created successfully with ID: ${user.id}`);

            // Si se proporcionó un grupo pero no se asignó durante la creación, asignarlo explícitamente
            if (createContributorDto.group_id && !user.default_group_id) {
                try {
                    await this.assignUserToGroup(user.id, createContributorDto.group_id);
                } catch (groupError) {
                    this.logger.warn(`Created user but couldn't assign to group: ${groupError.message}`);
                }
            }

            return {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                custom_role_id: user.custom_role_id,
                default_group_id: user.default_group_id
            };
        } catch (error) {
            // Registrar detalles completos del error
            this.logger.error('Error creating contributor:', {
                message: error.message,
                status: error.response?.status,
                data: JSON.stringify(error.response?.data, null, 2),
            });

            throw new Error(`Error creating contributor: ${error.response?.data?.error?.message ||
                error.response?.data?.error ||
                error.message
                }`);
        }
    }

    // Método auxiliar para asignar un usuario a un grupo
    async assignUserToGroup(userId: number, groupId: number): Promise<void> {
        const auth = Buffer.from(`${env.ZENDESK_EMAIL}/token:${env.ZENDESK_TOKEN}`).toString('base64');

        const groupMembershipData = {
            group_membership: {
                user_id: userId,
                group_id: groupId
            }
        };

        try {
            await firstValueFrom(
                this.httpService.post(
                    `${env.ZENDESK_URL}/api/v2/group_memberships`,
                    groupMembershipData,
                    {
                        headers: {
                            'Authorization': `Basic ${auth}`,
                            'Content-Type': 'application/json',
                        },
                    }
                )
            );

            this.logger.log(`User ${userId} assigned to group ${groupId}`);
        } catch (error) {
            this.logger.error(`Failed to assign user ${userId} to group ${groupId}:`, error.message);
            throw error;
        }
    }

    async assignCustomRole(userId: number, customRoleId: number): Promise<UserResponseDto> {
        const auth = Buffer.from(`${env.ZENDESK_EMAIL}/token:${env.ZENDESK_TOKEN}`).toString('base64');

        try {
            const response: AxiosResponse<{ user: User }> = await firstValueFrom(
                this.httpService.put(`${env.ZENDESK_URL_USERS}/${userId}`,
                    {
                        user: {
                            custom_role_id: customRoleId
                        }
                    },
                    {
                        headers: {
                            'Authorization': `Basic ${auth}`,
                            'Content-Type': 'application/json',
                        },
                    }
                )
            );

            const user = response.data.user;
            return {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                default_group_id: user.default_group_id,
                custom_role_id: user.custom_role_id
            };
        } catch (error) {
            console.error('Error assigning custom role:', error.response?.data || error.message);
            throw new Error(`Error assigning custom role: ${error.response?.data?.error || error.message}`);
        }
    }

    async deleteAgent(userId: string): Promise<{ message: string }> {
        const auth = Buffer.from(`${env.ZENDESK_EMAIL}/token:${env.ZENDESK_TOKEN}`).toString('base64');

        try {
            await firstValueFrom(
                this.httpService.delete(`${env.ZENDESK_URL_USERS}/${userId}`, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                    },
                })
            );

            return { message: `Agent with ID ${userId} deleted successfully` };
        } catch (error) {
            console.error('Error deleting agent:', error.response?.data || error.message);
            throw new Error(`Error deleting agent: ${error.response?.data?.error || error.message}`);
        }
    }

    async createUserIfNotExists(email: string): Promise<number | null> {
        const auth = Buffer.from(`${env.ZENDESK_EMAIL}/token:${env.ZENDESK_TOKEN}`).toString('base64');
        console.log(email, 'email on createUserIfNotExists');
        try {
            const searchResponse = await firstValueFrom(
                this.httpService.get(`${env.ZENDESK_URL_USERS}/search`, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                    },
                    params: {
                        query: `email:${email}`
                    }
                })
            );

            if (searchResponse.data.users.length > 0) {
                console.log(searchResponse.data.users[0].id, 'id on createUserIfNotExists');
                return searchResponse.data.users[0].id;
            } else {
                const createUserResponse = await firstValueFrom(
                    this.httpService.post(env.ZENDESK_URL_USERS, { user: { email, name: email } }, {
                        headers: {
                            'Authorization': `Basic ${auth}`,
                            'Content-Type': 'application/json',
                        },
                    })
                );
                console.log(createUserResponse.data.user.id, 'id on createUserIfNotExists');
                return createUserResponse.data.user.id;
            }
        } catch (error) {
            console.error('Error creating/finding user:', error.response?.data || error.message);
            return null;
        }
    }

    async createTicket(createTicketDto: CreateTicketDto) {
        const auth = Buffer.from(`${env.ZENDESK_EMAIL}/token:${env.ZENDESK_TOKEN}`).toString('base64');
        const MONEY_GROUP_ID = '34157406608155';
        const MONEY_CUSTOM_FIELD_ID = 34161101814811;

        const zendeskUserId = await this.createUserIfNotExists(createTicketDto.email);
        console.log(zendeskUserId, 'userId on createTicket');
        if (zendeskUserId === null) {
            throw new Error('Failed to create or find user.');
        }

        // Check if this is a money-related ticket by checking the custom field value
        const moneyCustomField = createTicketDto.custom_fields?.find(
            field => field.id === MONEY_CUSTOM_FIELD_ID
        );
        const isMoneyTicket = moneyCustomField?.value === "Dinero";

        const ticketData = {
            ticket: {
                subject: createTicketDto.subject,
                description: createTicketDto.description,
                requester_id: zendeskUserId,
                custom_fields: createTicketDto.custom_fields,
                ...(isMoneyTicket && { group_id: parseInt(MONEY_GROUP_ID) })
            },
        };

        try {
            const response: AxiosResponse<{ ticket: Ticket }> = await firstValueFrom(
                this.httpService.post(env.ZENDESK_URL_TICKETS, ticketData, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                    },
                })
            );

            const ticket = response.data.ticket;

            // Always assign tickets to an "operador" user, regardless of ticket type
            try {
                // Get all operator users from our database
                const operatorUsers = await this.userService.findUsersByRole('operador');
                console.log('Operadores encontrados:', operatorUsers.length, operatorUsers.map(op => op.username));

                if (operatorUsers.length > 0) {
                    // Get ticket assignments count for each operator
                    const operatorTicketCounts = await Promise.all(
                        operatorUsers.map(async (operator) => {
                            const ticketCount = await this.ticketAssignmentRepository.count({
                                where: { userId: operator.id, status: 'open' }
                            });
                            console.log(`Operador ${operator.username} tiene ${ticketCount} tickets`);
                            return {
                                user: operator,
                                ticketCount
                            };
                        })
                    );

                    // Find the operator with the least tickets
                    const operatorWithLeastTickets = operatorTicketCounts.reduce((prev, current) =>
                        prev.ticketCount <= current.ticketCount ? prev : current
                    );

                    console.log('Asignando ticket a operador:', operatorWithLeastTickets.user.username);

                    // Still assign in Zendesk, but we'll use our internal assignment too
                    await this.asignTicket(
                        ticket.id.toString(),
                        ticket.assignee_id ? ticket.assignee_id.toString() : null
                    );

                    // Create internal ticket assignment
                    const ticketAssignment = this.ticketAssignmentRepository.create({
                        ticketId: parseInt(ticket.id.toString()),
                        zendeskTicketId: ticket.id.toString(),
                        userId: operatorWithLeastTickets.user.id,
                        status: 'open'
                    });
                    await this.ticketAssignmentRepository.save(ticketAssignment);
                    console.log('Ticket assignment creado:', ticketAssignment);

                    // Update the Zendesk ticket response with our internal assignment info
                    const updatedTicket = {
                        ...ticket,
                        internal_assignee: {
                            id: operatorWithLeastTickets.user.id,
                            name: operatorWithLeastTickets.user.username,
                            email: operatorWithLeastTickets.user.email
                        }
                    };

                    return {
                        id: updatedTicket.id,
                        subject: updatedTicket.subject,
                        description: updatedTicket.description,
                        status: updatedTicket.status,
                        requester_id: updatedTicket.requester_id,
                        assignee_id: updatedTicket.assignee_id,
                        user: updatedTicket.user,
                        group_id: updatedTicket.group_id,
                        custom_fields: updatedTicket.custom_fields,
                        internal_assignee: updatedTicket.internal_assignee
                    };
                } else {
                    console.log('No se encontraron operadores para asignar el ticket');
                }
            } catch (error) {
                console.error('Error al asignar ticket a operador:', error);
                // Return the original ticket if there's an error in assignment
            }

            return {
                id: ticket.id,
                subject: ticket.subject,
                description: ticket.description,
                status: ticket.status,
                requester_id: ticket.requester_id,
                assignee_id: ticket.assignee_id,
                user: ticket.user,
                group_id: ticket.group_id,
                custom_fields: ticket.custom_fields
            };
        } catch (error) {
            console.error('Zendesk API Error:', error.response?.data || error.message);
            throw new Error(`Error creating ticket: ${error.response?.data?.error || error.message}`);
        }
    }

    async getTicket(ticketId: string): Promise<TicketResponseDto> {
        const auth = Buffer.from(`${env.ZENDESK_EMAIL}/token:${env.ZENDESK_TOKEN}`).toString('base64');

        try {
            const response: AxiosResponse<{ ticket: Ticket }> = await firstValueFrom(
                this.httpService.get(`${env.ZENDESK_URL_TICKETS}/${ticketId}`, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                    },
                })
            );

            const ticket = response.data.ticket;

            // Find ticket assignment for this ticket
            const ticketAssignment = await this.ticketAssignmentRepository.findOne({
                where: { zendeskTicketId: ticketId }
            });

            // Get operator information if there's an assignment
            let internalAssignee = undefined;
            if (ticketAssignment) {
                const operator = await this.userService.findOne(ticketAssignment.userId);
                if (operator) {
                    internalAssignee = {
                        id: operator.id,
                        name: operator.username,
                        email: operator.email
                    };
                }
            }

            return {
                id: ticket.id,
                subject: ticket.subject,
                description: ticket.description,
                status: ticket.status,
                requester_id: ticket.requester_id,
                assignee_id: ticket.assignee_id,
                user: ticket.user,
                group_id: ticket.group_id,
                custom_fields: ticket.custom_fields,
                internal_assignee: internalAssignee
            };
        } catch (error) {
            throw new Error(`Error fetching ticket: ${error.response?.data || error.message}`);
        }
    }

    async getTicketComments(ticketId: string): Promise<CommentResponseDto[]> {
        const auth = Buffer.from(`${env.ZENDESK_EMAIL}/token:${env.ZENDESK_TOKEN}`).toString('base64');

        try {
            const response: AxiosResponse = await firstValueFrom(
                this.httpService.get(`${env.ZENDESK_URL_TICKETS}/${ticketId}/comments`, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                    },
                })
            );

            return response.data;
        } catch (error) {
            throw new Error(`Error fetching comments: ${error.response?.data || error.message}`);
        }
    }

    async addTicketComment(ticketId: string, comment: string, authorId: string): Promise<TicketResponseDto> {
        const auth = Buffer.from(`${env.ZENDESK_EMAIL}/token:${env.ZENDESK_TOKEN}`).toString('base64');

        // Asegurarse de que authorId sea un número válido
        const authorIdNum = parseInt(authorId);
        if (isNaN(authorIdNum)) {
            throw new Error(`Invalid author ID: ${authorId}`);
        }

        this.logger.log(`Adding comment to ticket ${ticketId} by agent ${authorId}: ${comment.substring(0, 50)}...`);

        const commentData = {
            ticket: {
                comment: {
                    body: comment,
                    public: true,
                    author_id: authorIdNum, // Asegurar que es un número
                },
            },
        };

        try {
            // Registrar los datos que se están enviando a la API
            this.logger.log(`Sending comment data to Zendesk: ${JSON.stringify(commentData)}`);

            const response: AxiosResponse<{ ticket: Ticket }> = await firstValueFrom(
                this.httpService.put(
                    `${env.ZENDESK_URL_TICKETS}/${ticketId}`,
                    commentData,
                    {
                        headers: {
                            'Authorization': `Basic ${auth}`,
                            'Content-Type': 'application/json',
                        },
                    }
                )
            );

            const ticket = response.data.ticket;
            this.logger.log(`Comment successfully added to ticket ${ticketId} by agent ${authorId}`);

            // Esperar brevemente para asegurar que el comentario se haya procesado
            await new Promise(resolve => setTimeout(resolve, 1000));

            return {
                id: ticket.id,
                subject: ticket.subject,
                description: ticket.description,
                status: ticket.status,
                requester_id: ticket.requester_id,
                assignee_id: ticket.assignee_id,
                user: ticket.user,
                group_id: ticket.group_id,
            };
        } catch (error) {
            this.logger.error('Error adding comment to ticket:', error.response?.data || error.message);

            // Registrar detalles completos del error para diagnóstico
            if (error.response) {
                this.logger.error('Error response data:', error.response.data);
                this.logger.error('Error response status:', error.response.status);
                this.logger.error('Error response headers:', error.response.headers);
            } else if (error.request) {
                this.logger.error('Error request:', error.request);
            }

            throw new Error(`Error adding comment to ticket: ${error.response?.data?.error || error.message}`);
        }
    }

    async changeTicketStatus(ticketId: string, status: string): Promise<TicketResponseDto> {
        const zendeskResponse = await this.changeZendeskTicketStatus(ticketId, status);
        await this.updateTicketStatus(ticketId, status);
        return zendeskResponse;
    }

    async changeZendeskTicketStatus(ticketId: string, status: string): Promise<TicketResponseDto> {
        const auth = Buffer.from(`${env.ZENDESK_EMAIL}/token:${env.ZENDESK_TOKEN}`).toString('base64');

        try {
            const response: AxiosResponse<{ ticket: Ticket }> = await firstValueFrom(
                this.httpService.put(`${env.ZENDESK_URL_TICKETS}/${ticketId}`, { ticket: { status } }, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                    },
                })
            );

            const ticket = response.data.ticket;
            return {
                id: ticket.id,
                subject: ticket.subject,
                description: ticket.description,
                status: ticket.status,
                requester_id: ticket.requester_id,
                assignee_id: ticket.assignee_id,
                user: ticket.user,
                group_id: ticket.group_id
            };
        } catch (error) {
            throw new Error(`Error changing ticket status: ${error.response?.data || error.message}`);
        }
    }

    async updateTicketStatus(ticketId: string, status: string): Promise<void> {
        const ticketAssignment = await this.ticketAssignmentRepository.findOne({
            where: { zendeskTicketId: ticketId }
        });

        if (ticketAssignment) {
            ticketAssignment.status = status;
            await this.ticketAssignmentRepository.save(ticketAssignment);
        }
    }

    async asignTicket(ticketId: string, userId: string): Promise<TicketResponseDto> {
        const auth = Buffer.from(`${env.ZENDESK_EMAIL}/token:${env.ZENDESK_TOKEN}`).toString('base64');

        try {
            const response: AxiosResponse<{ ticket: Ticket }> = await firstValueFrom(
                this.httpService.put(`${env.ZENDESK_URL_TICKETS}/${ticketId}`, { ticket: { assignee_id: userId } }, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                    },
                })
            );

            const ticket = response.data.ticket;
            return {
                id: ticket.id,
                subject: ticket.subject,
                description: ticket.description,
                status: ticket.status,
                requester_id: ticket.requester_id,
                assignee_id: ticket.assignee_id,
                user: ticket.user,
                group_id: ticket.group_id
            };
        } catch (error) {
            throw new Error(`Error assigning ticket: ${error.response?.data || error.message}`);
        }
    }

    async updateInternalAssignment(ticketId: string, operatorId: string): Promise<void> {
        // Buscar si ya existe una asignación para este ticket
        const ticketAssignment = await this.ticketAssignmentRepository.findOne({
            where: { zendeskTicketId: ticketId }
        });

        if (ticketAssignment) {
            // Actualizar la asignación existente
            ticketAssignment.userId = Number(operatorId);
            await this.ticketAssignmentRepository.save(ticketAssignment);
        } else {
            // Crear una nueva asignación
            const newAssignment = this.ticketAssignmentRepository.create({
                ticketId: parseInt(ticketId),
                zendeskTicketId: ticketId,
                userId: Number(operatorId),
                status: 'open'
            });
            await this.ticketAssignmentRepository.save(newAssignment);
        }

        this.logger.log(`Ticket ${ticketId} assigned internally to operator ${operatorId}`);
    }



    async getTicketsAssignedToOperator(operatorId: number): Promise<TicketResponseDto[]> {
        const ticketAssignments = await this.ticketAssignmentRepository.find({
            where: { userId: operatorId },
            relations: ['user']
        });

        const ticketIds = ticketAssignments.map(assignment => assignment.zendeskTicketId);
        const tickets = await Promise.all(
            ticketIds.map(id => this.getTicket(id))
        );

        return tickets;
    }
}