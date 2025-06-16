import { Controller, Get, Post, Body, Param, Delete, Put, HttpCode, HttpStatus, BadRequestException, Query, UseGuards, ParseIntPipe, Req, ForbiddenException, NotFoundException } from '@nestjs/common'; // Añadir ParseIntPipe y Req
import { ApiOperation, ApiResponse, ApiTags, ApiQuery, ApiBearerAuth } from '@nestjs/swagger'; // Añadir ApiQuery y ApiBearerAuth
import { AccountService } from './account.service';
import { AccountDto, AccountsResponseDto, CbuRotationResponseDto, CbuSingleResponseDto, CreateAccountDto, GetCbuRotationDto, UpdateAccountDto } from './dto/account.dto';
import { ApiKeyAuth } from '../auth/apikeys/decorators/api-key-auth.decorator';
import { API_PERMISSIONS } from '../auth/apikeys/permissions.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

// Definir interfaces similares a las del UserController para consistencia
interface AuthenticatedUser {
    id: string | number;
    office: string;
    role?: string;
    username?: string;
    email?: string;
}

interface AuthenticatedRequest extends Request {
    user?: AuthenticatedUser;
}

@ApiTags('Accounts')
@Controller('accounts')
@ApiBearerAuth()  // Aplicado a nivel de clase
export class AccountController {
    constructor(private readonly accountService: AccountService) { }

    @Get('all')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get all accounts from all offices (superadmin only)' })
    @ApiResponse({ status: 200, description: 'List of all accounts in the system', type: AccountsResponseDto })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
    @ApiResponse({ status: 403, description: 'Forbidden - User is not a superadmin' })
    async getAllAccounts(
        @Req() request: AuthenticatedRequest
    ): Promise<AccountsResponseDto> {
        const user = request.user;
        console.log('GET /accounts/all - Usuario autenticado:', user);

        if (!user) {
            console.error('GET /accounts/all - No hay usuario autenticado');
            throw new ForbiddenException('Usuario no autenticado');
        }

        if (user.role !== 'superadmin') {
            console.error(`GET /accounts/all - Usuario ${user.id} con rol ${user.role} intentó acceder a todas las cuentas`);
            throw new ForbiddenException('Sólo los superadmins pueden acceder a todas las cuentas');
        }

        console.log(`[AccountController] getAllAccounts: Obteniendo todas las cuentas para superadmin ${user.id}`);
        const accounts = await this.accountService.findAllForSuperadmin();
        console.log(`Se encontraron ${accounts.length} cuentas en total`);
        return { accounts };
    }

    @Get()
    @ApiOperation({ summary: 'Get all accounts (filtered by provided officeId)' })
    @ApiQuery({ name: 'officeId', required: true, description: 'ID of the office to filter accounts', type: String }) // Documentar el query param
    @ApiResponse({
        status: 200,
        description: 'List of accounts filtered by the specified officeId',
        type: AccountsResponseDto
    })
    @ApiResponse({ status: 400, description: 'officeId query parameter is required' }) // Añadir respuesta para parámetro faltante
    // @UseGuards(ApiKeyAuth) // Mantén tus guards si aún necesitas autenticación/autorización general
    async findAll(@Query('officeId') officeId: string): Promise<AccountsResponseDto> {
        if (!officeId) {
            throw new BadRequestException('officeId query parameter is required');
        }
        console.log(`[AccountController] findAll: Filtering by officeId: ${officeId}`);
        const accounts = await this.accountService.findAll(officeId);
        return { accounts };
    }

    @Get('cbu')
    @ApiOperation({ summary: 'Get CBU using rotation system for a specific office' })
    @ApiQuery({ name: 'idAgent', required: true, description: 'ID of the office', type: String })
    @ApiResponse({ status: 200, description: 'The CBU selected using rotation system', type: CbuSingleResponseDto })
    @ApiResponse({ status: 400, description: 'idAgent query parameter is missing' })
    @ApiResponse({ status: 404, description: 'No active CBU accounts found for the specified agent/office' })
    async getCbuByOffice(
        @Query('idAgent') officeId: string
    ): Promise<{ cbu: string; nombredetitular: string }> {
        if (!officeId) {
            throw new BadRequestException('idAgent query parameter is required');
        }
        console.log(`[AccountController] getCbuByOffice: Requesting CBU with rotation for officeId: ${officeId}`);

        try {
            // Usar monto fijo de 300000 para la rotación
            const accountData = await this.accountService.getNextAvailableCbu(300000, officeId);

            return {
                cbu: accountData.cbu,
                nombredetitular: accountData.name
            };
        } catch (error) {
            if (error instanceof NotFoundException) {
                console.error(`[AccountController] getCbuByOffice: ${error.message}`);
                throw error; // Re-lanzar el error del servicio con el mensaje específico
            }
            // Para cualquier otro tipo de error
            console.error(`[AccountController] getCbuByOffice: Error inesperado:`, error);
            throw new BadRequestException('Error al obtener CBU para el agente especificado');
        }
    }

    @Get('cbu/rotation-status')
    @ApiOperation({ summary: 'Get CBU rotation status showing accumulated amounts for all accounts' })
    @ApiQuery({ name: 'idAgent', required: false, description: 'ID of the office', type: String })
    @ApiResponse({ status: 200, description: 'CBU rotation status information' })
    @ApiResponse({ status: 404, description: 'No active accounts found for the specified office' })
    async getCbuRotationStatus(
        @Query('idAgent') officeId?: string
    ): Promise<{
        status: string;
        total_accounts: number;
        accounts_below_limit: number;
        accounts_at_limit: number;
        max_limit: number;
        next_available_cbu?: string;
        accounts: Array<{
            id: number;
            name: string;
            cbu: string;
            accumulated_amount: number;
            is_available: boolean;
        }>;
    }> {
        console.log(`[AccountController] getCbuRotationStatus: Getting rotation status${officeId ? ` for office ${officeId}` : ''}`);

        const MAX_AMOUNT_PER_ACCOUNT = 300000;

        const accounts = await this.accountService.findAll(officeId);
        const activeAccounts = accounts.filter(account =>
            account.wallet === 'mercadopago' && account.status === 'active'
        );

        if (!activeAccounts || activeAccounts.length === 0) {
            throw new BadRequestException(`No active MercadoPago accounts found${officeId ? ` for office ${officeId}` : ''}`);
        }

        // Ordenar cuentas por accumulated_amount para mostrar el orden de rotación
        const sortedAccounts = activeAccounts.sort((a, b) => {
            const amountDiff = Number(a.accumulated_amount) - Number(b.accumulated_amount);
            if (amountDiff === 0) {
                return a.id - b.id; // Usar ID como criterio secundario
            }
            return amountDiff;
        });

        const accountsBelowLimit = sortedAccounts.filter(account =>
            Number(account.accumulated_amount) < MAX_AMOUNT_PER_ACCOUNT
        ).length;

        const accountsAtLimit = sortedAccounts.length - accountsBelowLimit;

        // Obtener el próximo CBU disponible
        let nextAvailableCbu = undefined;
        try {
            const nextAvailable = await this.accountService.getNextAvailableCbu(1, officeId);
            nextAvailableCbu = nextAvailable.cbu;
        } catch (error) {
            console.log('No se pudo obtener el próximo CBU disponible:', error.message);
        }

        const accountsInfo = sortedAccounts.map(account => ({
            id: account.id,
            name: account.name,
            cbu: account.cbu,
            accumulated_amount: Number(account.accumulated_amount),
            is_available: Number(account.accumulated_amount) < MAX_AMOUNT_PER_ACCOUNT
        }));

        return {
            status: 'success',
            total_accounts: sortedAccounts.length,
            accounts_below_limit: accountsBelowLimit,
            accounts_at_limit: accountsAtLimit,
            max_limit: MAX_AMOUNT_PER_ACCOUNT,
            next_available_cbu: nextAvailableCbu,
            accounts: accountsInfo
        };
    }

    @Post('cbu/reset-rotation')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Reset accumulated amounts for all accounts (Admin only)' })
    @ApiQuery({ name: 'idAgent', required: false, description: 'ID of the office', type: String })
    @ApiResponse({ status: 200, description: 'Accumulated amounts reset successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden - Only admins can reset rotation' })
    async resetCbuRotation(
        @Req() request: AuthenticatedRequest,
        @Query('idAgent') officeId?: string
    ): Promise<{ status: string; message: string; accounts_reset: number }> {
        console.log(`[AccountController] resetCbuRotation: Resetting rotation${officeId ? ` for office ${officeId}` : ''}`);

        const user = request.user;

        // Verificar permisos - solo admins y superadmins pueden resetear
        if (user?.role !== 'admin' && user?.role !== 'superadmin') {
            throw new ForbiddenException('Only admins can reset CBU rotation');
        }

        // Si el usuario es admin (no superadmin), solo puede resetear su propia oficina
        if (user?.role === 'admin' && (!officeId || officeId !== user.office)) {
            throw new ForbiddenException('Admins can only reset rotation for their own office');
        }

        // Obtener cuentas activas
        const accounts = await this.accountService.findAll(officeId);
        const activeAccounts = accounts.filter(account =>
            account.wallet === 'mercadopago' && account.status === 'active'
        );

        if (!activeAccounts || activeAccounts.length === 0) {
            throw new BadRequestException(`No active MercadoPago accounts found${officeId ? ` for office ${officeId}` : ''}`);
        }

        // Resetear los accumulated_amounts
        await this.accountService.resetAccumulatedAmounts(officeId);

        console.log(`[AccountController] resetCbuRotation: Reset completed for ${activeAccounts.length} accounts`);

        return {
            status: 'success',
            message: `CBU rotation reset successfully${officeId ? ` for office ${officeId}` : ''}`,
            accounts_reset: activeAccounts.length
        };
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get account by ID (filtered by provided officeId)' })
    @ApiQuery({ name: 'officeId', required: true, description: 'ID of the office the account belongs to', type: String }) // Documentar officeId
    @ApiResponse({ status: 200, description: 'The account', type: AccountDto })
    @ApiResponse({ status: 400, description: 'officeId query parameter is required' })
    @ApiResponse({ status: 404, description: 'Account not found in the specified office' })
    // @UseGuards(ApiKeyAuth) // Mantener si aplica
    async findOne(
        @Param('id', ParseIntPipe) id: number, // Usar ParseIntPipe si el ID es número
        @Query('officeId') officeId: string // Recibir officeId como query param
    ): Promise<AccountDto> {
        if (!officeId) {
            throw new BadRequestException('officeId query parameter is required');
        }
        console.log(`[AccountController] findOne: Filtering by officeId: ${officeId} for account ID: ${id}`);
        return this.accountService.findOne(id, officeId);
    }

    @Post()
    @ApiOperation({ summary: 'Create a new account for a specific office' })
    @ApiQuery({ name: 'officeId', required: true, description: 'ID of the office to assign the account to', type: String }) // Documentar officeId
    @ApiResponse({ status: 201, description: 'The account has been successfully created', type: AccountDto })
    @ApiResponse({ status: 400, description: 'officeId query parameter is required or invalid body' })
    // @UseGuards(ApiKeyAuth) // Mantener si aplica
    async create(
        @Body() createAccountDto: CreateAccountDto,
        @Query('officeId') officeId: string // Recibir officeId como query param
    ): Promise<AccountDto> {
        if (!officeId) {
            throw new BadRequestException('officeId query parameter is required');
        }
        console.log(`[AccountController] create: Assigning to officeId: ${officeId}`);
        // El servicio ya espera el officeId como segundo argumento
        return this.accountService.create(createAccountDto, officeId);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update an account (within a specific office)' })
    @ApiQuery({ name: 'officeId', required: true, description: 'ID of the office the account belongs to', type: String })
    @ApiResponse({ status: 200, description: 'The account has been successfully updated', type: AccountDto })
    @ApiResponse({ status: 400, description: 'officeId query parameter is required or invalid body' })
    @ApiResponse({ status: 404, description: 'Account not found in the specified office' })
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateAccountDto: UpdateAccountDto,
        @Query('officeId') officeId: string
    ): Promise<AccountDto> {
        if (!officeId) {
            throw new BadRequestException('officeId query parameter is required');
        }
        console.log(`[AccountController] update: Filtering by officeId: ${officeId} for account ID: ${id}`);
        return this.accountService.update(id, updateAccountDto, officeId);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete an account (within a specific office)' })
    @ApiQuery({ name: 'officeId', required: true, description: 'ID of the office the account belongs to', type: String }) // Documentar officeId
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiResponse({ status: 204, description: 'The account has been successfully deleted' })
    @ApiResponse({ status: 400, description: 'officeId query parameter is required' })
    @ApiResponse({ status: 404, description: 'Account not found in the specified office' })
    // @UseGuards(ApiKeyAuth) // Mantener si aplica
    async remove(
        @Param('id', ParseIntPipe) id: number, // Usar ParseIntPipe si el ID es número
        @Query('officeId') officeId: string // Recibir officeId como query param
    ): Promise<void> {
        if (!officeId) {
            throw new BadRequestException('officeId query parameter is required');
        }
        console.log(`[AccountController] remove: Filtering by officeId: ${officeId} for account ID: ${id}`);
        // El servicio ya espera el officeId como segundo argumento
        return this.accountService.remove(id, officeId);
    }

    @Post('reset-amounts')
    @ApiOperation({ summary: 'Reset accumulated amounts for all accounts in an office' })
    @ApiQuery({ name: 'officeId', required: true, description: 'ID of the office', type: String })
    @ApiResponse({ status: 200, description: 'Accumulated amounts have been reset successfully' })
    @ApiResponse({ status: 400, description: 'officeId query parameter is required' })
    async resetAccumulatedAmounts(
        @Query('officeId') officeId: string
    ): Promise<{ message: string }> {
        if (!officeId) {
            throw new BadRequestException('officeId query parameter is required');
        }

        console.log(`[AccountController] resetAccumulatedAmounts: Resetting amounts for officeId: ${officeId}`);

        await this.accountService.resetAccumulatedAmounts(officeId);

        return { message: 'Accumulated amounts reset successfully' };
    }

    @Get('by-cbu/:cbu')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get account information by CBU' })
    @ApiResponse({ status: 200, description: 'Account information found for the specified CBU' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Account not found for the specified CBU' })
    async getAccountByCbu(@Param('cbu') cbu: string): Promise<AccountDto> {
        console.log(`[AccountController] getAccountByCbu: Requesting account info for CBU: ${cbu}`);

        if (!cbu) {
            throw new BadRequestException('CBU parameter is required');
        }

        const account = await this.accountService.findByCbu(cbu);

        if (!account) {
            throw new BadRequestException(`No account found for CBU: ${cbu}`);
        }

        // Convertir la entidad a DTO antes de devolverla
        return new AccountDto(account);
    }
}