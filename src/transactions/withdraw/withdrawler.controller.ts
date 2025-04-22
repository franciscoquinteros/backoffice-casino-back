import { Controller, Post, Body, HttpException, HttpStatus, UseFilters } from '@nestjs/common';
import { Transaction } from '../transaction.types';
import { IpnService } from '../transactions.service';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { WithdrawData } from './russianswithdraw.types';
import { CustomHttpExceptionFilter } from 'src/common/filters/http-exception.filter';

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
  amount: number;
  cbu: string;
  idClient: string;
  idTransaction: string;
  nombreDelTitular: string;
  
  // Make the following fields optional as they aren't in your example request
  email?: string;
  name?: string;
  phoneNumber?: string;
}

@ApiTags('Withdraws')
@Controller()
@UseFilters(new CustomHttpExceptionFilter())
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

      // Updated validation to match the required fields in the example request
      if (!body.amount || !body.cbu || !body.idClient || !body.idTransaction || !body.nombreDelTitular) {
        throw new HttpException(
          'Se requieren los campos amount, cbu, idClient, idTransaction y nombreDelTitular',
          HttpStatus.BAD_REQUEST
        );
      }

      // Create the WithdrawData object from the received data
      const withdrawData: WithdrawData = {
        amount: body.amount,
        wallet_address: body.cbu, // Using CBU as wallet address
        withdraw_method: 'bank_transfer', // Default method
        dateCreated: new Date().toISOString(),
        idCliente: body.idClient,
        nombreDelTitular: body.nombreDelTitular // Add the account holder name
      };

      // Add optional fields if they exist
      if (body.email) {
        withdrawData['email'] = body.email;
      }
      
      if (body.name) {
        withdrawData['name'] = body.name;
      }
      
      if (body.phoneNumber) {
        withdrawData['phoneNumber'] = body.phoneNumber;
      }

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
        if (body.phoneNumber) transaction.phoneNumber = body.phoneNumber;
        
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