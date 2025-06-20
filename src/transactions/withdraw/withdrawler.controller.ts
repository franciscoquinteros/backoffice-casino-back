import { Controller, Post, Body, HttpException, HttpStatus, UseFilters } from '@nestjs/common';
import { Transaction } from '../transaction.types';
import { IpnService } from '../transactions.service';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiProperty } from '@nestjs/swagger';
import { WithdrawData } from './russianswithdraw.types';
import { CustomHttpExceptionFilter } from 'src/common/filters/http-exception.filter';
import { IsString, IsNumber, IsEmail, IsOptional, IsNotEmpty, Min } from 'class-validator';

interface WithdrawResponseTransaction {
  idClient: string;
  idTransaction: string;
  type: 'withdraw';
  amount: number;
  status?: string;
  date_created?: string;
  description?: string;
  // Optional fields that may or may not be included
  email?: string;
  name?: string;
  phoneNumber?: string;
  nombreDelTitular?: string;
}

interface WithdrawResult {
  status: string;
  message: string;
  transaction?: WithdrawResponseTransaction;
}

// Updated DTO to match the expected request payload
class ExternalWithdrawDto {
  @ApiProperty({
    description: 'Monto del retiro',
    example: 50.00,
    minimum: 0.01
  })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({
    description: 'CBU de la cuenta destino',
    example: '1234567890123456789012'
  })
  @IsString()
  @IsNotEmpty()
  cbu: string;

  @ApiProperty({
    description: 'Número de WhatsApp',
    example: '1156278436'
  })
  @IsString()
  @IsNotEmpty()
  NumeroDeWhatsapp: string; // Campo requerido

  @ApiProperty({
    description: 'ID del cliente',
    example: '12345'
  })
  @IsString()
  @IsNotEmpty()
  idClient: string;

  @ApiProperty({
    description: 'Username del player',
    example: 'juanperez123'
  })
  @IsString()
  @IsNotEmpty()
  username: string; // Campo requerido - username del player

  @ApiProperty({
    description: 'ID del agente/oficina',
    example: 'office_1'
  })
  @IsString()
  @IsNotEmpty()
  idAgent: string; // Ahora es requerido

  @ApiProperty({
    description: 'ID único del retiro',
    example: 'withdraw_123'
  })
  @IsString()
  @IsNotEmpty()
  idTransaction: string;

  @ApiProperty({
    description: 'Nombre del titular de la cuenta',
    example: 'Juan Pérez'
  })
  @IsString()
  @IsNotEmpty()
  nombreDelTitular: string;

  // Campos opcionales que teníamos antes pero no están en la nueva request
  @ApiProperty({
    description: 'Email del usuario',
    example: 'user@example.com',
    required: false
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'Nombre del usuario',
    example: 'Juan',
    required: false
  })
  @IsOptional()
  @IsString()
  name?: string;
}

@ApiTags('Withdraws')
@Controller()
@UseFilters(new CustomHttpExceptionFilter())
export class ExternalWithdrawController {
  constructor(private readonly ipnService: IpnService) { }

  @Post('withdraw')
  @ApiOperation({ summary: 'Registrar un nuevo retiro desde sistema externo' })
  @ApiBody({ type: ExternalWithdrawDto })
  @ApiResponse({ status: 200, description: 'Retiro registrado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async handleExternalWithdraw(@Body() body: ExternalWithdrawDto): Promise<WithdrawResult> {
    try {
      console.log('Recibida solicitud de retiro externo:', body);

      // Updated validation to match the required fields in the example request
      if (!body.amount || !body.cbu || !body.idClient || !body.idTransaction || !body.nombreDelTitular || !body.username || !body.NumeroDeWhatsapp || !body.idAgent) {
        throw new HttpException(
          'Se requieren los campos amount, cbu, idClient, idTransaction, nombreDelTitular, username, NumeroDeWhatsapp y idAgent',
          HttpStatus.BAD_REQUEST
        );
      }

      // Mapping to the structure expected by validateWithdraw
      const withdrawData: WithdrawData = {
        idTransaction: body.idTransaction,
        withdraw_method: 'bank_transfer', // Default withdrawal method
        idCliente: body.idClient,
        amount: body.amount,
        wallet_address: body.cbu, // Use CBU as wallet address for bank transfers
        dateCreated: new Date().toISOString(),
        email: body.email || '', // Email is now optional
        name: body.name || '', // Name is now optional
        nombreDelTitular: body.nombreDelTitular,
        phoneNumber: body.NumeroDeWhatsapp, // Map from NumeroDeWhatsapp to phoneNumber
        username: body.username, // Map the required username field
        idAgent: body.idAgent // Map the required idAgent field
      };

      console.log('Datos enviados a validateWithdraw:', withdrawData);

      // Call the service to process the withdrawal
      const result = await this.ipnService.validateWithdraw(withdrawData);

      console.log('Resultado de validateWithdraw:', result);

      // Create and return a WithdrawResponseTransaction if not present in result
      if (!result.transaction) {
        const transaction: WithdrawResponseTransaction = {
          idClient: body.idClient,
          idTransaction: body.idTransaction,
          type: 'withdraw',
          amount: body.amount,
          status: 'Pending',
          date_created: new Date().toISOString(),
          description: 'Retiro procesado desde sistema externo',
          nombreDelTitular: body.nombreDelTitular
        };

        // Add optional fields if they exist
        if (body.email) transaction.email = body.email;
        if (body.name) transaction.name = body.name;
        if (body.NumeroDeWhatsapp) transaction.phoneNumber = body.NumeroDeWhatsapp;

        return {
          status: 'success',
          message: '',
          transaction: transaction
        };
      }

      return {
        status: 'success',
        message: '' // Empty message as requested
      };
    } catch (error) {
      console.error('Error al procesar retiro externo:', error);
      throw new HttpException(
        error.message || 'Error al procesar el retiro',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}