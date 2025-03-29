import { Controller, Post, Body, Get, Param, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiExcludeController } from '@nestjs/swagger';
import { ApiKeyService } from './apikey.service';
import { API_PERMISSIONS } from './permissions.constants';
import { ApiKeyResponseDto, CreateApiKeyDto, GenerateLimitedKeyDto } from './dto/apikey.dto';

@ApiExcludeController()
@ApiTags('API Keys')
@Controller('api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @ApiOperation({ 
    summary: 'Create a new API Key',
    description: 'Crea una nueva API Key con permisos personalizados. La clave generada solo se muestra una vez, guárdala de forma segura.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'The API Key has been successfully created.',
    type: ApiKeyResponseDto
  })
  @ApiResponse({ 
    status: 409, 
    description: 'Ya existe una API Key con ese nombre.'
  })
  @ApiBody({ type: CreateApiKeyDto })
  async createApiKey(@Body() createApiKeyDto: CreateApiKeyDto): Promise<ApiKeyResponseDto> {
    return this.apiKeyService.createApiKey(
      createApiKeyDto.name,
      createApiKeyDto.permissions,
      {
        description: createApiKeyDto.description,
        clientName: createApiKeyDto.clientName,
        expiresInDays: createApiKeyDto.expiresInDays
      }
    );
  }

  @Get()
  @ApiOperation({ 
    summary: 'Get all API Keys (without actual keys)',
    description: 'Obtiene todas las API Keys registradas. Por seguridad, no se muestran las claves reales.'
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de todas las API Keys registradas (sin las claves)'
  })
  async getAllApiKeys() {
    return this.apiKeyService.getAllApiKeys();
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ 
    summary: 'Deactivate an API Key',
    description: 'Desactiva una API Key existente. Esta operación no se puede deshacer.'
  })
  @ApiResponse({
    status: 204,
    description: 'La API Key ha sido desactivada correctamente'
  })
  @ApiResponse({
    status: 404,
    description: 'API Key no encontrada'
  })
  async deactivateApiKey(@Param('id') id: string): Promise<void> {
    await this.apiKeyService.deactivateApiKey(id);
  }

  @Post('generate-limited-key')
  @ApiOperation({ 
    summary: 'Generate a key only for ticket creation and accounts/cbus',
    description: 'Genera una API Key con permisos limitados específicamente para crear tickets y acceder a accounts/cbus'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'La API Key limitada ha sido creada correctamente',
    type: ApiKeyResponseDto
  })
  @ApiBody({ type: GenerateLimitedKeyDto })
  async generateLimitedKey(@Body() body: GenerateLimitedKeyDto): Promise<ApiKeyResponseDto> {
    // Crear una clave con permisos limitados específicamente para los 2 endpoints requeridos
    return this.apiKeyService.createApiKey(
      body.name,
      [
        API_PERMISSIONS.ZENDESK_CREATE_TICKET,
        API_PERMISSIONS.ACCOUNTS_READ_CBUS
      ],
      {
        clientName: body.clientName,
        description: body.description || 'API Key con acceso limitado a crear tickets y accounts/cbus',
        expiresInDays: 365 // Un año de validez por defecto
      }
    );
  }

  @Post('generate-transaction-key')
  @ApiOperation({ 
    summary: 'Generate a key for accounts/cbus, deposit and withdraw operations',
    description: 'Genera una API Key con permisos limitados específicamente para acceder a accounts/cbus, realizar depósitos y retiros'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'La API Key limitada ha sido creada correctamente',
    type: ApiKeyResponseDto
  })
  @ApiBody({ type: GenerateLimitedKeyDto })
  async generateTransactionKey(@Body() body: GenerateLimitedKeyDto): Promise<ApiKeyResponseDto> {
    return this.apiKeyService.createApiKey(
      body.name,
      [
        API_PERMISSIONS.ACCOUNTS_READ_CBUS,
        API_PERMISSIONS.TRANSACTIONS_DEPOSIT,
        API_PERMISSIONS.TRANSACTIONS_WITHDRAW
      ],
      {
        clientName: body.clientName,
        description: body.description || 'API Key con acceso limitado a accounts/cbus, depósitos y retiros',
        expiresInDays: 365 // Un año de validez por defecto
      }
    );
  }
}