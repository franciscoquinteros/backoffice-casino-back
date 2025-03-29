import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { Transaction } from '../transaction.types';
import { IpnService } from '../transactions.service';
import { RussiansDepositData } from './russians-deposit.types';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';

interface DepositResult {
  status: string;
  message: string;
  transaction?: Transaction;
}

// Definir el DTO para el cuerpo de la solicitud
class ExternalDepositDto {
  amount: number;
  email: string;
  idClient: string;
}

@ApiTags('Deposits')
@Controller()
export class ExternalDepositController {
  constructor(private readonly ipnService: IpnService) {}

  @Post('deposit')
  @ApiOperation({ summary: 'Registrar un nuevo depósito desde sistema externo' })
  @ApiBody({ type: ExternalDepositDto })
  @ApiResponse({ status: 200, description: 'Depósito registrado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async handleExternalDeposit(@Body() body: ExternalDepositDto): Promise<DepositResult> {
    try {
      console.log('Recibida solicitud de depósito externo:', body);

      if (!body.amount || !body.email || !body.idClient) {
        throw new HttpException(
          'Se requieren los campos amount, email e idClient',
          HttpStatus.BAD_REQUEST
        );
      }

      // Crear el objeto RussiansDepositData a partir de los datos recibidos
      const depositData: RussiansDepositData = {
        cbu: 'DEFAULT_CBU', // Valor predeterminado o configurable
        amount: body.amount,
        idTransferencia: `deposit_${Date.now()}`,
        dateCreated: new Date().toISOString(),
        idCliente: body.idClient
      };

      // Llamar al servicio para procesar el depósito
      const result = await this.ipnService.validateWithMercadoPago(depositData);

      // Crear y enviar la respuesta en el formato requerido
      const response: DepositResult = {
        status: result.status,
        message: result.status === 'success' ? 'true' : result.message,
        transaction: {
          ...result.transaction,
          idCliente: body.idClient, // Usar idCliente en lugar de idClient
          payer_email: body.email, // Usar payer_email para ser consistente con el modelo Transaction
          description: result.transaction.description || 'Pending deposit'
        }
      };

      return response;
    } catch (error) {
      console.error('Error al procesar depósito externo:', error);
      throw new HttpException(
        error.message || 'Error al procesar el depósito',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}