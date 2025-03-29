import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { Transaction } from '../transaction.types';
import { IpnService } from '../transactions.service';
import { RussiansDepositData } from './russians-deposit.types';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';

interface DepositResponseTransaction {
  idClient: string;
  type: 'deposit' | 'withdraw';
  amount: number;
  email: string;
  status?: string;
  date_created?: string;
  description?: string;
}

interface DepositResult {
  status: string;
  message: string;
  transaction?: DepositResponseTransaction;
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
      console.log('Email recibido:', body.email);

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
        idCliente: body.idClient,
        email: body.email // Asegúrate de pasar el email aquí
      };

      console.log('Datos enviados a validateWithMercadoPago, email:', depositData.email);

      // Llamar al servicio para procesar el depósito
      const result = await this.ipnService.validateWithMercadoPago(depositData);
      
      console.log('Resultado de validateWithMercadoPago:', result);
      console.log('Email en resultado:', result.transaction.payer_email);
      
      // Si el email no se guardó en la transacción, actualizarlo manualmente
      if (!result.transaction.payer_email) {
        console.log('Email no encontrado en la transacción, actualizando manualmente...');
        
        // Crear una nueva transacción con el email
        const updatedTransaction: Transaction = {
          ...result.transaction,
          payer_email: body.email
        };
        
        // Guardar la transacción actualizada
        await this.ipnService.updateTransactionEmail(
          result.transaction.id.toString(), 
          body.email
        );
      }

      // Crear y enviar la respuesta en el formato requerido
      const response: DepositResult = {
        status: result.status,
        message: result.status === 'success' ? 'true' : result.message,
        transaction: {
          idClient: body.idClient,
          type: 'deposit',
          amount: typeof result.transaction.amount === 'number' 
            ? result.transaction.amount 
            : parseFloat(String(result.transaction.amount)),
          email: body.email,
          status: result.transaction.status,
          date_created: result.transaction.date_created,
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