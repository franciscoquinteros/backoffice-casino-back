// src/transactions/transactions.controller.ts
import { Controller, Get, Post, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import { IpnService } from './transactions.service';
import { Transaction } from './transaction.types';
import axios from 'axios';

const processingTransactions = new Set<string>();

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

    // Verificar si la transacción ya está siendo procesada
    if (processingTransactions.has(id)) {
      console.log(`[${opId}] ADVERTENCIA: Transacción ${id} ya está siendo procesada. Evitando duplicación.`);
      throw new HttpException('La transacción ya está siendo procesada', HttpStatus.CONFLICT);
    }

    processingTransactions.add(id);

    // 1. Obtener la transacción original antes de cualquier cambio
    const originalTransaction = await this.ipnService.getTransactionById(id);
    console.log(`[${opId}] Transacción original antes de actualizar, monto:`, originalTransaction?.amount);

    if (!originalTransaction) {
      console.error(`[${opId}] ERROR: Transacción no encontrada: ${id}`);
      throw new HttpException('Transacción no encontrada', HttpStatus.NOT_FOUND);
    }

    // Verificar si la transacción ya fue aceptada previamente
    if (originalTransaction.status === 'Aceptado') {
      console.log(`[${opId}] ADVERTENCIA: La transacción ${id} ya fue aceptada previamente.`);
      return {
        status: 'success',
        message: 'La transacción ya había sido aceptada previamente',
        transaction: originalTransaction
      };
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

  @Post('/withdraw/:id/accept')
  async acceptWithdraw(@Param('id') id: string): Promise<{ status: string; message: string; transaction: Transaction }> {
    const opId = `accept_withdraw_${id}_${Date.now()}`;
    console.log(`[${opId}] INICIO: Procesando aceptación de retiro ID: ${id}`);

    // --- CONTROL DE PROCESAMIENTO DUPLICADO ---
    // Verificar si la transacción ya está siendo procesada (aceptar o rechazar)
    if (processingTransactions.has(id)) {
      console.log(`[${opId}] ADVERTENCIA: Transacción ${id} ya está siendo procesada. Evitando duplicación.`);
      throw new HttpException('La transacción ya está siendo procesada', HttpStatus.CONFLICT);
    }

    // Marcar esta transacción como en procesamiento
    processingTransactions.add(id);
    // --- FIN CONTROL DE PROCESAMIENTO DUPLICADO ---

    try { // Bloque try/finally para asegurar que removemos el ID del Set

      // 1. Obtener la transacción original antes de cualquier cambio
      const originalTransaction = await this.ipnService.getTransactionById(id);
      console.log(`[${opId}] Transacción original antes de actualizar, monto:`, originalTransaction?.amount);

      if (!originalTransaction) {
        console.error(`[${opId}] ERROR: Transacción no encontrada: ${id}`);
        throw new HttpException('Transacción no encontrada', HttpStatus.NOT_FOUND);
      }

      // Verificar si la transacción ya fue aceptada o rechazada previamente
      if (originalTransaction.status === 'Aceptado') {
        console.log(`[${opId}] ADVERTENCIA: El retiro ${id} ya fue aceptado previamente.`);
        return {
          status: 'success',
          message: 'El retiro ya había sido aceptado previamente',
          transaction: originalTransaction
        };
      }
      if (originalTransaction.status === 'Rechazado') {
        console.log(`[${opId}] ADVERTENCIA: El retiro ${id} ya fue rechazado previamente.`);
        // Si intentas aceptar algo ya rechazado, suele ser un conflicto
        throw new HttpException('El retiro ya había sido rechazado previamente', HttpStatus.CONFLICT);
      }
      // Podrías añadir otros estados como 'Error' si quieres evitar aceptarlos también
      if (originalTransaction.status !== 'Pending' && originalTransaction.status !== 'Error' && originalTransaction.status !== 'Processing') {
        console.warn(`[${opId}] La transacción de retiro ${id} tiene estado ${originalTransaction.status}. Procediendo a marcar como Processing.`);
      }


      // 2. Actualizar el estado temporalmente a "Processing"
      const processingTransaction = await this.ipnService.updateTransactionStatus(id, 'Processing');
      console.log(`[${opId}] Transacción de retiro marcada como Processing, monto:`, processingTransaction.amount);

      // 3. Enviar la transacción al proxy de retiros
      try { // Bloque try/catch interno para manejar errores específicos del proxy

        // Mapear los campos necesarios para el proxy de retiro
        // Necesitarás adaptar el payload según lo que tu proxy de retiros espere
        const proxyPayload: any = { // Usamos 'any' o defines una interfaz/tipo para el payload del proxy de retiro
          user_id: parseInt(processingTransaction.idCliente?.toString(), 10),
          amount: processingTransaction.amount,
          transaction_id: processingTransaction.id.toString(), // Usar el ID de la transacción de retiro

        };

        // Añadir campos de destino (CBU o Wallet Address)
        if (processingTransaction.cbu) {
          proxyPayload.destination_type = 'cbu'; // O el tipo que espere tu proxy
          proxyPayload.destination_value = processingTransaction.cbu;
          // Podrías añadir nombreDelTitular, etc. si lo guardaste en la transacción de retiro y el proxy lo necesita
          if (processingTransaction.payer_identification?.type === 'name' && processingTransaction.payer_identification?.number) {
            proxyPayload.account_holder_name = processingTransaction.payer_identification.number;
          }
        } else if (processingTransaction.wallet_address) {
          proxyPayload.destination_type = 'wallet'; // O el tipo que espere tu proxy
          proxyPayload.destination_value = processingTransaction.wallet_address;
        } else {
          // Si no tiene CBU ni wallet address, no podemos procesar el retiro
          await this.ipnService.updateTransactionStatus(id, 'Error');
          await this.ipnService.updateTransactionDescription(id, 'Error datos: Falta CBU o wallet_address para procesar retiro.');
          throw new HttpException('Faltan datos de destino (CBU o wallet_address) para procesar el retiro.', HttpStatus.BAD_REQUEST);
        }


        console.log(`[${opId}] Enviando al proxy RETIRO, payload:`, JSON.stringify(proxyPayload));

        // Comprobar que los datos mínimos necesarios existen en el payload (user_id, amount, transaction_id, y algún destino)
        if (isNaN(proxyPayload.user_id) || !proxyPayload.amount || !proxyPayload.transaction_id || (!proxyPayload.destination_value)) {
          // Marcar como error de datos (ANTES de llamar al proxy)
          await this.ipnService.updateTransactionStatus(id, 'Error');
          await this.ipnService.updateTransactionDescription(id, 'Error datos: Datos de retiro incompletos para el procesamiento externo.');
          throw new HttpException('Datos de retiro incompletos para el procesamiento externo', HttpStatus.BAD_REQUEST);
        }


        // Llamar al proxy de retiros
        const proxyResponse = await axios.post('http://18.216.231.42:8080/withdraw', proxyPayload); // <<< URL del proxy de retiros
        console.log(`[${opId}] Respuesta del proxy RETIRO:`, JSON.stringify(proxyResponse.data));

        // VALIDACIÓN MEJORADA: Verificar respuesta del proxy (asumimos status:0 para éxito)
        if (proxyResponse.data && proxyResponse.data.status === 0) { // Asegurar que proxyResponse.data existe
          console.log(`[${opId}] FIN: Retiro ${id} aceptado y enviado correctamente al proxy RETIRO`);

          // Actualizar a estado final de aceptado
          const updatedTransaction = await this.ipnService.updateTransactionStatus(id, 'Aceptado');

          // Opcional: guardar información adicional si el proxy la devuelve (ej: ID de la operación en el proxy)
          if (proxyResponse.data.result && proxyResponse.data.result.proxy_operation_id) {
            await this.ipnService.updateTransactionInfo(id, {
              // Define un campo en tu TransactionEntity para guardar este ID si es útil
              externalReference: proxyResponse.data.result.proxy_operation_id // O usar otro campo adecuado
            });
          }
          // El balance externo no suele cambiar al retirar, pero si el proxy lo devuelve, podrías guardarlo

          return {
            status: 'success',
            message: 'Retiro aceptado y procesado correctamente',
            transaction: updatedTransaction
          };
        } else {
          console.error(`[${opId}] ERROR: Respuesta de error del proxy RETIRO:`, JSON.stringify(proxyResponse.data));

          // Obtener el mensaje de error correcto
          const errorMsg = proxyResponse.data?.error_message || proxyResponse.data?.message || 'Error desconocido del proxy';
          console.error(`[${opId}] Mensaje de error: ${errorMsg}`);

          // Marcarlo como error en nuestro sistema
          await this.ipnService.updateTransactionStatus(id, 'Error');
          await this.ipnService.updateTransactionDescription(id, `Error procesamiento proxy: ${errorMsg}`);

          throw new HttpException(`Error en el procesamiento externo del retiro: ${errorMsg}`, HttpStatus.INTERNAL_SERVER_ERROR);
        }
      } catch (error) {
        // Si ocurre un error de comunicación con el proxy (timeout, red, etc.)
        console.error(`[${opId}] ERROR: Error al comunicar con el proxy RETIRO:`, error);

        // Marcarlo como error en nuestro sistema
        await this.ipnService.updateTransactionStatus(id, 'Error');
        // Intenta obtener un mensaje de error útil para la descripción
        const communicationErrorMsg = error.response?.data?.message || error.message || 'Error de comunicación con el proxy';
        await this.ipnService.updateTransactionDescription(id, `Error comunicación proxy: ${communicationErrorMsg}`);


        if (error.response) {
          console.error(`[${opId}] Detalles de error de respuesta HTTP:`, error.response.status, error.response.data);
        } else if (error.request) {
          console.error(`[${opId}] No se recibió respuesta del proxy.`);
        } else {
          console.error(`[${opId}] Error configurando la solicitud.`);
        }


        // Usar el mensaje de error más específico disponible para la respuesta HTTP
        const errorMessage = error.response?.data?.message ||
          error.message ||
          'Error interno al procesar el retiro';

        throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    } finally {
      // --- CONTROL DE PROCESAMIENTO DUPLICADO ---
      // Asegurarse de remover el ID del Set al finalizar el procesamiento (éxito o error)
      processingTransactions.delete(id);
      console.log(`[${opId}] FINALLY: Removido ID ${id} de processingTransactions.`);
      // --- FIN CONTROL DE PROCESAMIENTO DUPLICADO ---
    }
  }
}