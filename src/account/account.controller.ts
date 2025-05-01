import { Controller, Get, Post, Body, Param, Delete, Put, HttpCode, HttpStatus, BadRequestException, Query, UseGuards, ParseIntPipe } from '@nestjs/common'; // Añadir ParseIntPipe si es necesario para IDs numéricos
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger'; // Añadir ApiQuery
import { AccountService } from './account.service';
import { AccountDto, AccountsResponseDto, CbuSingleResponseDto, CreateAccountDto } from './dto/account.dto';
import { ApiKeyAuth } from '../auth/apikeys/decorators/api-key-auth.decorator';
import { API_PERMISSIONS } from '../auth/apikeys/permissions.constants';


@ApiTags('Accounts')
@Controller('accounts')
export class AccountController {
    constructor(private readonly accountService: AccountService) { }

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
    @ApiKeyAuth(API_PERMISSIONS.ACCOUNTS_READ_CBUS) // Mantener si aplica
    @ApiOperation({ summary: 'Get CBU by agent ID (filtered by provided officeId)' })
    @ApiQuery({ name: 'idAgent', required: true, description: 'ID of the agent', type: String })
    @ApiQuery({ name: 'officeId', required: true, description: 'ID of the office where the agent belongs', type: String }) // Documentar officeId
    @ApiResponse({
        status: 200,
        description: 'The CBU for the specified agent within the specified office',
        type: CbuSingleResponseDto
    })
    @ApiResponse({ status: 400, description: 'idAgent or officeId query parameter is missing' })
    @ApiResponse({ status: 404, description: 'No active account found for the agent in the specified office' })
    async getCbuByAgent(
        @Query('idAgent') idAgent: string,
        @Query('officeId') officeId: string // Recibir officeId como query param
    ): Promise<{ cbu: string }> {
        if (!idAgent || !officeId) {
            throw new BadRequestException('Both idAgent and officeId query parameters are required');
        }
        console.log(`[AccountController] getCbuByAgent: Filtering by officeId: ${officeId} for agent: ${idAgent}`);
        const cbu = await this.accountService.findCbuByAgent(idAgent, officeId);
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
    @ApiQuery({ name: 'officeId', required: true, description: 'ID of the office the account belongs to', type: String }) // Documentar officeId
    @ApiResponse({ status: 200, description: 'The account has been successfully updated', type: AccountDto })
    @ApiResponse({ status: 400, description: 'officeId query parameter is required or invalid body' })
    @ApiResponse({ status: 404, description: 'Account not found in the specified office' })
    // @UseGuards(ApiKeyAuth) // Mantener si aplica
    async update(
        @Param('id', ParseIntPipe) id: number, // Usar ParseIntPipe si el ID es número
        @Body() updateAccountDto: Partial<CreateAccountDto>,
        @Query('officeId') officeId: string // Recibir officeId como query param
    ): Promise<AccountDto> {
        if (!officeId) {
            throw new BadRequestException('officeId query parameter is required');
        }
        console.log(`[AccountController] update: Filtering by officeId: ${officeId} for account ID: ${id}`);
        // El servicio ya espera el officeId como tercer argumento
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
}