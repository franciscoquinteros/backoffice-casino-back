import { Controller, Get, Post, Body, Param, Delete, Put, HttpCode, HttpStatus, BadRequestException, Query, UseGuards, ParseIntPipe, Req, ForbiddenException } from '@nestjs/common'; // Añadir ParseIntPipe y Req
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

interface RequestWithUser extends Request {
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
        @Req() request: RequestWithUser
    ): Promise<AccountsResponseDto> {
        // Verificar si el usuario es superadmin
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
    // Decide qué autenticación necesita este endpoint:
    // @UseGuards(JwtAuthGuard) // Si requiere usuario logueado (aunque no uses su oficina)
    // @UseGuards(ApiKeyAuth) // Si requiere API Key
    //@ApiKeyAuth(API_PERMISSIONS.ACCOUNTS_READ_CBUS) // Manteniendo tu ApiKeyAuth original
    @ApiOperation({ summary: 'Get CBU for an active account in a specific office' })
    // Cambia el nombre del parámetro en la documentación y en la URL
    @ApiQuery({ name: 'idAgent', required: true, description: 'ID of the office', type: String })
    @ApiResponse({ status: 200, description: 'The CBU found for the office', type: CbuSingleResponseDto }) // CbuSingleResponseDto probablemente solo tiene { cbu: string }
    @ApiResponse({ status: 400, description: 'officeId query parameter is missing' })
    @ApiResponse({ status: 401, description: 'Unauthorized (Invalid API Key, if ApiKeyAuth is used)' })
    @ApiResponse({ status: 404, description: 'No active account found for the specified office' })
    async getCbuByOffice( // <-- Nombre de método cambiado
        @Query('idAgent') officeId: string // <-- Parámetro renombrado y único necesario
    ): Promise<{ cbu: string }> {
        if (!officeId) {
            throw new BadRequestException('idAgent query parameter is required');
        }
        console.log(`[AccountController] getCbuByOffice: Requesting CBU for officeId: ${officeId}`);

        // Llama a un método de servicio simplificado que solo necesita el officeId
        const cbu = await this.accountService.findCbuByOffice(officeId);

        return { cbu };
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

    @Get('cbu/rotate')
    @ApiOperation({ summary: 'Get CBU based on amount rotation system' })
    @ApiQuery({ name: 'amount', required: true, description: 'Amount to be deposited', type: Number })
    @ApiQuery({ name: 'idAgent', required: true, description: 'ID of the office', type: String })
    @ApiResponse({ status: 200, description: 'CBU selected for the specified amount', type: CbuRotationResponseDto })
    @ApiResponse({ status: 400, description: 'Missing required parameters' })
    @ApiResponse({ status: 404, description: 'No active accounts found for the specified office' })
    async getCbuByRotation(
        @Query('amount') amount: number,
        @Query('idAgent') officeId: string
    ): Promise<CbuRotationResponseDto> {
        if (!amount || !officeId) {
            throw new BadRequestException('amount and idAgent query parameters are required');
        }

        if (isNaN(Number(amount)) || Number(amount) <= 0) {
            throw new BadRequestException('amount must be a positive number');
        }

        console.log(`[AccountController] getCbuByRotation: Requesting CBU for amount: ${amount}, officeId: ${officeId}`);

        const cbu = await this.accountService.getNextAvailableCbu(Number(amount), officeId);

        return {
            cbu,
            amount_received: Number(amount)
        };
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