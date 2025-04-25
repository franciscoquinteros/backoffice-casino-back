// src/transactions/transactions.controller.ts
import { Controller, Get, Post, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import { IpnService } from './transactions.service';
import { Transaction } from './transaction.types';
import axios from 'axios';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly ipnService: IpnService) { }

  @Get()
  async getTransactions(): Promise<Transaction[]> {
    const transactions = await this.ipnService.getTransactions();
    console.log('Transacciones devueltas por el controlador:', transactions.length);
    return transactions;
  }

  @Post('/deposit/:id/accept')
  async acceptDeposit(@Param('id') id: string): Promise<{ status: string; message: string; transaction: Transaction }> {
    const opId = `accept_${id}_${Date.now()}`;
    console.log(`[${opId}] INICIO: Procesando aceptación de depósito ID: ${id}`);
    
    // 1. Obtener la transacción original antes de cualquier cambio
    const originalTransaction = await this.ipnService.getTransactionById(id);
    console.log(`[${opId}] Transacción original antes de actualizar, monto:`, originalTransaction?.amount);
  
    if (!originalTransaction) {
      console.error(`[${opId}] ERROR: Transacción no encontrada: ${id}`);
      throw new HttpException('Transacción no encontrada', HttpStatus.NOT_FOUND);
    }
    
    // 2. Actualizar el estado temporalmente a "Processing"
    const processingTransaction = await this.ipnService.updateTransactionStatus(id, 'Processing');
    console.log(`[${opId}] Transacción marcada como Processing, monto:`, processingTransaction.amount);

    // 3. Enviar la transacción al proxy
    try {
      // Mapear los campos necesarios
      const proxyPayload = {
        user_id: parseInt(processingTransaction.idCliente?.toString(), 10),
        amount: processingTransaction.amount,
        transaction_id: processingTransaction.id.toString()
      };

      console.log(`[${opId}] Enviando al proxy, payload:`, JSON.stringify(proxyPayload));

      // Comprobar que los datos necesarios existen
      if (!proxyPayload.user_id || !proxyPayload.amount || !proxyPayload.transaction_id) {
        // Revertir a pendiente en caso de error
        await this.ipnService.updateTransactionStatus(id, 'Pending');
        throw new HttpException('Datos de transacción incompletos para el proxy', HttpStatus.BAD_REQUEST);
      }

      // Llamar al proxy
      const proxyResponse = await axios.post('http://18.216.231.42:8080/deposit', proxyPayload);
      console.log(`[${opId}] Respuesta del proxy:`, JSON.stringify(proxyResponse.data));
      
      // VALIDACIÓN MEJORADA: Verificar respuesta del proxy
      // CocosBet usa status:0 para éxito
      if (proxyResponse.data.status === 0) {
        console.log(`[${opId}] FIN: Transacción aceptada y enviada correctamente al proxy`);
        
        // Actualizar a estado final de aceptado
        const updatedTransaction = await this.ipnService.updateTransactionStatus(id, 'Aceptado');
        
        // Opcional: guardar el nuevo balance si está disponible
        if (proxyResponse.data.result && proxyResponse.data.result.new_balance) {
          await this.ipnService.updateTransactionInfo(id, {
            externalBalance: proxyResponse.data.result.new_balance
          });
        }
        
        return {
          status: 'success',
          message: 'Transacción aceptada y procesada correctamente',
          transaction: updatedTransaction
        };
      } else {
        console.error(`[${opId}] ERROR: Error en respuesta del proxy:`, JSON.stringify(proxyResponse.data));
        
        // Obtener el mensaje de error correcto
        const errorMsg = proxyResponse.data.error_message || 'Error desconocido';
        console.error(`[${opId}] Mensaje de error: ${errorMsg}`);
        
        // IMPORTANTE: Revertir el estado a pendiente o marcarlo como error
        await this.ipnService.updateTransactionStatus(id, 'Error');
        await this.ipnService.updateTransactionDescription(id, `Error: ${errorMsg}`);
        
        throw new HttpException(`Error en el procesamiento externo: ${errorMsg}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    } catch (error) {
      // Si ocurre un error de comunicación, revertir a pendiente
      await this.ipnService.updateTransactionStatus(id, 'Pending');
      
      console.error(`[${opId}] ERROR: Error al comunicar con el proxy:`, error);
      if (error.response) {
        console.error(`[${opId}] Detalles de error:`, error.response.data || error.message);
      }
      
      // Usar el mensaje de error específico si está disponible
      const errorMessage = error.response?.data?.error_message || 
                         error.response?.data?.message || 
                         error.message || 
                         'Error en la comunicación con el servicio de pagos';
      
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Nuevos endpoints para rechazar transacciones
  @Post('/deposit/:id/reject')
  async rejectDeposit(@Param('id') id: string): Promise<{ status: string; message: string; transaction: Transaction }> {
    const opId = `reject_${id}_${Date.now()}`;
    console.log(`[${opId}] INICIO: Rechazando depósito ID: ${id}`);
    
    const updatedTransaction = await this.ipnService.updateTransactionStatus(id, 'Rechazado');

    if (!updatedTransaction) {
      console.error(`[${opId}] ERROR: Transacción no encontrada: ${id}`);
      throw new HttpException('Transacción no encontrada', HttpStatus.NOT_FOUND);
    }

    console.log(`[${opId}] FIN: Depósito rechazado correctamente`);
    return {
      status: 'success',
      message: 'Transacción rechazada correctamente',
      transaction: updatedTransaction
    };
  }

  @Post('/withdraw/:id/reject')
  async rejectWithdraw(@Param('id') id: string): Promise<{ status: string; message: string; transaction: Transaction }> {
    const opId = `reject_withdraw_${id}_${Date.now()}`;
    console.log(`[${opId}] INICIO: Rechazando retiro ID: ${id}`);
    
    const updatedTransaction = await this.ipnService.updateTransactionStatus(id, 'Rechazado');

    if (!updatedTransaction) {
      console.error(`[${opId}] ERROR: Transacción no encontrada: ${id}`);
      throw new HttpException('Transacción no encontrada', HttpStatus.NOT_FOUND);
    }

    console.log(`[${opId}] FIN: Retiro rechazado correctamente`);
    return {
      status: 'success',
      message: 'Retiro rechazado correctamente',
      transaction: updatedTransaction
    };
  }
}