import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { Transaction } from '../transaction.types';
import { IpnService } from '../transactions.service';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { WithdrawData } from './russianswithdraw.types';

interface WithdrawResponseTransaction {
  idClient: string;
  type: 'withdraw';
  amount: number;
  status?: string;
  date_created?: string;
  description?: string;
}

interface WithdrawResult {
  status: string;
  message: string;
  transaction?: WithdrawResponseTransaction;
}

// Definir el DTO para el cuerpo de la solicitud
class ExternalWithdrawDto {
  amount: number;
  cbu: string;
  idClient: string;
}

@ApiTags('Withdraws')
@Controller()
export class ExternalWithdrawController {
  constructor(private readonly ipnService: IpnService) {}

  @Post('withdraw')
  @ApiOperation({ summary: 'Registrar un nuevo retiro desde sistema externo' })
  @ApiBody({ type: ExternalWithdrawDto })
  @ApiResponse({ status: 200, description: 'Retiro registrado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async handleExternalWithdraw(@Body() body: ExternalWithdrawDto): Promise<WithdrawResult> {
    try {
      console.log('Recibida solicitud de retiro externo:', body);

      if (!body.amount || !body.cbu || !body.idClient) {
        throw new HttpException(
          'Se requieren los campos amount, cbu e idClient',
          HttpStatus.BAD_REQUEST
        );
      }

      // Crear el objeto WithdrawData a partir de los datos recibidos
      const withdrawData: WithdrawData = {
        amount: body.amount,
        wallet_address: body.cbu, // Usamos el CBU como dirección de la wallet
        withdraw_method: 'bank_transfer', // Método por defecto
        dateCreated: new Date().toISOString(),
        idCliente: body.idClient // Incluimos el ID del cliente
      };

      console.log('Datos enviados a validateWithdraw:', withdrawData);

      // Llamar al servicio para procesar el retiro
      const result = await this.ipnService.validateWithdraw(withdrawData);
      
      console.log('Resultado de validateWithdraw:', result);
      
      // Crear y enviar la respuesta en el formato requerido
      const response: WithdrawResult = {
        status: result.status,
        message: result.status === 'success' ? 'Withdrawal registered, pending validation' : result.message,
        transaction: {
          idClient: body.idClient,
          type: 'withdraw',
          amount: typeof result.transaction.amount === 'number' 
            ? result.transaction.amount 
            : parseFloat(String(result.transaction.amount)),
          status: result.transaction.status,
          date_created: result.transaction.date_created,
          description: 'Withdrawal'
        }
      };

      return response;
    } catch (error) {
      console.error('Error al procesar retiro externo:', error);
      throw new HttpException(
        error.message || 'Error al procesar el retiro',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}