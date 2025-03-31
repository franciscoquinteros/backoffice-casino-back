import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { Transaction } from '../transaction.types';
import { IpnService } from '../transactions.service';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { WithdrawData } from './russianswithdraw.types';

interface WithdrawResponseTransaction {
  idClient: string;
  idTransaction: string;
  email: string;
  name: string;
  phoneNumber: string;
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

// Definir el DTO para el cuerpo de la solicitud con todos los campos requeridos
class ExternalWithdrawDto {
  amount: number;
  cbu: string;
  idClient: string;
  idTransaction: string;
  email: string;
  name: string;
  phoneNumber: string;
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

      if (!body.amount || !body.cbu || !body.idClient || !body.idTransaction || !body.email || !body.name || !body.phoneNumber) {
        throw new HttpException(
          'Se requieren todos los campos obligatorios',
          HttpStatus.BAD_REQUEST
        );
      }

      // Crear el objeto WithdrawData a partir de los datos recibidos
      const withdrawData: WithdrawData = {
        amount: body.amount,
        wallet_address: body.cbu, // Usamos el CBU como dirección de la wallet
        withdraw_method: 'bank_transfer', // Método por defecto
        dateCreated: new Date().toISOString(),
        idCliente: body.idClient, // Incluimos el ID del cliente
        // Podemos añadir campos adicionales si es necesario en la interfaz WithdrawData
      };

      console.log('Datos enviados a validateWithdraw:', withdrawData);

      // Llamar al servicio para procesar el retiro
      const result = await this.ipnService.validateWithdraw(withdrawData);
      
      console.log('Resultado de validateWithdraw:', result);
      
      // Crear y enviar la respuesta en el formato requerido
      const response: WithdrawResult = {
        status: 'success',
        message: 'Withdrawal registered, pending validation',
        transaction: {
          idClient: body.idClient,
          idTransaction: body.idTransaction,
          email: body.email,
          name: body.name,
          phoneNumber: body.phoneNumber,
          type: 'withdraw',
          amount: typeof result.transaction.amount === 'number' 
            ? result.transaction.amount 
            : parseFloat(String(result.transaction.amount)),
          status: 'Pending',
          date_created: new Date().toISOString(),
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