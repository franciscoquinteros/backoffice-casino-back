import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, IsNull, Not, Repository } from 'typeorm';
import { ChatService } from '../chat/chat.service';
import { ZendeskService } from '../ticketing/zendesk.service';
import { UserService } from '../users/user.service';
import { Chat } from '../chat/entities/chat.entity';
import { User } from '../users/entities/user.entity';
import { ConversationService } from '../chat/conversation.service';
import { Conversation } from '../chat/entities/conversation.entity';
import { OfficeService } from 'src/office/office.service';
import { Office } from 'src/office/entities/office.entity';
import { TicketAssignment } from 'src/ticketing/entities/ticket-assignment.entity';
import { IpnService } from '../transactions/transactions.service';

// Interfaces simplificadas para tipado
interface TicketResponse {
    id: number;
    subject: string;
    description: string;
    status: string;
    requester_id: number;
    assignee_id?: number;
    group_id: number;
    created_at?: string;
    custom_fields?: any[];
    assignee?: {
        name: string;
        email: string;
    };
}

export interface DashboardSummary {
    totalTickets: { value: number; trend: string; };
    activeChats: { value: number; trend: string; };
    totalUsers: { value: number; trend: string; };
    avgResponseTime: { value: string; trend: string; trendPositive: boolean; };
}
@Injectable()
export class ReportService {
    private readonly logger = new Logger(ReportService.name);
    constructor(
        private readonly zendeskService: ZendeskService,
        private readonly chatService: ChatService,
        private readonly userService: UserService,
        private readonly conversationService: ConversationService,
        @InjectRepository(Chat)
        private readonly chatRepository: Repository<Chat>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Conversation)
        private readonly conversationRepository: Repository<Conversation>,
        private readonly officeService: OfficeService,
        @InjectRepository(Office)
        private readonly officeRepository: Repository<Office>,
        @InjectRepository(TicketAssignment)
        private readonly ticketAssignmentRepository: Repository<TicketAssignment>,
        @Inject(forwardRef(() => IpnService))
        private readonly ipnService: IpnService
    ) { }


    // Método para generar un informe completo por oficina
    async generateOfficeReport(officeId: number) {
        try {
            // Obtener información básica de la oficina
            const office = await this.officeRepository.findOne({ where: { id: officeId.toString() } });
            if (!office) throw new Error(`Oficina con ID ${officeId} no encontrada`);

            // Obtener todas las métricas para esta oficina
            const [
                dashboardSummary,
                ticketsByStatus,
                ticketsByAgent,
                ticketsTrend,
                messageVolume,
                messageDistribution,
                responseTimeByAgent,
                loginActivity,
                userRoles,
                newUsersByMonth,
                conversationStatusDistribution
            ] = await Promise.all([
                this.getDashboardSummaryForOffice(officeId),
                this.getTicketsByStatusForOffice(officeId),
                this.getTicketsByAgentForOffice(officeId),
                this.getTicketsTrendForOffice(officeId),
                this.getMessageVolumeForOffice(officeId),
                this.getMessageDistributionForOffice(officeId),
                this.getResponseTimeByAgentForOffice(officeId),
                this.getLoginActivityForOffice(officeId),
                this.getUserRolesForOffice(officeId),
                this.getNewUsersByMonthForOffice(officeId),
                this.getConversationStatusDistributionForOffice(officeId)
            ]);

            // Obtener usuarios de esta oficina
            const users = await this.userRepository.find({
                where: { office: office.id.toString() }, // Asumiendo que office es un STRING en User
                select: ['id', 'username', 'email', 'role', 'status', 'createdAt', 'lastLoginDate']
            });

            // Generar información resumida de usuarios
            const usersInfo = users.map(user => ({
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                status: user.status,
                createdAt: user.createdAt,
                lastLoginDate: user.lastLoginDate
            }));

            // Generar informe completo
            return {
                officeInfo: {
                    id: office.id,
                    name: office.name,
                    agentAssigned: office.agentAssigned,
                    status: office.status,
                    createdAt: office.createdAt,
                    whatsapp: office.whatsapp,
                    telegram: office.telegram,
                    firstDepositBonus: office.firstDepositBonus,
                    perpetualBonus: office.perpetualBonus,
                    minDeposit: office.minDeposit,
                    minWithdrawal: office.minWithdrawal,
                    minWithdrawalWait: office.minWithdrawalWait
                },
                summaryMetrics: dashboardSummary,
                ticketMetrics: {
                    byStatus: ticketsByStatus,
                    byAgent: ticketsByAgent,
                    trend: ticketsTrend
                },
                chatMetrics: {
                    messageVolume,
                    messageDistribution,
                    conversationStatusDistribution,
                    responseTimeByAgent
                },
                userMetrics: {
                    roles: userRoles,
                    loginActivity,
                    newUsersByMonth
                },
                users: usersInfo
            };
        } catch (error) {
            console.error(`Error al generar informe completo para oficina ${officeId}:`, error);
            throw new Error(`No se pudo generar el informe para la oficina: ${error.message}`);
        }
    }

    private async getOfficeIdByName(officeName: string): Promise<number | null> {
        const office = await this.officeRepository.findOne({ where: { name: officeName } });
        return office ? parseInt(office.id) : null;
    }

    private async getUsersByOfficeId(officeId: number, selectFields?: (keyof User)[]): Promise<User[]> {
        this.logger.debug(`[Service] getUsersByOfficeId: Finding users where office = '${officeId.toString()}'`);
        const whereCondition: FindOptionsWhere<User> = { office: officeId.toString() };
        const findOptions: { where: FindOptionsWhere<User>, select?: (keyof User)[] } = { where: whereCondition };
        if (selectFields) { findOptions.select = selectFields; }
        const users = await this.userRepository.find(findOptions);
        this.logger.debug(`[Service] getUsersByOfficeId: Found ${users.length} users for office ID ${officeId}`);
        return users;
    }

    // Método auxiliar para obtener el nombre de la oficina a partir del ID
    private async getOfficeNameById(officeId: number): Promise<string | null> {
        console.log(`[ReportService] getOfficeNameById: Looking for ID ${officeId}`); // <-- Log
        const office = await this.officeRepository.findOne({ where: { id: officeId.toString() } });
        console.log(`[ReportService] getOfficeNameById: Found office: ${office?.name}`); // <-- Log
        return office ? office.name : null;
    }

    // Método para obtener usuarios de una oficina específica
    private async getUsersByOffice(officeId: number): Promise<User[]> {
        console.log(`[ReportService] getUsersByOffice: Finding users directly by office ID = ${officeId}`);

        // OPCIÓN A: Si la columna 'office' en tu UserEntity es de tipo NUMBER
        const users = await this.userRepository.find({
            where: { office: officeId.toString() } // Busca donde la columna 'office' sea igual al número officeId
            // select: [...] // Puedes añadir select si solo necesitas campos específicos
        });

        // OPCIÓN B: Si la columna 'office' en tu UserEntity es de tipo STRING
        /*
        const users = await this.userRepository.find({
            where: { office: officeId.toString() } // Busca donde la columna 'office' sea igual al STRING del officeId
            // select: [...]
        });
        */

        console.log(`[ReportService] getUsersByOffice: Found ${users.length} users for office ID ${officeId}`);
        return users;
    }

    private async filterTicketsByOffice(tickets: TicketResponse[], officeId: number): Promise<TicketResponse[]> {
        this.logger.debug(`[Service] filterTicketsByOffice: Filtering ${tickets.length} tickets for office ID ${officeId}`);
        if (!officeId) return tickets; // No filtrar si no se especifica oficina

        const users = await this.getUsersByOfficeId(officeId, ['id']); // Correcto: usa helper por ID
        const userIds = users.map(user => user.id); // Obtiene los IDs (tipo number aquí)
        if (userIds.length === 0) {
            this.logger.debug(`[Service] filterTicketsByOffice: No users found for office ${officeId}, returning 0 tickets.`);
            return [];
        }
        this.logger.debug(`[Service] filterTicketsByOffice: Found ${userIds.length} users for office ${officeId}. IDs: ${userIds.join(',')}`);

        // Busca asignaciones internas para esos usuarios
        const ticketAssignments = await this.ticketAssignmentRepository.find({ where: { userId: In(userIds) } });
        const ticketZendeskIds = new Set(ticketAssignments.map(assignment => assignment.zendeskTicketId)); // Usa Set para eficiencia
        this.logger.debug(`[Service] filterTicketsByOffice: Found ${ticketAssignments.length} assignments linking to ${ticketZendeskIds.size} unique Zendesk tickets.`);

        // Filtra la lista de tickets de Zendesk
        const filtered = tickets.filter(ticket => ticketZendeskIds.has(ticket.id.toString()));
        this.logger.debug(`[Service] filterTicketsByOffice: Returning ${filtered.length} filtered tickets for office ${officeId}`);
        return filtered;
    }

    // Método para obtener la distribución de mensajes por tipo de remitente para una oficina
    async getMessageDistributionForOffice(officeId: number) {
        try {
            // Obtener todos los mensajes
            const messages = await this.getAllMessages();

            // Filtrar mensajes para esta oficina
            const officeMessages = await this.filterChatsByOffice(messages, officeId);

            const messageTypes: Record<string, number> = {
                'Cliente': 0,
                'Agente': 0
            };

            // Contar mensajes por tipo de remitente
            officeMessages.forEach(message => {
                if (message.sender === 'client') {
                    messageTypes['Cliente'] += 1;
                } else if (message.sender === 'agent') {
                    messageTypes['Agente'] += 1;
                }
            });

            return Object.entries(messageTypes).map(([name, value]) => ({ name, value }));
        } catch (error) {
            console.error(`Error al obtener distribución de mensajes para oficina ${officeId}:`, error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }

    // Método para obtener tiempo de respuesta por agente para una oficina
    async getResponseTimeByAgentForOffice(officeId: number) {
        try {
            // Obtener el nombre de la oficina
            const office = await this.officeRepository.findOne({ where: { id: officeId.toString() } });
            if (!office) throw new Error(`Oficina con ID ${officeId} no encontrada`);

            // Obtener usuarios de esta oficina
            const users = await this.getUsersByOfficeId(officeId);
            const userIds = users.map(user => user.id.toString());

            // Obtenemos todos los mensajes
            const allMessages = await this.getAllMessages();

            // Filtramos mensajes donde el agente pertenece a esta oficina
            const officeMessages = allMessages.filter(message =>
                message.agentId && userIds.includes(message.agentId)
            );

            // Agrupar mensajes por conversación
            const chatsByConversation: Record<string, Chat[]> = {};
            officeMessages.forEach(message => {
                if (message.conversationId) {
                    if (!chatsByConversation[message.conversationId]) {
                        chatsByConversation[message.conversationId] = [];
                    }
                    chatsByConversation[message.conversationId].push(message);
                }
            });

            // Analizar tiempos de respuesta
            const agentResponseTimes: Record<string, number> = {};
            const agentResponseCounts: Record<string, number> = {};

            Object.values(chatsByConversation).forEach(chatMessages => {
                // Ordenar mensajes por timestamp
                const sortedMessages = chatMessages.sort((a, b) =>
                    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );

                let lastClientMessage: Chat | null = null;

                // Analizar secuencia de mensajes
                sortedMessages.forEach(message => {
                    if (message.sender === 'client') {
                        lastClientMessage = message;
                    } else if (message.sender === 'agent' && lastClientMessage && message.agentId) {
                        // Solo considerar agentes de esta oficina
                        if (userIds.includes(message.agentId)) {
                            const responseTime = (
                                new Date(message.timestamp).getTime() -
                                new Date(lastClientMessage.timestamp).getTime()
                            ) / 60000; // Convertir a minutos

                            // Solo considerar tiempos de respuesta realistas (< 30 minutos)
                            if (responseTime > 0 && responseTime < 30) {
                                agentResponseTimes[message.agentId] = (agentResponseTimes[message.agentId] || 0) + responseTime;
                                agentResponseCounts[message.agentId] = (agentResponseCounts[message.agentId] || 0) + 1;
                            }
                        }
                        lastClientMessage = null; // Reiniciar para el siguiente par
                    }
                });
            });

            // Calcular promedios y formatear para la visualización
            const result = await Promise.all(
                Object.keys(agentResponseTimes).map(async (agentId) => {
                    const count = agentResponseCounts[agentId] || 1;
                    const avgTime = agentResponseTimes[agentId] / count;

                    // Intentar obtener el nombre real del agente
                    let name = `Agente ${agentId}`;
                    try {
                        const user = await this.userService.findOne(parseInt(agentId));
                        if (user) {
                            name = user.username || name;
                        }
                    } catch (error) {
                        // Ignorar errores, usar el agentId como nombre
                    }

                    return {
                        name,
                        tiempo: parseFloat(avgTime.toFixed(1))
                    };
                })
            );

            return result.sort((a, b) => a.tiempo - b.tiempo);
        } catch (error) {
            console.error(`Error al obtener tiempos de respuesta por agente para oficina ${officeId}:`, error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }

    // Método para obtener actividad de login por día para una oficina
    async getLoginActivityForOffice(officeId: number) {
        try {
            // Obtener el nombre de la oficina
            const office = await this.officeRepository.findOne({ where: { id: officeId.toString() } });
            if (!office) throw new Error(`Oficina con ID ${officeId} no encontrada`);

            // Obtener usuarios de esta oficina con lastLoginDate
            const users = await this.getUsersByOfficeId(officeId, ['id', 'lastLoginDate']); // <-- CORREGIDO

            // Crear objetos de actividad de login
            const loginActivities = users
                .filter(user => user.lastLoginDate)
                .map(user => ({
                    userId: user.id,
                    timestamp: user.lastLoginDate
                }));

            // Nombre de los días en español
            const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
            const dailyLogins: Record<string, number> = {};

            // Inicializar todos los días con valor 0
            dayNames.forEach(day => {
                dailyLogins[day] = 0;
            });

            // Contar logins por día de la semana
            loginActivities.forEach(login => {
                if (login.timestamp) {
                    const date = new Date(login.timestamp);
                    const day = dayNames[date.getDay()];
                    dailyLogins[day] += 1;
                }
            });

            // Reordenar para que comience por Lun y termine en Dom
            const orderedDays = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
            return orderedDays.map(dia => ({
                dia,
                logins: dailyLogins[dia]
            }));
        } catch (error) {
            console.error(`Error al obtener actividad de login para oficina ${officeId}:`, error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }

    // Método para obtener roles de usuario para una oficina
    async getUserRolesForOffice(officeId: number) {
        try {
            console.log(`[ReportService] getUserRolesForOffice: Called for office ID ${officeId}`);
            // Ya no necesitas buscar el nombre de la oficina aquí

            // Busca usuarios directamente por ID de oficina
            // Convertimos officeId a string ya que User.office es tipo STRING
            const users = await this.getUsersByOfficeId(officeId);
            console.log(`[ReportService] getUserRolesForOffice: Found ${users.length} users`);


            const roles: Record<string, number> = {};
            users.forEach(user => {
                const role = user.role || 'Usuario';
                roles[role] = (roles[role] || 0) + 1;
            });

            return Object.entries(roles).map(([name, value]) => ({ name, value }));
        } catch (error) {
            console.error(`Error al obtener roles de usuario para oficina ${officeId}:`, error);
            return [];
        }
    }

    // Método para obtener nuevos usuarios por mes para una oficina
    async getNewUsersByMonthForOffice(officeId: number) {

        try {
            // Obtener el nombre de la oficina
            const office = await this.officeRepository.findOne({ where: { id: officeId.toString() } });
            if (!office) throw new Error(`Oficina con ID ${officeId} no encontrada`);

            // Obtener usuarios de esta oficina
            const users = await this.getUsersByOfficeId(officeId, ['id', 'createdAt']); // <-- CORREGIDO

            const monthlyUsers: Record<string, number> = {};

            // Array de nombres de meses en español
            const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

            // Inicializar todos los meses con valor 0
            monthNames.forEach(month => {
                monthlyUsers[month] = 0;
            });

            // Contar usuarios por mes de creación
            users.forEach(user => {
                if (user.createdAt) {
                    const date = new Date(user.createdAt);
                    const monthName = monthNames[date.getMonth()];
                    monthlyUsers[monthName] += 1;
                }
            });

            // Filtrar solo los últimos 6 meses con datos
            const sixMonthsData = monthNames
                .map(mes => ({ mes, cantidad: monthlyUsers[mes] }))
                .filter(item => item.cantidad > 0)
                .slice(-6);

            return sixMonthsData;
        } catch (error) {
            console.error(`Error al obtener nuevos usuarios por mes para oficina ${officeId}:`, error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }

    private async getActiveChatsForOffice(officeId: number): Promise<Chat[]> { // Usa tu tipo Chat real
        this.logger.debug(`[Service] getActiveChatsForOffice - Office ID: ${officeId}`);
        try {
            const users = await this.getUsersByOfficeId(officeId, ['id']);
            const userIds = users.map(u => u.id.toString());
            if (userIds.length === 0) return [];

            // Asume que chatService.getActiveChats() devuelve TODOS los chats activos
            // Ajusta si chatService puede filtrar por usuario/agente directamente
            const allActiveChats = await this.chatService.getActiveChats();
            const filtered = allActiveChats.filter(chat =>
                (chat.userId && userIds.includes(chat.userId)) ||
                (chat.agentId && userIds.includes(chat.agentId))
            );
            this.logger.debug(`[Service] getActiveChatsForOffice: Found ${filtered.length} active chats for office ${officeId}`);
            return filtered;
        } catch (error) {
            this.logger.error(`Error getting active chats for office ${officeId}: ${error.message}`);
            return []; // Devuelve vacío en caso de error
        }
    }

    // Método para obtener el resumen del dashboard por oficina
    async getDashboardSummaryForOffice(officeId: number): Promise<DashboardSummary> { // Define tipo retorno
        this.logger.debug(`[Service] getDashboardSummaryForOffice - Office ID: ${officeId}`);
        const defaultSummary: DashboardSummary = {
            totalTickets: { value: 0, trend: 'N/A' },
            activeChats: { value: 0, trend: 'N/A' },
            totalUsers: { value: 0, trend: 'N/A' },
            avgResponseTime: { value: 'N/A', trend: 'N/A', trendPositive: false }
        };
        try {
            // --- Ya no necesitas buscar la oficina aquí si getUsersByOfficeId funciona ---
            // const office = await this.officeRepository.findOne({ where: { id: officeId } });
            // if (!office) throw new NotFoundException(`Oficina con ID ${officeId} no encontrada`);
            // console.log(`[REPORTE] Generando dashboard para oficina: ${office.name} (ID: ${officeId})`);

            // --- OBTENER USUARIOS - CORREGIDO ---
            // Llama al helper que busca por la columna 'office' usando el ID
            const users = await this.getUsersByOfficeId(officeId);
            // --- FIN CORRECCIÓN ---

            // --- Obtener Tickets (con manejo de error interno) ---
            let officeTickets: TicketResponse[] = [];
            let totalOfficeTickets = 0;
            let ticketTrend = 'N/A';
            try {
                const ticketsByStatus = await this.getTicketsByStatusForOffice(officeId);
                // Check if we got an object with data property or a direct array
                if (Array.isArray(ticketsByStatus)) {
                    totalOfficeTickets = ticketsByStatus.reduce((sum, s) => sum + s.value, 0);
                } else if (ticketsByStatus.data) {
                    totalOfficeTickets = ticketsByStatus.data.reduce((sum, s) => sum + s.value, 0);
                }
                ticketTrend = totalOfficeTickets > 0 ? '+0%' : 'N/A'; // Placeholder
            } catch (e) {
                this.logger.error(`Failed to get ticket counts for summary (Office ${officeId}): ${e.message}`);
                // Ya se maneja en el método llamado, pero aseguramos valores por defecto
                totalOfficeTickets = 0;
                ticketTrend = 'N/A';
            }

            // --- Obtener Chats (con manejo de error interno) ---
            let activeOfficeChats = 0;
            let chatTrend = 'N/A';
            try {
                const activeChatsResult = await this.getActiveChatsForOffice(officeId);
                activeOfficeChats = activeChatsResult.length;
                chatTrend = '+0%'; // Placeholder
            } catch (e) { this.logger.error(`Failed to get active chats for summary (Office ${officeId}): ${e.message}`); activeOfficeChats = 0; chatTrend = 'N/A'; }

            // --- Obtener Tiempo Respuesta (con manejo de error interno) ---
            let avgOfficeResponseTime = 0;
            let responseTrend = 'N/A';
            let responseTrendPositive = false;
            try {
                const agentResponseTimes = await this.getResponseTimeByAgentForOffice(officeId); // Asegúrate que este método también esté corregido internamente
                avgOfficeResponseTime = agentResponseTimes.reduce((sum, agent) => sum + agent.tiempo, 0) / (agentResponseTimes.length || 1);
                responseTrend = !isNaN(avgOfficeResponseTime) && avgOfficeResponseTime > 0 ? '0%' : 'N/A'; // Placeholder
                responseTrendPositive = false; // Placeholder
            } catch (e) { this.logger.error(`Failed to get response time for summary (Office ${officeId}): ${e.message}`); avgOfficeResponseTime = 0; responseTrend = 'N/A'; responseTrendPositive = false; }

            // --- Calcula total usuarios (ya los tenemos) ---
            const totalOfficeUsers = users.length;
            const userTrend = totalOfficeUsers > 0 ? '+0%' : 'N/A'; // Placeholder

            // Construye la respuesta final
            return {
                totalTickets: { value: totalOfficeTickets, trend: ticketTrend },
                activeChats: { value: activeOfficeChats, trend: chatTrend },
                totalUsers: { value: totalOfficeUsers, trend: userTrend }, // <-- Usa la cuenta correcta de 'users'
                avgResponseTime: {
                    value: isNaN(avgOfficeResponseTime) ? 'N/A' : `${avgOfficeResponseTime.toFixed(1)} min`,
                    trend: responseTrend,
                    trendPositive: responseTrendPositive
                }
            };

        } catch (error) { // Captura errores graves (ej: oficina no encontrada si la buscaras aquí)
            this.logger.error(`FATAL Error generating dashboard summary for office ${officeId}: ${error.message}`);
            return defaultSummary;
        }
    }

    // Método para obtener la distribución de conversaciones por estado para una oficina
    async getConversationStatusDistributionForOffice(officeId: number) {
        try {
            // Obtener el nombre de la oficina
            const office = await this.officeRepository.findOne({ where: { id: officeId.toString() } });
            if (!office) throw new Error(`Oficina con ID ${officeId} no encontrada`);

            // Obtener usuarios de esta oficina
            const users = await this.getUsersByOfficeId(officeId, ['id']);
            const userIds = users.map(user => user.id.toString());

            // Consulta para obtener todas las conversaciones
            const allConversations = await this.conversationRepository.find();

            // Filtrar conversaciones de esta oficina
            const officeConversations = allConversations.filter(
                conv => userIds.includes(conv.userId) || (conv.agentId && userIds.includes(conv.agentId))
            );

            // Contar por estado
            let activeCount = 0;
            let pendingCount = 0;
            let archivedCount = 0;

            officeConversations.forEach(conv => {
                if (conv.status === 'closed') {
                    archivedCount++;
                } else if (conv.status === 'active' && !conv.agentId) {
                    pendingCount++;
                } else if (conv.status === 'active') {
                    activeCount++;
                }
            });

            return [
                { name: 'Activos', value: activeCount },
                { name: 'Pendientes', value: pendingCount },
                { name: 'Archivados', value: archivedCount }
            ];
        } catch (error) {
            console.error(`Error al obtener distribución de chats por estado para oficina ${officeId}:`, error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }


    private async filterChatsByOffice(chats: Chat[], officeId: number): Promise<Chat[]> {
        this.logger.debug(`[Service] filterChatsByOffice: Filtering ${chats.length} chats for office ID ${officeId}`);
        if (!officeId) return chats;
        const users = await this.getUsersByOfficeId(officeId, ['id']);
        const userIds = users.map(user => user.id.toString()); // IDs como string
        if (userIds.length === 0) return [];
        const filtered = chats.filter(chat =>
            userIds.includes(chat.userId) || (chat.agentId && userIds.includes(chat.agentId))
        );
        this.logger.debug(`[Service] filterChatsByOffice: Returning ${filtered.length} filtered chats for office ${officeId}`);
        return filtered;
    }

    private async filterConversationsByOffice(conversations: Conversation[], officeId: number): Promise<Conversation[]> {
        this.logger.debug(`[Service] filterConversationsByOffice: Filtering ${conversations.length} convos for office ID ${officeId}`);
        if (!officeId) return conversations;
        const users = await this.getUsersByOfficeId(officeId, ['id']);
        const userIds = users.map(user => user.id.toString());
        if (userIds.length === 0) return [];
        const filtered = conversations.filter(conversation =>
            userIds.includes(conversation.userId) || (conversation.agentId && userIds.includes(conversation.agentId))
        );
        this.logger.debug(`[Service] filterConversationsByOffice: Returning ${filtered.length} filtered convos for office ${officeId}`);
        return filtered;
    }

    // Implementación de getTicketsByStatus para oficina específica
    async getTicketsByStatusForOffice(officeId: number) {
        try {
            const allTickets = await this.zendeskService.getAllTickets() as TicketResponse[];

            const office = await this.officeRepository.findOne({ where: { id: officeId.toString() } });
            if (!office) throw new Error(`Oficina con ID ${officeId} no encontrada`);

            // Filtrar tickets para la oficina específica
            const officeTickets = await this.filterTicketsByOffice(allTickets, officeId);

            // Agrupar por estado y contar (igual que antes)
            const result: Record<string, number> = {};

            officeTickets.forEach(ticket => {
                const status = ticket.status || 'Sin estado';
                result[status] = (result[status] || 0) + 1;
            });

            return {
                officeInfo: {
                    id: officeId,
                    name: office
                },
                data: Object.entries(result).map(([name, value]) => ({
                    name,
                    value
                }))
            };
        } catch (error) {
            console.error(`Error al obtener tickets por estado para oficina ${officeId}:`, error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }

    // Implementación de getTicketsByAgent para oficina específica
    async getTicketsByAgentForOffice(officeId: number) {
        try {
            const allTickets = await this.zendeskService.getAllTickets() as TicketResponse[];

            // Filtrar tickets para la oficina específica
            const officeTickets = await this.filterTicketsByOffice(allTickets, officeId);

            const agentTickets: Record<string, number> = {};

            // Obtener el nombre de la oficina
            const officeName = await this.getOfficeNameById(officeId);
            if (!officeName) throw new Error(`Oficina con ID ${officeId} no encontrada`);

            // Obtener usuarios (agentes) de esta oficina
            const agents = await this.userRepository.find({
                where: {
                    office: officeName,
                    role: 'agent' // Asumiendo que los agentes tienen este rol
                }
            });

            // Mapear IDs a nombres
            const agentMap: Record<number, string> = {};
            agents.forEach(agent => {
                agentMap[agent.id] = agent.username;
            });

            // Buscar asignaciones de tickets
            const ticketAssignments = await this.ticketAssignmentRepository.find();
            const ticketToAgentMap: Record<string, number> = {};

            ticketAssignments.forEach(assignment => {
                ticketToAgentMap[assignment.zendeskTicketId] = assignment.userId;
            });

            // Contar tickets por agente
            officeTickets.forEach(ticket => {
                const agentId = ticketToAgentMap[ticket.id.toString()];
                if (agentId && agentMap[agentId]) {
                    const agentName = agentMap[agentId];
                    agentTickets[agentName] = (agentTickets[agentName] || 0) + 1;
                }
            });

            return Object.entries(agentTickets)
                .map(([name, tickets]) => ({ name, tickets }))
                .sort((a, b) => b.tickets - a.tickets); // Ordenar de mayor a menor
        } catch (error) {
            console.error(`Error al obtener tickets por agente para oficina ${officeId}:`, error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }

    // Implementación de getTicketsTrend para oficina específica
    async getTicketsTrendForOffice(officeId: number) {
        try {
            const allTickets = await this.zendeskService.getAllTickets() as TicketResponse[];

            // Filtrar tickets para la oficina específica
            const officeTickets = await this.filterTicketsByOffice(allTickets, officeId);

            const monthlyTickets: Record<string, number> = {};

            // Array de nombres de meses en español
            const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

            // Inicializar el objeto con todos los meses para asegurar que aparezcan en el gráfico
            monthNames.forEach(month => {
                monthlyTickets[month] = 0;
            });

            // Agrupar tickets por mes de creación
            officeTickets.forEach(ticket => {
                if (ticket.created_at) {
                    const date = new Date(ticket.created_at);
                    const month = date.getMonth(); // 0-11
                    const monthName = monthNames[month];

                    monthlyTickets[monthName] += 1;
                }
            });

            // Convertir a array para el gráfico y ordenar por mes cronológicamente
            return monthNames
                .map(mes => ({ mes, cantidad: monthlyTickets[mes] }))
                .filter(item => item.cantidad > 0); // Filtrar meses sin tickets
        } catch (error) {
            console.error(`Error al obtener tendencia de tickets para oficina ${officeId}:`, error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }

    // Implementación para volumen de mensajes por oficina
    async getMessageVolumeForOffice(officeId: number) {
        try {
            // Obtener todos los mensajes de chat
            const messages = await this.getAllMessages();

            // Filtrar mensajes para la oficina específica
            const officeMessages = await this.filterChatsByOffice(messages, officeId);

            const hourlyMessages: Record<string, number> = {};

            // Inicializar todas las horas del día con valor 0
            for (let i = 9; i <= 17; i++) { // Asumiendo horario laboral de 9AM a 5PM
                const hour = i > 12 ? `${i - 12}PM` : `${i}AM`;
                hourlyMessages[hour] = 0;
            }

            // Agrupar mensajes por hora
            officeMessages.forEach(message => {
                if (message.timestamp) {
                    const date = new Date(message.timestamp);
                    const hour = date.getHours();

                    if (hour >= 9 && hour <= 17) { // Solo contar mensajes en horario laboral
                        const hourStr = hour > 12 ? `${hour - 12}PM` : `${hour}AM`;
                        hourlyMessages[hourStr] += 1;
                    }
                }
            });

            // Convertir a array para el gráfico
            return Object.entries(hourlyMessages).map(([hora, mensajes]) => ({ hora, mensajes }));
        } catch (error) {
            console.error(`Error al obtener volumen de mensajes para oficina ${officeId}:`, error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }

    // Método auxiliar para obtener todos los mensajes
    private async getAllMessages(): Promise<Chat[]> {
        return this.chatRepository.find({
            order: { timestamp: 'ASC' }
        });
    }

    async getTicketsByStatus() {
        try {
            const allTickets = await this.zendeskService.getAllTickets() as TicketResponse[];

            // Agrupar por estado y contar
            const result: Record<string, number> = {};

            allTickets.forEach(ticket => {
                const status = ticket.status || 'Sin estado';
                result[status] = (result[status] || 0) + 1;
            });

            return Object.entries(result).map(([name, value]) => ({
                name,
                value
            }));
        } catch (error) {
            console.error('Error al obtener tickets por estado:', error);
            // En caso de error, retornar datos de ejemplo para no romper la UI
            return [];
        }
    }

    async getTicketsByAgent() {
        try {
            const allTickets = await this.zendeskService.getAllTickets() as TicketResponse[];
            const agentTickets: Record<string, number> = {};

            allTickets.forEach(ticket => {
                if (ticket.assignee_id) {
                    // Intentamos obtener el nombre del agente, o usamos su ID si no está disponible
                    const agentName = ticket.assignee?.name || `Agente ${ticket.assignee_id}`;
                    agentTickets[agentName] = (agentTickets[agentName] || 0) + 1;
                }
            });

            return Object.entries(agentTickets)
                .map(([name, tickets]) => ({ name, tickets }))
                .sort((a, b) => b.tickets - a.tickets); // Ordenar de mayor a menor
        } catch (error) {
            console.error('Error al obtener tickets por agente:', error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }

    async getTicketsTrend() {
        try {
            const allTickets = await this.zendeskService.getAllTickets() as TicketResponse[];
            const monthlyTickets: Record<string, number> = {};

            // Array de nombres de meses en español
            const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

            // Inicializar el objeto con todos los meses para asegurar que aparezcan en el gráfico
            monthNames.forEach(month => {
                monthlyTickets[month] = 0;
            });

            // Agrupar tickets por mes de creación
            allTickets.forEach(ticket => {
                if (ticket.created_at) {
                    const date = new Date(ticket.created_at);
                    const month = date.getMonth(); // 0-11
                    const monthName = monthNames[month];

                    monthlyTickets[monthName] += 1;
                }
            });

            // Convertir a array para el gráfico y ordenar por mes cronológicamente
            return monthNames
                .map(mes => ({ mes, cantidad: monthlyTickets[mes] }))
                .filter(item => item.cantidad > 0); // Filtrar meses sin tickets
        } catch (error) {
            console.error('Error al obtener tendencia de tickets:', error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }

    async getMessageVolume() {
        try {
            // Obtener todos los mensajes de chat usando el repositorio
            const messages = await this.getAllMessages();
            const hourlyMessages: Record<string, number> = {};

            // Inicializar todas las horas del día con valor 0
            for (let i = 9; i <= 17; i++) { // Asumiendo horario laboral de 9AM a 5PM
                const hour = i > 12 ? `${i - 12}PM` : `${i}AM`;
                hourlyMessages[hour] = 0;
            }

            // Agrupar mensajes por hora
            messages.forEach(message => {
                if (message.timestamp) {
                    const date = new Date(message.timestamp);
                    const hour = date.getHours();

                    if (hour >= 9 && hour <= 17) { // Solo contar mensajes en horario laboral
                        const hourStr = hour > 12 ? `${hour - 12}PM` : `${hour}AM`;
                        hourlyMessages[hourStr] += 1;
                    }
                }
            });

            // Convertir a array para el gráfico
            return Object.entries(hourlyMessages).map(([hora, mensajes]) => ({ hora, mensajes }));
        } catch (error) {
            console.error('Error al obtener volumen de mensajes:', error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }

    async getMessageDistribution() {
        try {
            const messages = await this.getAllMessages();
            const messageTypes: Record<string, number> = {
                'Cliente': 0,
                'Agente': 0
            };

            // Contar mensajes por tipo de remitente
            messages.forEach(message => {
                if (message.sender === 'client') {
                    messageTypes['Cliente'] += 1;
                } else if (message.sender === 'agent') {
                    messageTypes['Agente'] += 1;
                }
            });

            return Object.entries(messageTypes).map(([name, value]) => ({ name, value }));
        } catch (error) {
            console.error('Error al obtener distribución de mensajes:', error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }

    async getResponseTimeByAgent() {
        try {
            // Obtenemos todos los mensajes y los agrupamos por chat
            const allMessages = await this.getAllMessages();

            // Agrupar mensajes por usuario para formar chats completos
            const chatsByUser: Record<string, Chat[]> = {};
            allMessages.forEach(message => {
                if (!chatsByUser[message.userId]) {
                    chatsByUser[message.userId] = [];
                }
                chatsByUser[message.userId].push(message);
            });

            // Analizar tiempos de respuesta
            const agentResponseTimes: Record<string, number> = {};
            const agentResponseCounts: Record<string, number> = {};

            Object.values(chatsByUser).forEach(chatMessages => {
                // Ordenar mensajes por timestamp
                const sortedMessages = chatMessages.sort((a, b) =>
                    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );

                let lastClientMessage: Chat | null = null;

                // Analizar secuencia de mensajes
                sortedMessages.forEach(message => {
                    if (message.sender === 'client') {
                        lastClientMessage = message;
                    } else if (message.sender === 'agent' && lastClientMessage && message.agentId) {
                        const responseTime = (
                            new Date(message.timestamp).getTime() -
                            new Date(lastClientMessage.timestamp).getTime()
                        ) / 60000; // Convertir a minutos

                        // Solo considerar tiempos de respuesta realistas (< 30 minutos)
                        if (responseTime > 0 && responseTime < 30) {
                            agentResponseTimes[message.agentId] = (agentResponseTimes[message.agentId] || 0) + responseTime;
                            agentResponseCounts[message.agentId] = (agentResponseCounts[message.agentId] || 0) + 1;
                        }

                        lastClientMessage = null; // Reiniciar para el siguiente par
                    }
                });
            });

            // Calcular promedios y formatear para la visualización
            const result = await Promise.all(
                Object.keys(agentResponseTimes).map(async (agentId) => {
                    const count = agentResponseCounts[agentId] || 1;
                    const avgTime = agentResponseTimes[agentId] / count;

                    // Intentar obtener el nombre real del agente
                    let name = `Agente ${agentId}`;
                    try {
                        const user = await this.userService.findOne(parseInt(agentId));
                        if (user) {
                            name = user.username || name;
                        }
                    } catch (error) {
                        // Ignorar errores, usar el agentId como nombre
                    }

                    return {
                        name,
                        tiempo: parseFloat(avgTime.toFixed(1))
                    };
                })
            );

            return result.sort((a, b) => a.tiempo - b.tiempo);
        } catch (error) {
            console.error('Error al obtener tiempos de respuesta por agente:', error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }

    async getLoginActivity() {
        try {
            // Obtener usuarios con lastLoginDate
            const users = await this.userRepository.find({
                where: {
                    lastLoginDate: Not(IsNull())
                },
                select: ['id', 'lastLoginDate']
            });

            // Crear objetos de actividad de login
            const loginActivities = users
                .filter(user => user.lastLoginDate)
                .map(user => ({
                    userId: user.id,
                    timestamp: user.lastLoginDate
                }));

            // Nombre de los días en español
            const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
            const dailyLogins: Record<string, number> = {};

            // Inicializar todos los días con valor 0
            dayNames.forEach(day => {
                dailyLogins[day] = 0;
            });

            // Contar logins por día de la semana
            loginActivities.forEach(login => {
                if (login.timestamp) {
                    const date = new Date(login.timestamp);
                    const day = dayNames[date.getDay()];
                    dailyLogins[day] += 1;
                }
            });

            // Reordenar para que comience por Lun y termine en Dom
            const orderedDays = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
            return orderedDays.map(dia => ({
                dia,
                logins: dailyLogins[dia]
            }));
        } catch (error) {
            console.error('Error al obtener actividad de login:', error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }

    async getUserRoles() {
        try {
            // Usamos el método findAll() existente
            const users = await this.userService.findAll();
            const roles: Record<string, number> = {};

            // Contar usuarios por rol
            users.forEach(user => {
                const role = user.role || 'Usuario';
                roles[role] = (roles[role] || 0) + 1;
            });

            return Object.entries(roles).map(([name, value]) => ({ name, value }));
        } catch (error) {
            console.error('Error al obtener roles de usuario:', error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }

    async getNewUsersByMonth() {
        try {
            const users = await this.userService.findAll();
            const monthlyUsers: Record<string, number> = {};

            // Array de nombres de meses en español
            const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

            // Inicializar todos los meses con valor 0
            monthNames.forEach(month => {
                monthlyUsers[month] = 0;
            });

            // Contar usuarios por mes de creación
            users.forEach(user => {
                if (user.createdAt) {
                    const date = new Date(user.createdAt);
                    const monthName = monthNames[date.getMonth()];
                    monthlyUsers[monthName] += 1;
                }
            });

            // Filtrar solo los últimos 6 meses con datos
            const sixMonthsData = monthNames
                .map(mes => ({ mes, cantidad: monthlyUsers[mes] }))
                .filter(item => item.cantidad > 0)
                .slice(-6);

            return sixMonthsData;
        } catch (error) {
            console.error('Error al obtener nuevos usuarios por mes:', error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }

    async getDashboardSummary() {
        try {
            // Obtener datos para las tarjetas de resumen
            const allTickets = await this.zendeskService.getAllTickets() as TicketResponse[];

            // Para activeChats, usamos el método existente
            const activeChats = await this.chatService.getActiveChats();

            const allUsers = await this.userService.findAll();

            // Calcular tiempo promedio de respuesta
            const agentResponseTimes = await this.getResponseTimeByAgent();
            const avgResponseTime = agentResponseTimes.reduce((sum, agent) => sum + agent.tiempo, 0) /
                (agentResponseTimes.length || 1); // Prevenir división por cero

            // Calcular tendencias comparando con período anterior (ejemplo simplificado)
            const ticketTrend = 0.12; // +12%
            const chatTrend = 0.05; // +5%
            const userTrend = 0.08; // +8%
            const responseTrend = -0.10; // -10% (mejora)

            return {
                totalTickets: {
                    value: allTickets.length,
                    trend: `+${(ticketTrend * 100).toFixed(0)}%`
                },
                activeChats: {
                    value: activeChats.length,
                    trend: `+${(chatTrend * 100).toFixed(0)}%`
                },
                totalUsers: {
                    value: allUsers.length,
                    trend: `+${(userTrend * 100).toFixed(0)}%`
                },
                avgResponseTime: {
                    value: `${avgResponseTime.toFixed(1)} min`,
                    trend: `${(responseTrend * 100).toFixed(0)}%`,
                    trendPositive: responseTrend < 0 // Tendencia negativa es positiva para tiempo de respuesta
                }
            };
        } catch (error) {
            console.error('Error al obtener resumen del dashboard:', error);
            // Datos de ejemplo en caso de error
            return {
                totalTickets: {
                    value: 141,
                    trend: '+12%'
                },
                activeChats: {
                    value: 24,
                    trend: '+5%'
                },
                totalUsers: {
                    value: 90,
                    trend: '+8%'
                },
                avgResponseTime: {
                    value: '1.4 min',
                    trend: '-10%',
                    trendPositive: false
                }
            };
        }
    }

    // Nuevo método para obtener la distribución de conversaciones por estado
    async getConversationStatusDistribution() {
        try {
            // Consulta para obtener el conteo de conversaciones por estado
            const activeCount = await this.conversationRepository.count({
                where: { status: 'active' }
            });

            // En el sistema actual solo hay 'active' y 'closed', pero podemos agregar 'pending' si se necesita
            // Para este ejemplo, consideraremos como pendientes las conversaciones activas sin agente asignado
            const pendingCount = await this.conversationRepository.count({
                where: { status: 'active', agentId: IsNull() }
            });

            // Las conversaciones archivadas son las que tienen estado 'closed'
            const archivedCount = await this.conversationRepository.count({
                where: { status: 'closed' }
            });

            // Calcular activas reales (activas menos pendientes)
            const realActiveCount = activeCount - pendingCount;

            return [
                { name: 'Activos', value: realActiveCount },
                { name: 'Pendientes', value: pendingCount },
                { name: 'Archivados', value: archivedCount }
            ];
        } catch (error) {
            console.error('Error al obtener distribución de chats por estado:', error);
            // Datos de ejemplo en caso de error
            return [];
        }
    }

    // --- NUEVOS MÉTODOS PARA REPORTES DE TRANSACCIONES ---
    async getTransactionSummary(officeId: string) {
        const transactions = await this.ipnService.getTransactions(officeId);
        const total = transactions.length;
        const deposits = transactions.filter(tx => tx.type === 'deposit').length;
        const withdraws = transactions.filter(tx => tx.type === 'withdraw').length;
        return { total, deposits, withdraws };
    }

    async getTransactionsByStatus(officeId: string) {
        const transactions = await this.ipnService.getTransactions(officeId);
        const statusMap: Record<string, number> = {
            'Aceptado': 0,
            'Rechazado': 0,
            'Pendiente': 0,
            'Match MP': 0
        };
        transactions.forEach(tx => {
            // Normaliza el estado para que coincida con los tres permitidos
            let status = (tx.status || '').toLowerCase();
            if (status === 'aceptado' || status === 'approved') status = 'Aceptado';
            else if (status === 'rechazado' || status === 'rejected' || status === 'error') status = 'Rechazado';
            else if (status === 'pendiente' || status === 'pending') status = 'Pendiente';
            else if (status === 'match mp') status = 'Match MP';
            else return; // Ignora otros estados
            statusMap[status] = (statusMap[status] || 0) + 1;
        });
        return Object.entries(statusMap).map(([name, value]) => ({ name, value }));
    }

    async getTransactionTrend(officeId: string) {
        const transactions = await this.ipnService.getTransactions(officeId);
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        // Inicializa estructura para depósitos y retiros
        const monthlyDeposits: Record<string, number> = {};
        const monthlyWithdraws: Record<string, number> = {};
        monthNames.forEach(m => {
            monthlyDeposits[m] = 0;
            monthlyWithdraws[m] = 0;
        });
        console.log('[getTransactionTrend] Transacciones recibidas:', transactions);
        transactions.forEach(tx => {
            if (tx.date_created) {
                const date = new Date(tx.date_created);
                const month = monthNames[date.getMonth()];
                if (tx.type === 'deposit') monthlyDeposits[month] += 1;
                if (tx.type === 'withdraw') monthlyWithdraws[month] += 1;
            }
        });
        // Solo los últimos 6 meses con datos
        const depositsTrend = monthNames
            .map(mes => ({ mes, cantidad: monthlyDeposits[mes] }))
            .filter(item => item.cantidad > 0)
            .slice(-6);
        const withdrawsTrend = monthNames
            .map(mes => ({ mes, cantidad: monthlyWithdraws[mes] }))
            .filter(item => item.cantidad > 0)
            .slice(-6);
        return {
            deposits: depositsTrend,
            withdraws: withdrawsTrend
        };
    }

    async getTransactionsByAgent(officeId: string) {
        const transactions = await this.ipnService.getTransactions(officeId);
        console.log('[getTransactionsByAgent] Transacciones recibidas:', transactions);
        const agentMap: Record<string, number> = {};
        transactions.forEach(tx => {
            const agent = tx.idCliente || tx.payer_id || 'Sin agente';
            agentMap[agent] = (agentMap[agent] || 0) + 1;
        });
        const result = Object.entries(agentMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
        console.log('[getTransactionsByAgent] Agrupamiento por agente:', result);
        return result;
    }
    // --- FIN NUEVOS MÉTODOS ---
}