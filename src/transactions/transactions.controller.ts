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
    // 1. Actualizar el estado en tu BD
    const updatedTransaction = await this.ipnService.updateTransactionStatus(id, 'Aceptado');
    console.log(`[${opId}] Transacción actualizada en BD:`, JSON.stringify(updatedTransaction));

    if (!updatedTransaction) {
      throw new HttpException('Transacción no encontrada', HttpStatus.NOT_FOUND);
    }

    // 2. Enviar la transacción al proxy
    try {
      // Mapear los campos necesarios
      const proxyPayload = {
        user_id: parseInt(updatedTransaction.idCliente?.toString(), 10), // Convertir a entero
        amount: updatedTransaction.amount,
        transaction_id: updatedTransaction.id.toString()
      };

      console.log(`[${opId}] Enviando al proxy, payload:`, JSON.stringify(proxyPayload));

      // Comprobar que los datos necesarios existen
      if (!proxyPayload.user_id || !proxyPayload.amount || !proxyPayload.transaction_id) {
        throw new HttpException('Datos de transacción incompletos para el proxy', HttpStatus.BAD_REQUEST);
      }

      // Llamar al proxy
      const proxyResponse = await axios.post('http://18.216.231.42:8080/deposit', proxyPayload);
      console.log(`[${opId}] Respuesta del proxy:`, JSON.stringify(proxyResponse.data))
      // Verificar respuesta
      if (proxyResponse.data.status === 0 || proxyResponse.data.status === "0") {
        console.log(`[${opId}] FIN: Transacción aceptada y enviada correctamente al proxy`);
        // Opcional: actualizar la transacción con datos de la respuesta externa
        return {
          status: 'success',
          message: 'Transacción aceptada y procesada correctamente',
          transaction: updatedTransaction
        };
      } else {
        console.error(`[${opId}] ERROR: Error en respuesta del proxy:`, proxyResponse.data);
        // Si el proxy devuelve error, revertir o marcar como problema
        await this.ipnService.updateTransactionStatus(id, 'Error');
        throw new HttpException(`Error en el procesamiento externo: ${proxyResponse.data.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    } catch (error) {
      console.error(`[${opId}] ERROR: Error al comunicar con el proxy:`, error);
      console.error(`[${opId}] Detalles de error:`, error.response?.data || error.message);
      // Manejar error de comunicación con el proxy
      throw new HttpException('Error en la comunicación con el servicio de pagos', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Nuevos endpoints para rechazar transacciones
  @Post('/deposit/:id/reject')
  async rejectDeposit(@Param('id') id: string): Promise<{ status: string; message: string; transaction: Transaction }> {
    const updatedTransaction = await this.ipnService.updateTransactionStatus(id, 'Rechazado');

    if (!updatedTransaction) {
      throw new HttpException('Transacción no encontrada', HttpStatus.NOT_FOUND);
    }

    return {
      status: 'success',
      message: 'Transacción rechazada correctamente',
      transaction: updatedTransaction
    };
  }

  @Post('/withdraw/:id/reject')
  async rejectWithdraw(@Param('id') id: string): Promise<{ status: string; message: string; transaction: Transaction }> {
    const updatedTransaction = await this.ipnService.updateTransactionStatus(id, 'Rechazado');

    if (!updatedTransaction) {
      throw new HttpException('Transacción no encontrada', HttpStatus.NOT_FOUND);
    }

    return {
      status: 'success',
      message: 'Retiro rechazado correctamente',
      transaction: updatedTransaction
    };
  }
}