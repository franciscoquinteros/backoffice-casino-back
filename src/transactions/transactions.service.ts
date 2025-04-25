import { forwardRef, Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { IpnNotification, DepositData, Transaction, PaymentData } from './transaction.types';
import { RussiansDepositData } from './deposit/russians-deposit.types';
import { AccountService } from '../account/account.service';
import { Account } from '../account/entities/account.entity';
import { WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { TransactionEntity } from './entities/transaction.entity';
import { WithdrawData } from './withdraw/russianswithdraw.types';

export { Transaction } from './transaction.types';

@Injectable()
export class IpnService implements OnModuleInit {
  @WebSocketServer()
  server: Server;
  private accounts: Account[] = [];
  private transactions: Transaction[] = [];

  constructor(
    @Inject(forwardRef(() => AccountService)) // Usar forwardRef para inyectar AccountService
    private accountService: AccountService,
    @InjectRepository(TransactionEntity)
    private transactionRepository: Repository<TransactionEntity>
  ) { }


  // En IpnService (transactions.service.ts)
  async updateTransactionDescription(id: string, description: string): Promise<Transaction | null> {
    try {
      await this.transactionRepository.update(id, { description });

      // Actualizar en memoria
      this.transactions = this.transactions.map(t => {
        if (t.id.toString() === id) {
          return { ...t, description };
        }
        return t;
      });

      const updatedEntity = await this.transactionRepository.findOne({ where: { id } });
      return updatedEntity ? this.mapEntityToTransaction(updatedEntity) : null;
    } catch (error) {
      console.error(`Error al actualizar descripción de transacción ${id}:`, error);
      return null;
    }
  }

  async updateTransactionInfo(id: string, info: any): Promise<Transaction | null> {
    try {
      await this.transactionRepository.update(id, info);

      // Actualizar en memoria
      this.transactions = this.transactions.map(t => {
        if (t.id.toString() === id) {
          return { ...t, ...info };
        }
        return t;
      });

      const updatedEntity = await this.transactionRepository.findOne({ where: { id } });
      return updatedEntity ? this.mapEntityToTransaction(updatedEntity) : null;
    } catch (error) {
      console.error(`Error al actualizar información adicional de transacción ${id}:`, error);
      return null;
    }
  }

  async getTransactionById(id: string): Promise<Transaction | null> {
    try {
      const entity = await this.transactionRepository.findOne({ where: { id } });
      return entity ? this.mapEntityToTransaction(entity) : null;
    } catch (error) {
      console.error(`Error al obtener transacción ${id}:`, error);
      return null;
    }
  }
  // Agregar este método a la clase IpnService

  async updateTransactionEmail(id: string, email: string): Promise<void> {
    try {
      console.log(`Actualizando email de transacción ${id} a: ${email}`);

      // Actualizar en la BD
      await this.transactionRepository.update(id, {
        payerEmail: email
      });

      // Actualizar en memoria
      this.transactions = this.transactions.map(t => {
        if (t.id.toString() === id) {
          return { ...t, payer_email: email };
        }
        return t;
      });

      console.log(`Email de transacción ${id} actualizado correctamente`);
    } catch (error) {
      console.error(`Error al actualizar email de transacción ${id}:`, error);
    }
  }

  // Inicializar el servicio cargando todas las cuentas activas y transacciones
  async onModuleInit() {
    try {
      // Cargar todas las cuentas al iniciar el servicio
      this.accounts = await this.accountService.findAll();
      console.log(`Servicio IPN inicializado con ${this.accounts.length} cuentas configuradas`);

      // Cargar transacciones existentes desde la BD
      try {
        const dbTransactions = await this.transactionRepository.find({
          order: { dateCreated: 'DESC' }
        });

        this.transactions = dbTransactions.map(entity => this.mapEntityToTransaction(entity));
        console.log(`Cargadas ${this.transactions.length} transacciones desde la base de datos`);
      } catch (error) {
        console.error('Error al cargar transacciones desde la base de datos:', error);
        this.transactions = [];
      }
    } catch (error) {
      console.error('Error al inicializar el servicio IPN:', error);
    }
  }

  // Mapear entidad a tipo Transaction
  private mapEntityToTransaction(entity: TransactionEntity): Transaction {
    return {
      id: entity.id,
      type: entity.type,
      amount: typeof entity.amount === 'number'
        ? entity.amount
        : parseFloat(String(entity.amount)),
      status: entity.status,
      date_created: entity.dateCreated?.toISOString(),
      description: entity.description,
      payment_method_id: entity.paymentMethodId,
      payer_id: entity.payerId,
      payer_email: entity.payerEmail,
      payer_identification: entity.payerIdentification,
      external_reference: entity.externalReference,
      cbu: entity.cbu,
      wallet_address: entity.walletAddress,
      receiver_id: entity.receiverId,
      idCliente: entity.idCliente,
      reference_transaction: entity.referenceTransaction
    };
  }

  // Mapear Transaction a entidad
  private mapTransactionToEntity(transaction: Transaction): TransactionEntity {
    const entity = new TransactionEntity();
    entity.id = transaction.id.toString();
    entity.type = transaction.type;
    entity.amount = transaction.amount;
    entity.status = transaction.status;
    entity.description = transaction.description;
    entity.dateCreated = transaction.date_created ? new Date(transaction.date_created) : null;
    entity.paymentMethodId = transaction.payment_method_id;
    entity.payerId = transaction.payer_id ? transaction.payer_id.toString() : null;
    entity.payerEmail = transaction.payer_email;
    entity.payerIdentification = transaction.payer_identification;
    entity.externalReference = transaction.external_reference;
    entity.cbu = transaction.cbu;
    entity.walletAddress = transaction.wallet_address;
    entity.receiverId = transaction.receiver_id;
    entity.idCliente = transaction.idCliente?.toString() || null;
    entity.referenceTransaction = transaction.reference_transaction;
    return entity;
  }

  // Método para guardar transacción en la base de datos
  // En IpnService (transactions.service.ts)
  async saveTransaction(transaction: Transaction): Promise<Transaction> {
    try {
      const entity = this.mapTransactionToEntity(transaction);
      const savedEntity = await this.transactionRepository.save(entity);
      console.log(`Transacción guardada en BD: ${savedEntity.id}`);

      // Actualizar también en memoria si es necesario
      const existingIndex = this.transactions.findIndex(t => t.id === transaction.id);
      if (existingIndex >= 0) {
        this.transactions[existingIndex] = this.mapEntityToTransaction(savedEntity);
      } else {
        this.transactions.push(this.mapEntityToTransaction(savedEntity));
      }

      return this.mapEntityToTransaction(savedEntity);
    } catch (error) {
      console.error('Error al guardar transacción en BD:', error);
      return transaction;
    }
  }

  // Método para agregar o actualizar una cuenta en el servicio
  async configureAccount(account: Account) {
    // Verificar si la cuenta ya existe en nuestra lista
    const existingIndex = this.accounts.findIndex(acc => acc.id === account.id);

    if (existingIndex >= 0) {
      // Actualizar la cuenta existente
      this.accounts[existingIndex] = account;
      console.log(`Cuenta actualizada en el servicio IPN: ${account.name} (ID: ${account.id})`);
    } else {
      // Agregar la nueva cuenta
      this.accounts.push(account);
      console.log(`Nueva cuenta configurada en el servicio IPN: ${account.name} (ID: ${account.id})`);
    }
  }

  // Obtener el token de acceso para una cuenta específica por CBU
  private getAccessTokenByCbu(cbu: string): string | null {
    const account = this.accounts.find(acc =>
      acc.cbu === cbu &&
      acc.wallet === 'mercadopago' &&
      acc.status === 'active' &&
      acc.mp_access_token
    );

    if (account?.mp_access_token) {
      console.log(`Usando token de acceso para cuenta: ${account.name} (CBU: ${cbu})`);
      return account.mp_access_token;
    }

    console.warn(`No se encontró token de acceso para CBU: ${cbu}`);
    return null;
  }

  // Obtener todos los tokens de acceso disponibles
  private getAllAccessTokens(): string[] {
    const tokens = this.accounts
      .filter(acc => acc.wallet === 'mercadopago' && acc.status === 'active' && acc.mp_access_token)
      .map(acc => acc.mp_access_token);

    // Eliminar posibles duplicados
    return [...new Set(tokens)];
  }

  async handleNotification(notification: IpnNotification) {
    const { topic, id, data } = notification;
    console.log('Procesando notificación de Mercado Pago:', { topic, id, data });

    // Inicializamos la transacción vacía
    let transaction: Transaction;
    const paymentId = data?.resource || id;

    // Lista de tokens a intentar
    const tokensToTry = this.getAllAccessTokens();

    if (tokensToTry.length === 0) {
      console.error('No hay tokens de acceso disponibles para consultar Mercado Pago');
      // Crear transacción básica de error
      transaction = {
        id: paymentId,
        type: 'deposit',
        amount: 0,
        status: 'Pending',
        date_created: new Date().toISOString(),
        description: 'Error: No hay tokens de acceso configurados',
      };

      // Guardar en BD y agregar a memoria
      const savedTransaction = await this.saveTransaction(transaction);
      this.transactions.push(savedTransaction);

      return {
        status: 'error',
        message: 'No hay tokens de acceso configurados para Mercado Pago',
        transaction: savedTransaction
      };
    }

    // Intentar con cada token hasta obtener una respuesta válida
    let successfulResponse = null;
    let lastError = null;

    for (const token of tokensToTry) {
      try {
        console.log(`Consultando detalles del pago en Mercado Pago (ID: ${paymentId}) con token: ${token.substring(0, 10)}...`);
        const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        // Si llegamos aquí, el token funcionó
        successfulResponse = response;
        console.log(`Consulta exitosa con token: ${token.substring(0, 10)}...`);
        break;
      } catch (error) {
        console.warn(`Error al consultar con token ${token.substring(0, 10)}...`, error.message);
        lastError = error;

        // Si el error es 401/403, probar con el siguiente token
        if (error.response?.status === 401 || error.response?.status === 403) {
          continue;
        } else {
          // Para otros errores, no intentamos más
          break;
        }
      }
    }

    if (!successfulResponse) {
      console.error('Todos los tokens fallaron al consultar Mercado Pago:', lastError?.message);

      // Crear transacción de error
      transaction = {
        id: paymentId,
        type: 'deposit',
        amount: 0,
        status: 'Pending',
        date_created: new Date().toISOString(),
        description: 'Error al obtener detalles del pago',
      };

      this.transactions.push(transaction);
      return {
        status: 'error',
        message: 'No se pudieron obtener los detalles del pago con ningún token',
        transaction
      };
    }

    // Procesar la respuesta exitosa
    const apiData = successfulResponse.data;
    console.log('Respuesta completa de la API de Mercado Pago:', JSON.stringify(apiData, null, 2));

    const paymentData: PaymentData = {
      id: apiData.id,
      description: apiData.description || 'Sin descripción',
      amount: apiData.transaction_amount || 0,
      status: apiData.status || 'Pending',
      date_created: apiData.date_created,
      date_approved: apiData.date_approved,
      date_last_updated: apiData.date_last_updated,
      money_release_date: apiData.money_release_date,
      status_detail: apiData.status_detail,
      payment_method_id: apiData.payment_method_id,
      payment_type_id: apiData.payment_type_id,
      payer_id: apiData.payer?.id,
      payer_email: apiData.payer?.email,
      payer_identification: apiData.payer?.identification || null,
      receiver_id: apiData.collector_id || apiData.receiver_id,
      bank_transfer_id: apiData.transaction_details?.bank_transfer_id,
      transaction_details: apiData.transaction_details || null,
      additional_info: apiData.additional_info || null,
      external_reference: apiData.external_reference || null,
      fee_details: apiData.fee_details || [],
    };

    // Determinar la cuenta asociada basada en el receiver_id
    const associatedAccount = this.findAccountByReceiverId(paymentData.receiver_id);

    transaction = {
      id: paymentData.id,
      type: 'deposit',
      amount: paymentData.amount,
      status: paymentData.status,
      date_created: paymentData.date_created,
      description: paymentData.description,
      payment_method_id: paymentData.payment_method_id,
      payer_id: paymentData.payer_id,
      payer_email: paymentData.payer_email,
      payer_identification: paymentData.payer_identification,
      external_reference: paymentData.external_reference,
      cbu: associatedAccount?.cbu,
    };

    const savedTransaction = await this.saveTransaction(transaction);
    this.transactions.push(savedTransaction);

    return {
      status: 'success',
      message: 'Notificación procesada correctamente',
      transaction: savedTransaction
    };
  }

  async getTransactions(): Promise<Transaction[]> {
    try {
      const entities = await this.transactionRepository.find({
        order: { dateCreated: 'DESC' }
      });

      const transactions = entities.map(this.mapEntityToTransaction);
      console.log(`Obtenidas ${transactions.length} transacciones desde la BD`);
      return transactions;
    } catch (error) {
      console.error('Error al obtener transacciones desde BD:', error);
      // Fallback al comportamiento anterior
      console.log('Devolviendo transacciones en memoria como fallback:', this.transactions.length);
      return this.transactions;
    }
  }

  // Actualizar transacción (por ejemplo, al aceptar una transacción)
  async updateTransactionStatus(id: string, status: string): Promise<Transaction | null> {
    try {
      // Actualizar en BD
      await this.transactionRepository.update(id, { status });

      // Obtener la transacción actualizada
      const updatedEntity = await this.transactionRepository.findOne({ where: { id } });
      if (!updatedEntity) {
        return null;
      }

      // Actualizar en memoria
      this.transactions = this.transactions.map(t =>
        t.id.toString() === id ? this.mapEntityToTransaction(updatedEntity) : t
      );

      return this.mapEntityToTransaction(updatedEntity);
    } catch (error) {
      console.error(`Error al actualizar estado de transacción ${id}:`, error);
      return null;
    }
  }

  // Buscar cuenta por receiver_id de Mercado Pago
  private findAccountByReceiverId(receiverId: string): Account | undefined {
    return this.accounts.find(account =>
      account.wallet === 'mercadopago' &&
      (this.mapCbuToMpIdentifier(account.cbu) === receiverId ||
        account.mp_client_id === receiverId)
    );
  }

  async validateWithMercadoPago(depositData: RussiansDepositData) {
    const opId = `validate_${Date.now()}`;
    console.log(`[${opId}] INICIO: Validando depósito:`, JSON.stringify(depositData));
    console.log(`[${opId}] Email recibido para depósito:`, depositData.email);
    console.log('Validando depósito:', depositData);
    console.log('Email recibido para depósito:', depositData.email);

    // Mapear RussiansDepositData a DepositData
    const depositToValidate: DepositData = {
      cbu: depositData.cbu,
      amount: depositData.amount,
      idTransferencia: depositData.idTransferencia,
      dateCreated: depositData.dateCreated
    };

    // Crear la transacción y guardarla en BD inmediatamente
    const newTransaction: Transaction = {
      id: depositToValidate.idTransferencia,
      type: 'deposit',
      amount: depositToValidate.amount,
      status: 'Pending',
      date_created: depositToValidate.dateCreated || new Date().toISOString(),
      description: 'Depósito pendiente de validación',
      cbu: depositToValidate.cbu,
      idCliente: depositData.idCliente,
      payer_email: depositData.email // Guardamos el email aquí
    };

    console.log('Creando transacción con payer_email:', newTransaction.payer_email);

    const savedTransaction = await this.saveTransaction(newTransaction);
    console.log('Transacción guardada, payer_email:', savedTransaction.payer_email);

    this.transactions.push(savedTransaction);



    // Obtener el token específico para este CBU
    const accessToken = this.getAccessTokenByCbu(depositToValidate.cbu);

    if (!accessToken) {
      console.warn(`No se encontró token de acceso para el CBU: ${depositToValidate.cbu}`);
      // Intentar con cualquier token disponible
      const allTokens = this.getAllAccessTokens();
      if (allTokens.length > 0) {
        console.log('Intentando validar con cualquier token disponible');
      } else {
        console.error('No hay tokens de acceso disponibles');
        const newTransaction: Transaction = {
          id: depositToValidate.idTransferencia,
          type: 'deposit',
          amount: depositToValidate.amount,
          status: 'Pending',
          date_created: depositToValidate.dateCreated || new Date().toISOString(),
          description: 'Depósito pendiente - No hay tokens configurados',
          cbu: depositToValidate.cbu,
        };
        this.transactions.push(newTransaction);
        return { status: 'error', message: 'No hay tokens configurados para Mercado Pago', transaction: newTransaction };
      }
    }

    // Buscar coincidencia en las transacciones almacenadas (depósitos de MP)
    const matchingTransaction = this.transactions.find(transaction => {
      return (
        transaction.type === 'deposit' &&
        transaction.amount === depositToValidate.amount && // Coincidencia de monto
        this.matchCbuWithMp(transaction, depositToValidate.cbu) && // Coincidencia de CBU con receiver_id o bank_transfer_id
        this.isDateCloseEnough(transaction.date_created, depositToValidate.dateCreated) // Coincidencia aproximada de fecha
      );
    });

    if (matchingTransaction) {
      console.log('Depósito validado con éxito:', matchingTransaction);

      // Actualizar en BD
      await this.updateTransactionStatus(matchingTransaction.id.toString(), 'Aceptado');

      // Actualizar en memoria (esto ya lo hace el updateTransactionStatus)
      return {
        status: 'success',
        transaction: matchingTransaction,
        message: 'Depósito validado automáticamente con Mercado Pago'
      };
    }

    // Si no hay coincidencia local, consulta la API de MP usando el token específico
    const tokenToUse = accessToken || this.getAllAccessTokens()[0];

    if (!tokenToUse) {
      console.error('No hay tokens disponibles para validar el depósito');
      const newTransaction: Transaction = {
        id: depositToValidate.idTransferencia,
        type: 'deposit',
        amount: depositToValidate.amount,
        status: 'Pending',
        date_created: depositToValidate.dateCreated || new Date().toISOString(),
        description: 'Depósito pendiente - No hay tokens disponibles',
        cbu: depositToValidate.cbu,
      };
      this.transactions.push(newTransaction);
      return { status: 'error', message: 'No hay tokens disponibles para validar con Mercado Pago', transaction: newTransaction };
    }

    try {
      console.log(`Consultando API de Mercado Pago con token: ${tokenToUse.substring(0, 10)}...`);
      const response = await axios.get(`https://api.mercadopago.com/v1/payments`, {
        headers: {
          'Authorization': `Bearer ${tokenToUse}`,
        },
        params: {
          status: 'approved',
          limit: 10,
        },
      });

      console.log('Respuesta de búsqueda en API de Mercado Pago:', JSON.stringify(response.data, null, 2));

      const payments = response.data.results;
      const matchedPayment = payments.find((payment: PaymentData) => {
        return (
          payment.amount === depositToValidate.amount &&
          this.matchCbuWithMp({ payment_method_id: payment.payment_method_id, receiver_id: payment.receiver_id } as unknown as Transaction, depositToValidate.cbu) &&
          this.isDateCloseEnough(payment.date_created, depositToValidate.dateCreated)
        );
      });

      if (matchedPayment) {
        const newTransaction: Transaction = {
          id: matchedPayment.id,
          type: 'deposit',
          amount: matchedPayment.amount,
          status: 'Aceptado',
          date_created: matchedPayment.date_created,
          description: matchedPayment.description || 'Depósito validado',
          payment_method_id: matchedPayment.payment_method_id,
          payer_id: matchedPayment.payer_id,
          payer_email: matchedPayment.payer_email,
          payer_identification: matchedPayment.payer_identification,
          external_reference: matchedPayment.external_reference,
          cbu: depositToValidate.cbu,
        };
        this.transactions.push(newTransaction);
        console.log('Pago encontrado en la API de MP y validado:', newTransaction);
        return { status: 'success', transaction: newTransaction, message: 'Depósito validado automáticamente desde la API de MP' };
      }

      console.log('No se encontró coincidencia con Mercado Pago');
      const newTransaction: Transaction = {
        id: depositToValidate.idTransferencia,
        type: 'deposit',
        amount: depositToValidate.amount,
        status: 'Pending',
        date_created: depositToValidate.dateCreated || new Date().toISOString(),
        description: 'Depósito pendiente de validación',
        cbu: depositToValidate.cbu,
      };
      this.transactions.push(newTransaction);
      return { status: 'error', message: 'No se pudo validar el depósito con Mercado Pago, pendiente de revisión', transaction: newTransaction };
    } catch (error) {
      console.error('Error al consultar la API de MP:', error);
      const newTransaction: Transaction = {
        id: depositToValidate.idTransferencia,
        type: 'deposit',
        amount: depositToValidate.amount,
        status: 'Pending',
        date_created: depositToValidate.dateCreated || new Date().toISOString(),
        description: 'Depósito con error en validación',
        cbu: depositToValidate.cbu,
      };
      this.transactions.push(newTransaction);
      return { status: 'error', message: 'Error al validar el depósito con Mercado Pago', transaction: newTransaction };
    }
  }

  async validateWithdraw(withdrawData: WithdrawData) {
    console.log('Validando retiro:', withdrawData);

    // Generar un ID único o usar el proporcionado
    const transactionId = withdrawData.idTransaction || `withdraw_${Date.now()}`;

    const newTransaction: Transaction = {
      id: transactionId,
      type: 'withdraw',
      amount: withdrawData.amount,
      status: 'Pending',
      date_created: withdrawData.dateCreated || new Date().toISOString(),
      description: `Retiro via ${withdrawData.withdraw_method}`,
      wallet_address: withdrawData.wallet_address,
      payment_method_id: withdrawData.withdraw_method,
      idCliente: withdrawData.idCliente,
      payer_email: withdrawData.email,
      payer_id: withdrawData.idCliente,
      // Agregar los campos adicionales
      payer_identification: {
        type: 'name',
        number: withdrawData.name
      },
      external_reference: withdrawData.phoneNumber // Usar phoneNumber como referencia externa
    };

    console.log('Creando transacción de retiro:', newTransaction);

    // Guardar en BD y agregar a memoria
    const savedTransaction = await this.saveTransaction(newTransaction);
    this.transactions.push(savedTransaction);

    console.log('Retiro almacenado:', savedTransaction);

    return {
      status: 'success',
      message: 'Retiro registrado, pendiente de validación',
      transaction: savedTransaction
    };
  }

  private matchCbuWithMp(transaction: Transaction | PaymentData, cbu: string): boolean {
    if ('receiver_id' in transaction) {
      // Si es PaymentData o Transaction con receiver_id
      if (!transaction.payment_method_id || !transaction.receiver_id) return false;
      const mappedCbu = this.mapCbuToMpIdentifier(cbu);
      return mappedCbu === transaction.receiver_id || (transaction.payment_method_id === 'cvu' && (transaction as Transaction).type === 'deposit');
    }
    return false; // Si no tiene receiver_id, no hay coincidencia
  }

  private mapCbuToMpIdentifier(cbu: string): string {
    // Buscar en la lista de cuentas configuradas
    const account = this.accounts.find(acc => acc.cbu === cbu && acc.wallet === 'mercadopago');
    if (account?.mp_client_id) {
      return account.mp_client_id;
    }

    // Mantener el mapeo estático como respaldo
    const cbuMapping = {
      '00010101': 'TU_RECEIVER_ID', // Reemplaza con el receiver_id de tu cuenta MP
      // Agrega más mapeos según tus cuentas
    };
    return cbuMapping[cbu] || '';
  }

  private isDateCloseEnough(date1: string | undefined, date2: string | undefined): boolean {
    if (!date1 || !date2) return false;
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffMs = Math.abs(d1.getTime() - d2.getTime());
    const diffHours = diffMs / (1000 * 60 * 60); // Diferencia en horas
    return diffHours <= 24; // Tolerancia de 24 horas para transferencias
  }
}
