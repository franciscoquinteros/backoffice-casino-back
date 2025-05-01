import {
  Controller, Get, NotFoundException, Param,
  UseGuards, // <-- Importa UseGuards
  Req, ForbiddenException // <-- Importa Req y ForbiddenException
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger'; // <-- Importa ApiBearerAuth
import { ReportService } from './report.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Office } from 'src/office/entities/office.entity';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // <-- Importa tu Guard JWT
import { Request } from 'express'; // Importa Request

// Interfaz para el request con usuario (igual que en otros controllers)
interface AuthenticatedUser {
  id: string | number;
  office: string; // <-- Usa 'office' consistentemente
  role?: string;
}
interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}
// Fin interfaz

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard) // <-- APLICA GUARD A TODO EL CONTROLADOR
@ApiBearerAuth()         // <-- Documenta Auth para Swagger
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    // Ya no necesitas el repositorio de Office aquí si obtienes la oficina del usuario
    // @InjectRepository(Office)
    // private readonly officeRepository: Repository<Office>
  ) { }

  @Get('tickets-by-status') // URL simple, sin :officeId
  @ApiOperation({ summary: 'Get ticket distribution by status for logged-in user\'s office' })
  @ApiResponse({ status: 200, description: 'Ticket distribution by status' /*... schema ...*/ })
  @ApiResponse({ status: 403, description: 'Forbidden/User has no office' })
  async getTicketsByStatus(@Req() request: RequestWithUser) {
    const userOfficeId = request.user?.office; // Obtiene la oficina del token (via Guard/Strategy)
    // ¡IMPORTANTE! Asumimos que officeId en el token es el ID numérico.
    // Si es el nombre, necesitarías buscar el ID o adaptar el service.
    // Vamos a asumir que es el ID numérico por ahora.
    if (!userOfficeId) {
      throw new ForbiddenException("User office information is missing or invalid.");
    }
    // Llama al método del servicio específico para esa oficina
    return this.reportService.getTicketsByStatusForOffice(parseInt(userOfficeId, 10)); // Convierte a número si es necesario
  }

  @Get('tickets-by-agent')
  @ApiOperation({ summary: 'Get tickets assigned by agent for logged-in user\'s office' })
  // ... (ApiResponses) ...
  async getTicketsByAgent(@Req() request: RequestWithUser) {
    const userOfficeId = request.user?.office;
    if (!userOfficeId) { throw new ForbiddenException("User office information is missing."); }
    return this.reportService.getTicketsByAgentForOffice(parseInt(userOfficeId, 10));
  }

  @Get('tickets-trend')
  @ApiOperation({ summary: 'Get tickets trend over time for logged-in user\'s office' })
  // ... (ApiResponses) ...
  async getTicketsTrend(@Req() request: RequestWithUser) {
    const userOfficeId = request.user?.office;
    if (!userOfficeId) { throw new ForbiddenException("User office information is missing."); }
    return this.reportService.getTicketsTrendForOffice(parseInt(userOfficeId, 10));
  }

  @Get('messages-volume')
  @ApiOperation({ summary: 'Get message volume by hour for logged-in user\'s office' })
  async getMessageVolume(@Req() request: RequestWithUser) {
    const userOfficeId = request.user?.office;
    if (!userOfficeId) { throw new ForbiddenException("User office information is missing."); }
    return this.reportService.getMessageVolumeForOffice(parseInt(userOfficeId, 10));
  }

  @Get('messages-distribution')
  @ApiOperation({ summary: 'Get distribution of messages by sender type for logged-in user\'s office' })
  async getMessageDistribution(@Req() request: RequestWithUser) {
    const userOfficeId = request.user?.office;
    if (!userOfficeId) { throw new ForbiddenException("User office information is missing."); }
    return this.reportService.getMessageDistributionForOffice(parseInt(userOfficeId, 10));
  }

  @Get('response-time-by-agent')
  @ApiOperation({ summary: 'Get average response time by agent for logged-in user\'s office' })
  async getResponseTimeByAgent(@Req() request: RequestWithUser) {
    const userOfficeId = request.user?.office;
    if (!userOfficeId) { throw new ForbiddenException("User office information is missing."); }
    return this.reportService.getResponseTimeByAgentForOffice(parseInt(userOfficeId, 10));
  }

  @Get('login-activity')
  @ApiOperation({ summary: 'Get login activity by day for logged-in user\'s office' })
  async getLoginActivity(@Req() request: RequestWithUser) {
    const userOfficeId = request.user?.office;
    if (!userOfficeId) { throw new ForbiddenException("User office information is missing."); }
    return this.reportService.getLoginActivityForOffice(parseInt(userOfficeId, 10));
  }

  @Get('user-roles')
  @ApiOperation({ summary: 'Get distribution of user roles for logged-in user\'s office' })
  async getUserRoles(@Req() request: RequestWithUser) {
    const userOfficeId = request.user?.office;
    if (!userOfficeId) { throw new ForbiddenException("User office information is missing."); }
    return this.reportService.getUserRolesForOffice(parseInt(userOfficeId, 10));
  }

  @Get('new-users-by-month')
  @ApiOperation({ summary: 'Get new users registered by month for logged-in user\'s office' })
  async getNewUsersByMonth(@Req() request: RequestWithUser) {
    const userOfficeId = request.user?.office;
    if (!userOfficeId) { throw new ForbiddenException("User office information is missing."); }
    return this.reportService.getNewUsersByMonthForOffice(parseInt(userOfficeId, 10));
  }

  @Get('dashboard-summary')
  @ApiOperation({ summary: 'Get dashboard summary metrics for logged-in user\'s office' })
  async getDashboardSummary(@Req() request: RequestWithUser) {
    const user = request.user;
    const userOfficeIdString = user?.office;

    // --- Log para verificar ---
    console.log(`[ReportController - getDashboardSummary] User ID: ${user?.id}, Office from Token: ${userOfficeIdString}, Role: ${user?.role}`);
    // --- Fin Log ---

    if (!userOfficeIdString) { throw new ForbiddenException("User office information is missing."); }

    const officeId = parseInt(userOfficeIdString, 10);
    if (isNaN(officeId)) { throw new ForbiddenException("Invalid user office format."); }

    console.log(`[ReportController - getDashboardSummary] Calling service for office ID: ${officeId}`);
    return this.reportService.getDashboardSummaryForOffice(officeId);
}

  @Get('/conversation-status-distribution')
  @ApiOperation({ summary: 'Get distribution of conversations by status for logged-in user\'s office' })
  // ... (ApiResponses) ...
  async getConversationStatusDistribution(@Req() request: RequestWithUser) {
    const userOfficeId = request.user?.office;
    if (!userOfficeId) { throw new ForbiddenException("User office information is missing."); }
    return this.reportService.getConversationStatusDistributionForOffice(parseInt(userOfficeId, 10));
  }

  // --- ELIMINA O RESTRINGE LOS ENDPOINTS CON /office/:officeId ---
  // Ya no son necesarios si el filtrado se basa en el token.
  // Puedes borrarlos o añadir un guard de roles si solo los admins pueden ver reportes de oficinas específicas.
  /*
  @Get('office/:officeId/tickets-by-status')
  async getTicketsByStatusForOffice(@Param('officeId') officeId: number, @Req() request: RequestWithUser) {
      // --- AÑADIR AUTORIZACIÓN AQUÍ ---
      const requestingUserOffice = request.user?.office;
      if (!requestingUserOffice) throw new ForbiddenException("User office missing.");
      if (requestingUserOffice !== officeId.toString() // && request.user.role !== 'superadmin'
         ) {
           throw new ForbiddenException("Cannot access reports for other offices.");
      }
      // --- FIN AUTORIZACIÓN ---
      return this.reportService.getTicketsByStatusForOffice(officeId);
  }
  // Repetir autorización para todos los demás endpoints /office/:officeId/... O BORRARLOS.
  */

}