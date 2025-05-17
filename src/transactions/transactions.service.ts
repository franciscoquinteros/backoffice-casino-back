import { forwardRef, Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository } from 'typeorm';
import axios from 'axios';
import { IpnNotification, DepositData, Transaction, PaymentData } from './transaction.types';
// Importamos RussiansDepositData (asumiendo que tiene idAgent)
import { RussiansDepositData } from './deposit/russians-deposit.types';
import { AccountService } from '../account/account.service';
import { Account } from '../account/entities/account.entity';
import { WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { TransactionEntity } from './entities/transaction.entity';
// Importamos WithdrawData (asumiendo que también tiene idAgent)
import { WithdrawData } from './withdraw/russianswithdraw.types';

export { Transaction } from './transaction.types';

@Injectable()
export class IpnService implements OnModuleInit {
  @WebSocketServer()
  server: Server;
  private accounts: Account[] = [];
  private transactions: Transaction[] = [];

  constructor(
    @Inject(forwardRef(() => AccountService))
    private accountService: AccountService,
    @InjectRepository(TransactionEntity)
    private transactionRepository: Repository<TransactionEntity>
  ) {
    // Inicializar el servicio inmediatamente
    this.initializeService();
  }

  private async initializeService() {
    try {
      console.log('Inicializando servicio IPN...');
      await this.reloadService();

      // Configurar un intervalo para recargar las cuentas cada 5 minutos
      setInterval(async () => {
        try {
          await this.reloadService();
        } catch (error) {
          console.error('Error en recarga automática de cuentas:', error);
        }
      }, 5 * 60 * 1000); // 5 minutos
    } catch (error) {
      console.error('Error al inicializar el servicio IPN:', error);
      // Reintentar la inicialización después de 30 segundos
      setTimeout(() => this.initializeService(), 30000);
    }
  }

  // Modificar el método reloadService para ser más robusto
  async reloadService() {
    try {
      console.log('Reiniciando servicio IPN...');

      // Limpiar las cuentas actuales
      this.accounts = [];

      // Recargar todas las cuentas activas
      const accounts = await this.accountService.findAll();

      // Filtrar solo las cuentas válidas de Mercado Pago
      this.accounts = accounts.filter(acc =>
        acc.wallet === 'mercadopago' &&
        acc.status === 'active' &&
        acc.mp_access_token &&
        acc.mp_client_id
      );

      console.log(`Servicio IPN reiniciado con ${this.accounts.length} cuentas configuradas`);

      // Verificar que tenemos al menos una cuenta válida
      if (this.accounts.length === 0) {
        console.warn('ADVERTENCIA: No hay cuentas de Mercado Pago activas configuradas');
      }

      return {
        status: 'success',
        message: `Servicio IPN reiniciado con ${this.accounts.length} cuentas configuradas`
      };
    } catch (error) {
      console.error('Error al reiniciar el servicio IPN:', error);
      throw error;
    }
  }

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
      // LOG: Información que se va a actualizar en la BD
      console.log(`Actualizando info de transacción ${id} con:`, info);

      await this.transactionRepository.update(id, info);

      // Actualizar en memoria
      this.transactions = this.transactions.map(t => {
        if (t.id.toString() === id) {
          const updatedTransaction = { ...t, ...info };
          // LOG: Transacción actualizada en memoria
          console.log(`Transacción ${id} actualizada en memoria:`, updatedTransaction);
          return updatedTransaction;
        }
        return t;
      });

      const updatedEntity = await this.transactionRepository.findOne({ where: { id } });
      const updatedTransaction = updatedEntity ? this.mapEntityToTransaction(updatedEntity) : null;
      // LOG: Transacción recuperada después de la actualización en BD
      console.log(`Transacción ${id} recuperada de BD tras update:`, updatedTransaction);
      return updatedTransaction;
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

        // Actualizar automáticamente los nombres de cuentas de transacciones pendientes
        this.updateAllAccountNames();
      } catch (error) {
        console.error('Error al cargar transacciones desde la base de datos:', error);
        this.transactions = [];
      }
    } catch (error) {
      console.error('Error al inicializar el servicio IPN:', error);
    }
  }

  // Método para actualizar automáticamente los nombres de cuentas para todas las transacciones
  private async updateAllAccountNames(): Promise<void> {
    try {
      console.log('Iniciando proceso de actualización automática de nombres de cuentas...');

      // Obtener todas las transacciones pendientes que tengan CBU pero no tengan nombre de cuenta
      const transactionsToUpdate = await this.transactionRepository.find({
        where: [
          { accountName: null },
          { accountName: '' },
          { accountName: 'No disponible' }
        ]
      });

      console.log(`Encontradas ${transactionsToUpdate.length} transacciones sin nombre de cuenta asignado`);

      // Crear un mapa para optimizar búsquedas de cuentas (CBU -> nombre)
      const accountNameMap = new Map<string, string>();

      // Llenar el mapa inicialmente con las cuentas en memoria
      for (const account of this.accounts) {
        if (account.cbu && account.name) {
          accountNameMap.set(account.cbu, account.name);
        }
      }

      // Procesar cada transacción
      for (const transaction of transactionsToUpdate) {
        if (!transaction.cbu) continue;

        try {
          let accountName: string | null = null;

          // Primero buscar en el mapa para evitar consultas repetidas a la BD
          if (accountNameMap.has(transaction.cbu)) {
            accountName = accountNameMap.get(transaction.cbu);
            console.log(`Usando nombre en caché para CBU ${transaction.cbu}: ${accountName}`);
          } else {
            // Si no está en el mapa, buscar en la BD
            const account = await this.accountService.findByCbu(transaction.cbu);
            if (account && account.name) {
              accountName = account.name;
              // Agregar al mapa para futuras consultas
              accountNameMap.set(transaction.cbu, account.name);
              console.log(`Encontrado en BD nombre para CBU ${transaction.cbu}: ${accountName}`);
            } else {
              console.log(`No se encontró cuenta para CBU ${transaction.cbu}`);
            }
          }

          // Si encontramos un nombre, actualizar la transacción
          if (accountName) {
            transaction.accountName = accountName;
            await this.transactionRepository.save(transaction);
            console.log(`Actualizada transacción ${transaction.id} con nombre de cuenta: ${accountName}`);
          }
        } catch (error) {
          console.error(`Error procesando transacción ${transaction.id}:`, error);
        }
      }

      console.log('Proceso de actualización automática de nombres de cuentas completado');
    } catch (error) {
      console.error('Error en el proceso de actualización automática de nombres de cuentas:', error);
    }
  }

  // Mapear entidad a tipo Transaction
  private mapEntityToTransaction(entity: TransactionEntity): Transaction {
    const mappedTransaction = {
      id: entity.id,
      type: entity.type,
      amount: typeof entity.amount === 'number'
        ? entity.amount
        : parseFloat(String(entity.amount)),
      status: entity.status,
      date_created: entity.dateCreated?.toISOString() ||
        entity.createdAt?.toISOString() ||
        entity.updatedAt?.toISOString() ||
        null,
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
      reference_transaction: entity.referenceTransaction,
      relatedUserTransactionId: entity.relatedUserTransactionId,
      office: entity.office,
      account_name: entity.accountName,
    };

    // Verificar el mapeo
    console.log(`[MAP_ENTITY] Entidad → Transacción: accountName=${entity.accountName} → account_name=${mappedTransaction.account_name}`);

    return mappedTransaction;
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
    entity.relatedUserTransactionId = transaction.relatedUserTransactionId;
    entity.office = transaction.office || null;

    // CRÍTICO: Asegurarse de asignar account_name a accountName (la columna de BD)
    entity.accountName = transaction.account_name || null;

    console.log(`[MAP_TO_ENTITY] Mapeando transaction.account_name=${transaction.account_name} a entity.accountName=${entity.accountName}`);

    return entity;
  }

  // Método para guardar transacción en la base de datos
  // En IpnService (transactions.service.ts)
  async saveTransaction(transaction: Transaction): Promise<Transaction> {
    try {
      // Si la transacción tiene CBU pero no tiene account_name, intentamos buscar el nombre
      if (transaction.cbu && !transaction.account_name) {
        // Buscar en memoria primero
        const accountByCbu = this.accounts.find(acc =>
          acc.cbu === transaction.cbu &&
          acc.status === 'active' &&
          acc.wallet === 'mercadopago'
        );

        if (accountByCbu && accountByCbu.name) {
          console.log(`[SAVE_TX] Encontró cuenta en memoria: ${accountByCbu.name} para CBU ${transaction.cbu}`);
          transaction.account_name = accountByCbu.name;
        } else {
          console.log(`[SAVE_TX] Buscando cuenta directamente en BD para CBU ${transaction.cbu}`);
          try {
            // Buscar directamente en la BD usando el servicio de cuentas
            const dbAccount = await this.accountService.findByCbu(transaction.cbu);
            if (dbAccount) {
              console.log(`[SAVE_TX] Encontró cuenta en BD: ${dbAccount.name} para CBU ${transaction.cbu}`);
              transaction.account_name = dbAccount.name;
            } else {
              console.log(`[SAVE_TX] No se encontró cuenta para CBU ${transaction.cbu}, usando valor por defecto`);
              transaction.account_name = 'No disponible';
            }
          } catch (error) {
            console.error(`[SAVE_TX] Error al buscar cuenta en BD:`, error);
            transaction.account_name = 'No disponible';
          }
        }
      }

      // Hacer un log detallado antes de guardar
      console.log(`[SAVE_TX] Guardando transacción con datos:`, {
        id: transaction.id,
        cbu: transaction.cbu,
        account_name: transaction.account_name
      });

      const entity = this.mapTransactionToEntity(transaction);

      // Log para ver los datos de la entidad antes de guardarla
      console.log(`[SAVE_TX] Entidad a guardar:`, {
        id: entity.id,
        cbu: entity.cbu,
        accountName: entity.accountName
      });

      const savedEntity = await this.transactionRepository.save(entity);
      console.log(`[SAVE_TX] Transacción guardada en BD: ${savedEntity.id}, account_name: ${savedEntity.accountName || 'NO GUARDADO'}`);

      // Actualizar también en memoria si es necesario
      const existingIndex = this.transactions.findIndex(t => t.id === transaction.id);
      if (existingIndex >= 0) {
        this.transactions[existingIndex] = this.mapEntityToTransaction(savedEntity);
      } else {
        this.transactions.push(this.mapEntityToTransaction(savedEntity));
      }

      return this.mapEntityToTransaction(savedEntity);
    } catch (error) {
      console.error('[SAVE_TX] Error al guardar transacción en BD:', error);
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
    const allAccounts = this.accounts;
    console.log('Total de cuentas disponibles:', allAccounts.length);


    const mpAccounts = allAccounts.filter(acc => acc.wallet === 'mercadopago');
    console.log('Cuentas de Mercado Pago:', mpAccounts.length);

    const activeAccounts = mpAccounts.filter(acc => acc.status === 'active');
    console.log('Cuentas de MP activas:', activeAccounts.length);

    const accountsWithToken = activeAccounts.filter(acc => acc.mp_access_token);
    console.log('Cuentas de MP activas con token:', accountsWithToken.length);

    if (accountsWithToken.length === 0) {
      console.log('DETALLE DE CUENTAS ACTIVAS SIN TOKEN:',
        activeAccounts.map(acc => ({
          id: acc.id,
          name: acc.name,
          hasToken: !!acc.mp_access_token
        }))
      );
    }

    const tokens = accountsWithToken.map(acc => acc.mp_access_token);
    console.log('Tokens encontrados:', accountsWithToken.map(acc => ({
      name: acc.name,
      token_last_10: acc.mp_access_token.substring(acc.mp_access_token.length - 10)
    })));
    return [...new Set(tokens)];

  }



  private isDateCloseEnough(date1Str: string | undefined, date2Str: string | undefined): boolean {
    if (!date1Str || !date2Str) return false;
    try {
      const d1 = new Date(date1Str);
      const d2 = new Date(date2Str);

      // Verificar si las fechas son válidas
      if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
        console.warn(`isDateCloseEnough: Fechas inválidas recibidas: ${date1Str}, ${date2Str}`);
        return false;
      }

      const diffMs = Math.abs(d1.getTime() - d2.getTime());
      const diffHours = diffMs / (1000 * 60 * 60); // Diferencia en horas
      const maxDiffHours = 24; // Tolerancia de 24 horas para transferencias ( configurable )

      // console.log(`isDateCloseEnough: Comparando fechas: ${date1Str} vs ${date2Str}. Diferencia en horas: ${diffHours}. Tolerancia: ${maxDiffHours}`);

      return diffHours <= maxDiffHours;
    } catch (error) {
      console.error(`Error en isDateCloseEnough al parsear fechas: ${date1Str}, ${date2Str}`, error);
      return false; // Retornar false si hay error al parsear
    }
  }

  // En IpnService (transactions.service.ts)

  async handleNotification(notification: IpnNotification) {
    const { topic, id, data } = notification;
    console.log(`[IPN] Procesando notificación de Mercado Pago:`, { topic, id, data });

    let mpTransaction: Transaction;
    const paymentId = data?.resource || id;

    // --- CONSULTAR DETALLES DEL PAGO EN MERCADO PAGO ---
    const tokensToTry = this.getAllAccessTokens();

    if (tokensToTry.length === 0) {
      console.error(`[IPN] ${paymentId}: No hay tokens de acceso disponibles para consultar Mercado Pago.`);
      mpTransaction = {
        id: paymentId,
        type: 'deposit',
        amount: 0,
        status: 'Error',
        date_created: new Date().toISOString(),
        description: 'Error IPN: No hay tokens de acceso configurados para consultar detalles.',
      };
      const savedErrorTransaction = await this.saveTransaction(mpTransaction);
      return {
        status: 'error',
        message: 'No hay tokens de acceso configurados para Mercado Pago',
        transaction: savedErrorTransaction
      };
    }

    // Intentar con cada token hasta obtener una respuesta válida de la API de MP
    let successfulResponse = null;
    let lastError = null;

    for (const token of tokensToTry) {
      try {
        console.log(`[IPN] ${paymentId}: Consultando detalles del pago en Mercado Pago con token: ${token.substring(0, 10)}...`);
        const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        successfulResponse = response;
        console.log(`[IPN] ${paymentId}: Consulta exitosa con token.`);
        break;
      } catch (error) {
        console.warn(`[IPN] ${paymentId}: Error al consultar con token ${token.substring(0, 10)}...`, error.message);
        lastError = error;

        if (error.response?.status === 401 || error.response?.status === 403) {
          continue;
        } else {
          continue;
        }
      }
    }

    if (!successfulResponse) {
      console.error(`[IPN] ${paymentId}: Todos los tokens fallaron al consultar Mercado Pago.`, lastError?.message);
      return {
        status: 'error',
        message: 'No se pudieron obtener los detalles del pago con ningún token',
        transaction: null
      };
    }

    // --- PROCESAR RESPUESTA EXITOSA DE LA API DE MP ---
    const apiData = successfulResponse.data;
    console.log(`[IPN] ${paymentId}: Respuesta de la API de Mercado Pago (parcial):`, {
      id: apiData.id,
      status: apiData.status,
      amount: apiData.transaction_amount,
      payer_email: apiData.payer?.email,
      receiver_id: apiData.collector_id || apiData.receiver_id,
      date_created: apiData.date_created,
      payment_method_id: apiData.payment_method_id,
      transaction_details: apiData.transaction_details
    });
    // Log completo de la respuesta de la API de Mercado Pago
    console.log(`[IPN] ${paymentId}: Respuesta COMPLETA de la API de Mercado Pago:`, JSON.stringify(apiData, null, 2));

    // Obtener el receiver_id de la respuesta
    const receiverId = apiData.collector_id || apiData.receiver_id;
    console.log(`[IPN] ${paymentId}: Receiver ID obtenido: ${receiverId}`);

    // Buscar la cuenta asociada basada en el receiver_id
    const associatedAccount = this.findAccountByReceiverId(receiverId?.toString());
    console.log(`[IPN] ${paymentId}: Cuenta asociada encontrada:`, associatedAccount ?
      { id: associatedAccount.id, name: associatedAccount.name, agent: associatedAccount.agent } : 'No encontrada');

    // Obtener la office de la cuenta asociada
    let officeFromAccount = null;
    if (associatedAccount) {
      officeFromAccount = associatedAccount.office || associatedAccount.agent;
      console.log(`[IPN] ${paymentId}: Office encontrada para receiver_id ${receiverId}: ${officeFromAccount}`);
    } else {
      console.warn(`[IPN] ${paymentId}: No se encontró cuenta asociada para receiver_id ${receiverId}`);
    }

    // Obtener el CBU del depósito desde transaction_details
    let depositCbu = null;
    if (apiData.transaction_details?.financial_institution) {
      depositCbu = apiData.transaction_details.financial_institution;
      console.log(`[IPN] ${paymentId}: CBU del depósito encontrado: ${depositCbu}`);
    }

    // Si tenemos CBU pero no tenemos la cuenta asociada por receiverId, intentamos buscarla por el CBU
    let accountInfo = associatedAccount;
    if (!accountInfo && depositCbu) {
      console.log(`[IPN] ${paymentId}: Buscando cuenta por CBU: ${depositCbu}`);

      // Buscar en memoria
      accountInfo = this.findAccountByCbu(depositCbu);

      // Si no está en memoria, buscar en la base de datos
      if (!accountInfo) {
        try {
          console.log(`[IPN] ${paymentId}: Buscando cuenta en base de datos para CBU ${depositCbu}`);
          const dbAccount = await this.accountService.findByCbu(depositCbu);
          if (dbAccount) {
            console.log(`[IPN] ${paymentId}: Encontrada cuenta en BD: ${dbAccount.name} para CBU ${depositCbu}`);
            accountInfo = dbAccount;
            // Agregar a las cuentas en memoria para futuras consultas
            this.accounts.push(dbAccount);
          }
        } catch (error) {
          console.error(`[IPN] ${paymentId}: Error buscando cuenta en BD:`, error);
        }
      }

      // Si encontramos la cuenta por CBU, usamos su office
      if (accountInfo && !officeFromAccount) {
        officeFromAccount = accountInfo.office || accountInfo.agent;
        console.log(`[IPN] ${paymentId}: Office encontrada para CBU ${depositCbu}: ${officeFromAccount}`);
      }
    }

    const existingMpTx = await this.getTransactionById(apiData.id.toString());
    mpTransaction = existingMpTx ? existingMpTx : { id: apiData.id.toString(), type: 'deposit' } as Transaction;

    mpTransaction.amount = apiData.transaction_amount || 0;
    mpTransaction.status = 'Pending';
    mpTransaction.date_created = apiData.date_created;
    mpTransaction.description = apiData.description || 'Pago recibido vía IPN - Pendiente de validación';
    mpTransaction.payment_method_id = apiData.payment_method_id;
    mpTransaction.payer_id = apiData.payer_id?.toString() || null;
    mpTransaction.payer_email = apiData.payer?.email || null;
    mpTransaction.payer_identification = apiData.payer?.identification || null;
    mpTransaction.external_reference = apiData.external_reference || null;
    mpTransaction.receiver_id = receiverId?.toString() || null;
    mpTransaction.cbu = depositCbu || associatedAccount?.cbu;
    mpTransaction.office = officeFromAccount;
    mpTransaction.account_name = accountInfo?.name || 'No disponible';

    const savedMpTransaction = await this.saveTransaction(mpTransaction);
    console.log(`[IPN] DEPURACIÓN: Transacción MP guardada con los siguientes datos:`, {
      id: savedMpTransaction.id,
      amount: savedMpTransaction.amount,
      status: savedMpTransaction.status,
      email: savedMpTransaction.payer_email,
      cbu: savedMpTransaction.cbu,
      office: savedMpTransaction.office,
      account_name: savedMpTransaction.account_name,
      description: savedMpTransaction.description
    });

    // --- BÚSQUEDA DE COINCIDENCIAS CON DEPÓSITOS EXTERNOS ---
    if (savedMpTransaction.status === 'Pending') {
      console.log(`[IPN] ${savedMpTransaction.id}: Buscando depósito externo coincidente...`);

      const matchingExternalDeposit = this.transactions.find(externalTx => {
        // Ignorar la misma transacción si ya existe
        if (externalTx.id === savedMpTransaction.id) {
          console.log(`[IPN] ${savedMpTransaction.id}: Ignorando transacción con mismo ID: ${externalTx.id}`);
          return false;
        }

        // --- Matching por email o DNI ---
        const mpEmail = savedMpTransaction.payer_email?.toLowerCase();
        const extEmail = externalTx.payer_email?.toLowerCase();
        const mpDni = this.extractDniFromCuit(
          typeof savedMpTransaction.payer_identification === 'object' && savedMpTransaction.payer_identification?.number
            ? savedMpTransaction.payer_identification.number
            : undefined
        );
        const extDni = this.extractDniFromCuit(
          typeof externalTx.payer_identification === 'object' && externalTx.payer_identification?.number
            ? externalTx.payer_identification.number
            : undefined
        );
        const extEmailOrDni = externalTx.payer_email?.toLowerCase();
        const matchDniEmail = mpDni && extEmailOrDni && mpDni === extEmailOrDni;
        const matchEmail = mpEmail && extEmail && mpEmail === extEmail;
        const matchDni = mpDni && extDni && mpDni === extDni;

        return (
          externalTx.type === 'deposit' &&
          externalTx.status === 'Pending' &&
          !externalTx.reference_transaction &&
          typeof externalTx.amount === 'number' && externalTx.amount > 0 &&
          externalTx.amount === savedMpTransaction.amount &&
          externalTx.cbu &&
          this.matchCbuWithMp(savedMpTransaction, externalTx.cbu) &&
          // --- MATCH por email o por DNI ---
          (matchEmail || matchDni || matchDniEmail) &&
          externalTx.date_created && savedMpTransaction.date_created &&
          this.isDateCloseEnough(savedMpTransaction.date_created, externalTx.date_created) &&
          externalTx.office === savedMpTransaction.office // Asegurar que coincidan las oficinas
        );
      });

      if (matchingExternalDeposit) {
        console.log(`[IPN] ${savedMpTransaction.id}: ¡Coincidencia encontrada con depósito externo ID: ${matchingExternalDeposit.id}`);

        // 1. La transacción MP queda en "Pending"
        await this.updateTransactionStatus(savedMpTransaction.id.toString(), 'Match');

        // 2. Cambiar el depósito externo a "Aceptado"
        await this.updateTransactionStatus(matchingExternalDeposit.id.toString(), 'Aceptado');

        // 3. Añadir referencias cruzadas entre ambas transacciones
        await this.updateTransactionInfo(matchingExternalDeposit.id.toString(), {
          referenceTransaction: savedMpTransaction.id.toString(),
          description: `Depósito match con transacción MP ID: ${savedMpTransaction.id}`,
          office: matchingExternalDeposit.office
        });

        await this.updateTransactionInfo(savedMpTransaction.id.toString(), {
          relatedUserTransactionId: matchingExternalDeposit.id.toString(),
          office: savedMpTransaction.office
        });

        // 4. Llamar al proxy con el payload requerido
        try {
          const proxyPayload = {
            user_id: parseInt(matchingExternalDeposit.idCliente?.toString() || '0', 10),
            amount: matchingExternalDeposit.amount,
            transaction_id: matchingExternalDeposit.id.toString()
          };

          console.log(`[IPN] ${savedMpTransaction.id}: Enviando payload al proxy para aceptación automática:`, proxyPayload);
          const proxyResponse = await axios.post('http://18.216.231.42:8080/deposit', proxyPayload);
          console.log(`[IPN] ${savedMpTransaction.id}: Respuesta del proxy recibida:`, proxyResponse.data);

          if (proxyResponse.data?.status === 0) {
            console.log(`[IPN] ${savedMpTransaction.id}: SUCCESS: Proxy aceptó la transacción.`);
            if (proxyResponse.data.result?.new_balance) {
              await this.updateTransactionInfo(matchingExternalDeposit.id.toString(), {
                externalBalance: proxyResponse.data.result.new_balance
              });
            }
            console.log(`[IPN] ${savedMpTransaction.id}: FIN: Transacción ${matchingExternalDeposit.id} aceptada automáticamente.`);
          } else {
            const errorMsg = proxyResponse.data?.error_message || 'Error desconocido del proxy';
            console.error(`[IPN] ${savedMpTransaction.id}: ERROR: Proxy rechazó la transacción ${matchingExternalDeposit.id}. Razón: ${errorMsg}`);
            await this.updateTransactionStatus(matchingExternalDeposit.id.toString(), 'Error');
            await this.updateTransactionDescription(matchingExternalDeposit.id.toString(), `Error del Proxy: ${errorMsg}`);
          }
        } catch (error) {
          console.error(`[IPN] ${savedMpTransaction.id}: ERROR: Falló la comunicación con el proxy para la transacción ${matchingExternalDeposit.id}:`, error.message);
          await this.updateTransactionStatus(matchingExternalDeposit.id.toString(), 'Error');
          const commErrorMsg = error.response?.data?.message || error.message || 'Error de comunicación con el proxy';
          await this.updateTransactionDescription(matchingExternalDeposit.id.toString(), `Error de Comunicación con Proxy: ${commErrorMsg}`);
        }

        console.log(`[IPN] ${savedMpTransaction.id}: Depósito externo ${matchingExternalDeposit.id} marcado como Match.`);
        console.log(`[IPN] ${savedMpTransaction.id}: Transacción MP marcada como Aceptado.`);
      } else {
        console.log(`[IPN] ${savedMpTransaction.id}: No se encontró depósito externo coincidente.`);
      }
    }

    // Al final del método, donde el depósito es confirmado como exitoso
    if (savedMpTransaction &&
      savedMpTransaction.status === 'approved' &&
      savedMpTransaction.type === 'deposit' &&
      savedMpTransaction.cbu) {

      // Actualizar el monto acumulado para este CBU
      try {
        console.log(`[IPN] ${savedMpTransaction.id}: Actualizando monto acumulado para CBU ${savedMpTransaction.cbu} con monto ${savedMpTransaction.amount}`);

        await this.accountService.updateAccountAccumulatedAmount(
          savedMpTransaction.cbu,
          savedMpTransaction.amount
        );

        console.log(`[IPN] ${savedMpTransaction.id}: Monto acumulado actualizado exitosamente`);
      } catch (error) {
        console.error(`[IPN] ${savedMpTransaction.id}: Error al actualizar monto acumulado:`, error);
        // No fallamos la operación completa, solo registramos el error
      }
    }

    return {
      status: 'success',
      message: 'Notificación de Mercado Pago procesada correctamente.',
      transaction: savedMpTransaction
    };
  }

  // Mantener la lógica original de validateWithMercadoPago
  async validateWithMercadoPago(depositData: RussiansDepositData) {
    const opId = `validate_${Date.now()}`;
    console.log(`[${opId}] INICIO: Validando depósito:`, JSON.stringify(depositData));
    console.log(`[${opId}] Email recibido para depósito:`, depositData.email);
    console.log(`[${opId}] idAgent recibido:`, depositData.idAgent);
    console.log(`[${opId}] CBU recibido:`, depositData.cbu);

    // Extraemos el idTransferencia del payload
    const idTransferencia = depositData.idTransaction || `deposit_${Date.now()}`;

    // Verificar que tenemos cuentas configuradas
    if (this.accounts.length === 0) {
      console.warn(`[${opId}] No hay cuentas de Mercado Pago configuradas. Intentando recargar...`);
      await this.reloadService();
    }

    // Intentar encontrar la cuenta asociada al CBU directamente de la base de datos
    let accountInfo = null;
    try {
      console.log(`[${opId}] Buscando cuenta directamente en BD para CBU ${depositData.cbu}`);
      accountInfo = await this.accountService.findByCbu(depositData.cbu, depositData.idAgent);

      if (accountInfo) {
        console.log(`[${opId}] ENCONTRÓ CUENTA EN BD: ${accountInfo.name} (ID: ${accountInfo.id}) para CBU ${depositData.cbu}`);
      } else {
        // Si no encuentra con filtro de oficina, intenta sin él
        accountInfo = await this.accountService.findByCbu(depositData.cbu);
        if (accountInfo) {
          console.log(`[${opId}] ENCONTRÓ CUENTA EN BD SIN FILTRO OFICINA: ${accountInfo.name} (ID: ${accountInfo.id}) para CBU ${depositData.cbu}`);
        } else {
          console.warn(`[${opId}] NO SE ENCONTRÓ cuenta en BD para CBU ${depositData.cbu}`);
        }
      }
    } catch (error) {
      console.error(`[${opId}] Error al buscar cuenta por CBU ${depositData.cbu}:`, error);
    }

    // Mostrar resultado de la búsqueda
    if (accountInfo) {
      console.log(`[${opId}] CUENTA ENCONTRADA PARA CBU ${depositData.cbu}:`, {
        id: accountInfo.id,
        name: accountInfo.name,
        agent: accountInfo.agent,
        office: accountInfo.office
      });
    } else {
      console.warn(`[${opId}] No se encontró cuenta configurada para CBU ${depositData.cbu} en oficina ${depositData.idAgent}`);
    }

    // Validación de CBU con filtro de oficina
    if (!this.isValidCbu(depositData.cbu, depositData.idAgent)) {
      console.warn(`[${opId}] Validación de CBU fallida para CBU ${depositData.cbu} en oficina ${depositData.idAgent}.`);
      const existingUserReport = await this.getTransactionById(idTransferencia);
      const officeAccount = this.accounts.find(acc =>
        acc.agent === depositData.idAgent &&
        acc.wallet === 'mercadopago' &&
        acc.status === 'active'
      );

      if (existingUserReport) {
        console.log(`[${opId}] El ID de transferencia ${idTransferencia} ya existe, devolviendo estado existente.`);
        const responseStatus = (existingUserReport.status === 'Aceptado' || existingUserReport.status === 'Pending') ? 'success' : 'error';
        const responseMessage = existingUserReport.status === 'Aceptado' ? 'Este depósito ya fue validado.' :
          existingUserReport.status === 'Pending' ? 'Este depósito ya está registrado y pendiente.' :
            'Error al registrar depósito: ID de transacción duplicado con estado de error.';
        return { status: responseStatus, message: responseMessage, transaction: existingUserReport };
      } else {
        const account_name = accountInfo?.name || 'CBU no reconocido';
        console.log(`[${opId}] Creando transacción rechazada con account_name: ${account_name}`);

        const rejectedTransaction: Transaction = {
          id: idTransferencia,
          type: 'deposit',
          amount: depositData.amount,
          status: 'Rechazado',
          date_created: new Date().toISOString(),
          description: 'Depósito rechazado: CBU inválido o no configurado para esta oficina.',
          cbu: depositData.cbu,
          idCliente: depositData.idCliente,
          payer_email: depositData.email,
          external_reference: depositData.idTransaction,
          office: officeAccount?.office,
          account_name: account_name
        };
        await this.saveTransaction(rejectedTransaction);
        return { status: 'error', message: 'El CBU proporcionado no es válido o no está configurado para esta oficina.', transaction: rejectedTransaction };
      }
    }

    // Crear o actualizar la transacción del usuario
    const existingPendingOrAcceptedUserReport = await this.getTransactionById(depositData.idTransaction || '');

    // Establecer el nombre de cuenta para la transacción
    const account_name = accountInfo?.name || depositData.nombreDelTitular || 'No disponible';
    console.log(`[${opId}] Usando account_name: ${account_name} para la transacción`);

    // Crear la transacción con el nombre de cuenta ya establecido
    const userDepositTransaction: Transaction = existingPendingOrAcceptedUserReport ? existingPendingOrAcceptedUserReport : {
      id: depositData.idTransaction || `deposit_${Date.now()}`,
      type: 'deposit',
      amount: depositData.amount,
      status: 'Pending',
      date_created: depositData.dateCreated || new Date().toISOString(),
      description: existingPendingOrAcceptedUserReport?.description || 'Depósito reportado por usuario, pendiente de validación',
      cbu: depositData.cbu,
      idCliente: depositData.idCliente,
      payer_email: depositData.email,
      external_reference: depositData.nombreDelTitular,
      office: depositData.idAgent,
      account_name: account_name // Asignar el nombre de cuenta
    };

    if (existingPendingOrAcceptedUserReport?.status === 'Aceptado') {
      userDepositTransaction.status = 'Aceptado';
      userDepositTransaction.description = existingPendingOrAcceptedUserReport.description;
    } else {
      userDepositTransaction.status = 'Pending';
    }

    console.log(`[${opId}] Creando/Actualizando transacción de usuario:`, {
      id: userDepositTransaction.id,
      cbu: userDepositTransaction.cbu,
      account_name: userDepositTransaction.account_name,
      office: userDepositTransaction.office
    });

    // Guardar la transacción en la base de datos
    const savedUserTransaction = await this.saveTransaction(userDepositTransaction);

    // Si la transacción ya está Aceptada, no buscar match
    if (savedUserTransaction.status === 'Aceptado') {
      console.log(`[${opId}] Depósito de usuario ${savedUserTransaction.id} ya estaba Aceptado.`);
      // Actualizar el monto acumulado para este CBU
      try {
        console.log(`[${opId}] Actualizando monto acumulado para CBU ${savedUserTransaction.cbu} con monto ${savedUserTransaction.amount}`);

        await this.accountService.updateAccountAccumulatedAmount(
          savedUserTransaction.cbu,
          savedUserTransaction.amount
        );

        console.log(`[${opId}] Monto acumulado actualizado exitosamente`);
      } catch (error) {
        console.error(`[${opId}] Error al actualizar monto acumulado:`, error);
        // No fallamos la operación completa, solo registramos el error
      }
      return {
        status: 'success',
        message: 'Este depósito ya fue validado.',
        transaction: savedUserTransaction
      };
    }

    // Buscar transacciones pendientes de Mercado Pago que coincidan con los criterios
    const pendingMpTransactions = await this.getTransactions(
      userDepositTransaction.office, // Filtrar por oficina
      'deposit',                    // Filtrar por tipo
      'Pending'                     // Filtrar por estado
    );

    // Filtrar las transacciones que coinciden con los criterios
    const matchingTransaction = pendingMpTransactions.find(mpTx => {
      // Ignorar la misma transacción si ya existe
      if (mpTx.id === savedUserTransaction.id) {
        console.log(`[${opId}] Ignorando transacción con mismo ID: ${mpTx.id}`);
        return false;
      }

      // Verificar que sea una transacción de Mercado Pago (tiene payer_identification)
      if (!mpTx.payer_identification) {
        console.log(`[${opId}] Ignorando transacción que no es de Mercado Pago (no tiene payer_identification): ${mpTx.id}`);
        return false;
      }

      const isMatch = (
        mpTx.type === 'deposit' &&
        mpTx.status === 'Pending' &&
        !mpTx.relatedUserTransactionId &&
        typeof mpTx.amount === 'number' && mpTx.amount > 0 &&
        mpTx.amount === savedUserTransaction.amount &&
        mpTx.payer_email && savedUserTransaction.payer_email &&
        mpTx.payer_email.toLowerCase() === savedUserTransaction.payer_email.toLowerCase() &&
        mpTx.date_created && savedUserTransaction.date_created &&
        this.isDateCloseEnough(mpTx.date_created, savedUserTransaction.date_created) &&
        mpTx.office === savedUserTransaction.office
      );

      if (isMatch) {
        console.log(`[${opId}] Transacción MP ${mpTx.id} cumple con todos los criterios de match:`, {
          id: mpTx.id,
          type: mpTx.type,
          status: mpTx.status,
          amount: mpTx.amount,
          email: mpTx.payer_email,
          office: mpTx.office,
          date_created: mpTx.date_created,
          payer_identification: mpTx.payer_identification
        });
      } else {
        console.log(`[${opId}] Transacción MP ${mpTx.id} no cumple con los criterios de match:`, {
          type: mpTx.type,
          status: mpTx.status,
          hasRelatedUser: !!mpTx.relatedUserTransactionId,
          amount: mpTx.amount,
          email: mpTx.payer_email,
          office: mpTx.office,
          date_created: mpTx.date_created,
          payer_identification: mpTx.payer_identification
        });
      }

      return isMatch;
    });

    if (matchingTransaction) {
      console.log(`[${opId}] ¡Coincidencia encontrada con transacción MP ID: ${matchingTransaction.id}`);

      // 1. La transacción MP queda en "Pending"
      await this.updateTransactionStatus(matchingTransaction.id.toString(), 'Match');

      // 2. Cambiar el depósito externo a "Aceptado"
      await this.updateTransactionStatus(savedUserTransaction.id.toString(), 'Aceptado');

      // 3. Añadir referencias cruzadas entre ambas transacciones
      await this.updateTransactionInfo(savedUserTransaction.id.toString(), {
        referenceTransaction: matchingTransaction.id.toString(),
        description: `Depósito match con transacción MP ID: ${matchingTransaction.id}`,
        office: savedUserTransaction.office
      });

      await this.updateTransactionInfo(matchingTransaction.id.toString(), {
        relatedUserTransactionId: savedUserTransaction.id.toString(),
        office: savedUserTransaction.office
      });

      // 4. Llamar a acceptDeposit con el payload requerido
      try {
        const proxyPayload = {
          user_id: parseInt(savedUserTransaction.idCliente?.toString() || '0', 10),
          amount: savedUserTransaction.amount,
          transaction_id: savedUserTransaction.id.toString()
        };

        console.log(`[${opId}] Enviando payload al proxy para aceptación automática:`, proxyPayload);
        const proxyResponse = await axios.post('http://18.216.231.42:8080/deposit', proxyPayload);
        console.log(`[${opId}] Respuesta del proxy recibida:`, proxyResponse.data);

        if (proxyResponse.data?.status === 0) {
          console.log(`[${opId}] SUCCESS: Proxy aceptó la transacción.`);
          if (proxyResponse.data.result?.new_balance) {
            await this.updateTransactionInfo(savedUserTransaction.id.toString(), {
              externalBalance: proxyResponse.data.result.new_balance
            });
          }
          console.log(`[${opId}] FIN: Transacción ${savedUserTransaction.id} aceptada automáticamente.`);
          // Actualizar el monto acumulado para este CBU
          try {
            console.log(`[${opId}] Actualizando monto acumulado para CBU ${savedUserTransaction.cbu} con monto ${savedUserTransaction.amount}`);

            await this.accountService.updateAccountAccumulatedAmount(
              savedUserTransaction.cbu,
              savedUserTransaction.amount
            );

            console.log(`[${opId}] Monto acumulado actualizado exitosamente`);
          } catch (error) {
            console.error(`[${opId}] Error al actualizar monto acumulado:`, error);
            // No fallamos la operación completa, solo registramos el error
          }
          return {
            status: 'success',
            message: 'Depósito validado y procesado automáticamente.',
            transaction: savedUserTransaction
          };
        } else {
          const errorMsg = proxyResponse.data?.error_message || 'Error desconocido del proxy';
          console.error(`[${opId}] ERROR: Proxy rechazó la transacción ${savedUserTransaction.id}. Razón: ${errorMsg}`);
          await this.updateTransactionStatus(savedUserTransaction.id.toString(), 'Error');
          await this.updateTransactionDescription(savedUserTransaction.id.toString(), `Error del Proxy: ${errorMsg}`);
          throw new Error(`Error en el procesamiento del proxy: ${errorMsg}`);
        }
      } catch (error) {
        console.error(`[${opId}] ERROR: Falló la comunicación con el proxy para la transacción ${savedUserTransaction.id}:`, error.message);
        await this.updateTransactionStatus(savedUserTransaction.id.toString(), 'Error');
        const commErrorMsg = error.response?.data?.message || error.message || 'Error de comunicación con el proxy';
        await this.updateTransactionDescription(savedUserTransaction.id.toString(), `Error de Comunicación con Proxy: ${commErrorMsg}`);
        throw new Error(`Error de comunicación con el proxy: ${commErrorMsg}`);
      }

      console.log(`[${opId}] Depósito externo ${savedUserTransaction.id} marcado como Match.`);
      console.log(`[${opId}] Transacción MP ${matchingTransaction.id} marcada como Aceptado.`);

      const updatedUserTransaction = await this.getTransactionById(savedUserTransaction.id.toString());
      return {
        status: 'success',
        message: 'Depósito validado automáticamente al instante.',
        transaction: updatedUserTransaction
      };
    } else {
      console.log(`[${opId}] No se encontró transacción MP coincidente. El depósito ${savedUserTransaction.id} queda PENDING.`);
      return {
        status: 'success',
        message: 'Depósito registrado, pendiente de validación con Mercado Pago.',
        transaction: savedUserTransaction
      };
    }
  }

  // Modificar validateWithdraw para GUARDAR idAgent como 'office'
  async validateWithdraw(withdrawData: WithdrawData) { // Asumimos que WithdrawData ahora tiene idAgent
    console.log('Validando retiro:', withdrawData);
    // Log para ver idAgent recibido
    console.log(`Validando retiro idAgent: ${withdrawData.idAgent}`); // <-- Log para ver idAgent recibido

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
      payer_email: withdrawData.email, // El email del usuario que solicita el retiro
      payer_id: withdrawData.idCliente, // Usamos el idCliente como payer_id para retiros
      // Agregar los campos adicionales
      payer_identification: {
        type: 'name',
        number: withdrawData.nombreDelTitular
      },
      external_reference: withdrawData.phoneNumber, // Usar phoneNumber como referencia externa
      office: withdrawData.idAgent, // <-- GUARDAR idAgent como 'office'
    };

    console.log('Creando transacción de retiro con office:', newTransaction.office, newTransaction); // <-- Log office

    // Guardar en BD y agregar a memoria
    const savedTransaction = await this.saveTransaction(newTransaction);
    // saveTransaction ya agrega a this.transactions si no existe

    console.log('Retiro almacenado con office:', savedTransaction.office, savedTransaction); // <-- Log office

    return {
      status: 'success',
      message: 'Retiro registrado, pendiente de validación',
      transaction: savedTransaction
    };
  }


  // Modificar getTransactions para filtrar DIRECTAMENTE por 'office'
  async getTransactions(officeId?: string, type?: string, status?: string): Promise<Transaction[]> {
    console.log(`IpnService: Buscando transacciones${officeId ? ` para oficina ${officeId}` : ''}${type ? ` de tipo ${type}` : ''}${status ? ` con estado ${status}` : ''}`);

    try {
      // Usamos createQueryBuilder para hacer un join con la tabla account
      const queryBuilder = this.transactionRepository.createQueryBuilder('transaction')
        .leftJoin('account', 'account', 'transaction.cbu = account.cbu')
        .select([
          'transaction.id',
          'transaction.type',
          'transaction.amount',
          'transaction.status',
          'transaction.dateCreated',
          'transaction.createdAt',
          'transaction.updatedAt',
          'transaction.description',
          'transaction.paymentMethodId',
          'transaction.payerId',
          'transaction.payerEmail',
          'transaction.payerIdentification',
          'transaction.externalReference',
          'transaction.cbu',
          'transaction.walletAddress',
          'transaction.receiverId',
          'transaction.idCliente',
          'transaction.referenceTransaction',
          'transaction.relatedUserTransactionId',
          'transaction.office',
          'transaction.accountName'
        ])
        .addSelect('account.name', 'account_name');

      // Añadir filtros si se proporcionan
      if (officeId) {
        queryBuilder.andWhere('transaction.office = :officeId', { officeId });
      }
      if (type) {
        queryBuilder.andWhere('transaction.type = :type', { type });
      }
      if (status) {
        queryBuilder.andWhere('transaction.status = :status', { status });
      }

      queryBuilder.orderBy('transaction.dateCreated', 'DESC');

      // Añadir selección explícita para date_created
      queryBuilder.addSelect('transaction.dateCreated', 'transaction_date_created');
      // Intentar varias formas de seleccionar date_created con diferentes alias
      queryBuilder.addSelect('transaction.date_created', 'date_created');
      queryBuilder.addSelect('transaction.dateCreated', 'dateCreated');

      // Ejecutar la consulta raw y obtener los resultados
      const rawResults = await queryBuilder.getRawMany();

      console.log(`IpnService: Obtenidas ${rawResults.length} transacciones con join a accounts`);

      // Log para depuración - ver los primeros resultados
      if (rawResults.length > 0) {
        console.log('Muestra de resultados JOIN:', rawResults.slice(0, 2).map(r => ({
          id: r.transaction_id,
          cbu: r.transaction_cbu,
          account_name: r.account_name
        })));

        // Log completo del primer resultado para ver TODOS los campos
        console.log('OBJETO RAW COMPLETO PRIMERA TRANSACCIÓN:', rawResults[0]);

        // Agregar log detallado para ver la estructura completa
        console.log('Nombres de propiedades disponibles:', Object.keys(rawResults[0]));

        // Agregar logs específicos para date_created
        console.log('Valor raw de transaction_dateCreated:', rawResults[0].transaction_dateCreated);
        console.log('Valor de transaction_date_created:', rawResults[0].transaction_date_created);

        console.log('Valor de external_reference:',
          rawResults[0].transaction_externalReference ||
          rawResults[0].transaction_external_reference);
        console.log('Valor de id_cliente:',
          rawResults[0].transaction_idCliente ||
          rawResults[0].transaction_id_cliente);
      }

      // Mapear los resultados raw a objetos Transaction
      const transactions = rawResults.map(raw => {
        const transaction: Transaction = {
          id: raw.transaction_id,
          type: raw.transaction_type,
          amount: typeof raw.transaction_amount === 'number'
            ? raw.transaction_amount
            : parseFloat(String(raw.transaction_amount)),
          status: raw.transaction_status,
          date_created:
            // Intentar diferentes posibles nombres de campos
            raw.transaction_dateCreated ? new Date(raw.transaction_dateCreated).toISOString() :
              raw.transaction_date_created ? new Date(raw.transaction_date_created).toISOString() :
                raw.date_created ? new Date(raw.date_created).toISOString() :
                  raw.dateCreated ? new Date(raw.dateCreated).toISOString() :
                    raw.transaction_createdAt ? new Date(raw.transaction_createdAt).toISOString() :
                      raw.transaction_created_at ? new Date(raw.transaction_created_at).toISOString() :
                        null, // Devolver null en lugar de fecha actual
          description: raw.transaction_description,
          payment_method_id: raw.transaction_paymentMethodId,
          payer_id: raw.transaction_payerId,
          payer_email: raw.transaction_payerEmail,
          external_reference: raw.transaction_externalReference || raw.transaction_external_reference || null,
          cbu: raw.transaction_cbu,
          wallet_address: raw.transaction_walletAddress,
          receiver_id: raw.transaction_receiverId,
          idCliente: raw.transaction_idCliente || raw.transaction_id_cliente || null,
          reference_transaction: raw.transaction_referenceTransaction,
          relatedUserTransactionId: raw.transaction_relatedUserTransactionId,
          office: raw.transaction_office,
          // Usar el nombre de cuenta del JOIN si está disponible, sino usar el guardado en accountName
          account_name: raw.account_name || raw.transaction_accountName || 'No disponible'
        };

        return transaction;
      });

      return transactions;
    } catch (error) {
      console.error('Error al obtener transacciones con join a accounts:', error);

      // Si falla el método con join, recurrimos al método original
      console.log('Recurriendo al método original sin join...');

      // Construir las opciones de búsqueda tradicionales
      const findOptions: FindManyOptions<TransactionEntity> = {
        order: { dateCreated: 'DESC' }, // Ordenar por fecha descendente
        where: {} // Inicializar el objeto where
      };

      // Añadir filtros si se proporcionan
      if (officeId) {
        findOptions.where['office'] = officeId;
      }
      if (type) {
        findOptions.where['type'] = type;
      }
      if (status) {
        findOptions.where['status'] = status;
      }

      // Ejecutar la consulta y obtener los resultados
      const entities = await this.transactionRepository.find(findOptions);

      // Mapear las entidades obtenidas al tipo Transaction
      const transactions = entities.map(entity => {
        const transaction = this.mapEntityToTransaction(entity);

        // Si la transacción tiene CBU pero no tiene account_name, buscar el nombre
        if (transaction.cbu && !transaction.account_name) {
          // En segundo plano (no esperamos la respuesta), actualizar el account_name
          this.findAccountNameForTransaction(transaction.id, transaction.cbu).catch(err => {
            console.error(`Error al buscar nombre de cuenta para transacción ${transaction.id}:`, err);
          });
        }

        return transaction;
      });

      console.log(`IpnService: Obtenidas ${transactions.length} transacciones${officeId ? ` para oficina ${officeId}` : ''}${type ? ` de tipo ${type}` : ''}${status ? ` con estado ${status}` : ''}`);
      return transactions;
    }
  }

  // Método auxiliar para buscar y actualizar el nombre de cuenta de una transacción en segundo plano
  private async findAccountNameForTransaction(transactionId: string | number, cbu: string): Promise<void> {
    try {
      if (!cbu) return;

      console.log(`Buscando nombre de cuenta para transacción ${transactionId} con CBU ${cbu}`);

      // Buscar la cuenta por CBU en la base de datos
      const account = await this.accountService.findByCbu(cbu);

      if (account && account.name) {
        console.log(`Encontrado nombre de cuenta "${account.name}" para transacción ${transactionId}`);

        // Actualizar en la base de datos directamente usando update
        try {
          await this.transactionRepository.update(
            { id: transactionId.toString() },
            { accountName: account.name }
          );

          console.log(`Actualizado accountName en BD para transacción ${transactionId} a "${account.name}"`);

          // También actualizamos en memoria
          const updatedTransaction = this.transactions.find(t => t.id.toString() === transactionId.toString());
          if (updatedTransaction) {
            updatedTransaction.account_name = account.name;
            console.log(`Actualizado account_name en memoria para transacción ${transactionId}`);
          }
        } catch (dbError) {
          console.error(`Error al actualizar accountName en BD para transacción ${transactionId}:`, dbError);
        }
      } else {
        console.log(`No se encontró cuenta para CBU ${cbu} de transacción ${transactionId}`);
      }
    } catch (error) {
      console.error(`Error al buscar nombre de cuenta para transacción ${transactionId}:`, error);
    }
  }

  // Actualizar transacción (por ejemplo, al aceptar una transacción)
  async updateTransactionStatus(id: string, status: string): Promise<Transaction | null> {
    try {
      // Guardar el estado anterior para comparar
      const transaction = await this.getTransactionById(id);

      if (!transaction) {
        console.warn(`No se encontró la transacción ${id} para actualizar el estado`);
        return null;
      }

      const previousStatus = transaction.status;

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

      // Si es un depósito que pasa a estado "Aceptado", actualizar el monto acumulado
      if (transaction.type === 'deposit'
        && status === 'Aceptado'
        && previousStatus !== 'Aceptado'
        && transaction.cbu) {
        try {
          console.log(`[UpdateStatus] Actualizando monto acumulado para CBU ${transaction.cbu} con monto ${transaction.amount}`);

          await this.accountService.updateAccountAccumulatedAmount(
            transaction.cbu,
            transaction.amount
          );

          console.log(`[UpdateStatus] Monto acumulado actualizado exitosamente`);
        } catch (error) {
          console.error(`[UpdateStatus] Error al actualizar monto acumulado:`, error);
          // No fallamos la operación completa, solo registramos el error
        }
      }

      return this.mapEntityToTransaction(updatedEntity);
    } catch (error) {
      console.error(`Error al actualizar estado de transacción ${id}:`, error);
      return null;
    }
  }

  private matchCbuWithMp(transaction: any, cbu: string): boolean {
    console.log(`matchCbuWithMp: Verificando coincidencia entre MP y CBU...`);

    // Resto de la lógica existente
    if (!('receiver_id' in transaction) || !transaction.receiver_id) {
      console.log(`matchCbuWithMp: Transacción no tiene receiver_id.`);
      return false;
    }

    if (!cbu) {
      console.log(`matchCbuWithMp: CBU del usuario es null o vacío.`);
      return false;
    }

    const mappedCbuIdentifier = this.mapCbuToMpIdentifier(cbu);

    if (!mappedCbuIdentifier) {
      console.log(`matchCbuWithMp: No se pudo mapear CBU ${cbu} a identificador MP.`);
      return false;
    }

    const receiverIdMatch = mappedCbuIdentifier === transaction.receiver_id;
    const cvuCheck = transaction.payment_method_id === 'cvu' && (transaction as Transaction).type === 'deposit';
    const isMatch = receiverIdMatch || cvuCheck;

    console.log(`matchCbuWithMp: Resultado final isMatch = ${isMatch} (receiverIdMatch: ${receiverIdMatch}, cvuCheck: ${cvuCheck})`);
    return isMatch;
  }

  private mapCbuToMpIdentifier(cbu: string): string {
    // Buscar en la lista de cuentas configuradas
    // Asegurarse de que la cuenta esté activa, sea de mercadopago y tenga mp_client_id
    const account = this.accounts.find(acc =>
      acc.cbu === cbu &&
      acc.wallet === 'mercadopago' &&
      acc.status === 'active' && // Solo considerar cuentas activas
      acc.mp_client_id // Asegurarse de que tenga el ID de cliente MP necesario para mapeo
    );

    if (account?.mp_client_id) {
      return account.mp_client_id;
    }

    console.warn(`mapCbuToMpIdentifier: No se encontró un identificador mp_client_id configurado para el CBU: ${cbu}`);
    return '';
  }

  // Helper para extraer el DNI de un CUIT/CUIL (8 dígitos del medio)
  private extractDniFromCuit(cuit: string | undefined | null): string | null {
    if (!cuit || cuit.length < 11) return null;
    // CUIT/CUIL: XX-XXXXXXXX-X
    return cuit.substring(2, 10); // 8 dígitos del medio
  }

  // Buscar o definir un método para encontrar una cuenta por CBU
  private findAccountByCbu(cbu: string, officeId?: string): Account | undefined {
    if (!cbu) {
      console.warn("findAccountByCbu fue llamada con un CBU null o undefined.");
      return undefined;
    }

    console.log(`Buscando cuenta configurada para CBU: ${cbu}${officeId ? ` en oficina ${officeId}` : ''}`);

    // Primero buscar en las cuentas cargadas en memoria
    const accountInMemory = this.accounts.find(acc =>
      acc.cbu === cbu &&
      acc.wallet === 'mercadopago' &&
      acc.status === 'active' &&
      (!officeId || acc.agent === officeId)
    );

    if (accountInMemory) {
      console.log(`Cuenta encontrada en memoria para CBU ${cbu}: ${accountInMemory.name} (ID: ${accountInMemory.id})`);
      return accountInMemory;
    }

    // Si no se encuentra en memoria, intentamos recargar las cuentas primero
    console.log(`No se encontró cuenta para CBU ${cbu} en memoria, recargando cuentas...`);
    try {
      // Recargar cuentas (esto actualiza this.accounts)
      this.reloadService().then(() => {
        const accountAfterReload = this.accounts.find(acc =>
          acc.cbu === cbu &&
          acc.wallet === 'mercadopago' &&
          acc.status === 'active' &&
          (!officeId || acc.agent === officeId)
        );

        if (accountAfterReload) {
          console.log(`Cuenta encontrada después de recargar para CBU ${cbu}: ${accountAfterReload.name}`);
          return accountAfterReload;
        } else {
          console.log(`Después de recargar, sigue sin encontrarse cuenta para CBU: ${cbu}`);
        }
      }).catch(error => {
        console.error(`Error al recargar cuentas en findAccountByCbu: ${error.message}`);
      });
    } catch (error) {
      console.error(`Error al buscar cuenta por CBU ${cbu}: ${error}`);
    }

    console.log(`No se encontró cuenta para CBU: ${cbu} después de intentar recargar`);
    return undefined;
  }

  private async isValidCbu(cbu: string, officeId?: string): Promise<boolean> {
    if (!cbu) {
      console.warn('isValidCbu: CBU is null or empty.');
      return false;
    }

    console.log(`isValidCbu: Buscando cuenta para CBU ${cbu}${officeId ? ` en oficina ${officeId}` : ''}`);

    // Buscar la cuenta que coincida con CBU, wallet, status, mp_client_id Y officeId (en la propiedad 'agent')
    const account = this.accounts.find(acc =>
      acc.cbu === cbu &&
      acc.wallet === 'mercadopago' &&
      acc.status === 'active' && // Only consider active accounts
      acc.mp_client_id && // Ensure it has the necessary MP client ID for mapping
      (!officeId || acc.agent === officeId) // <-- ¡CORRECCIÓN! Usar acc.agent en lugar de acc.office
      // Si officeId no se proporciona, esta condición es true. Si se proporciona, acc.agent must match.
    );

    if (!account) {
      console.warn(`isValidCbu: No se encontró una cuenta activa de Mercado Pago configurada para el CBU: ${cbu}${officeId ? ` en oficina ${officeId}` : ''}`);
      return false;
    }

    console.log(`isValidCbu: CBU ${cbu} validado contra cuenta configurada ${account.name} (ID: ${account.id}) en oficina ${account.agent}.`);
    return true;
  }

  // Buscar cuenta por receiver_id de Mercado Pago
  private findAccountByReceiverId(receiverId: string): Account | undefined {
    console.log(`Buscando cuenta configurada para receiver_id: ${receiverId}`);

    if (receiverId === undefined || receiverId === null) {
      console.warn("findAccountByReceiverId fue llamada con un receiver_id null o undefined.");
      return undefined;
    }

    console.log(`Buscando cuenta para receiver_id: ${receiverId}`);
    console.log("Todas las cuentas disponibles:", this.accounts.map(acc => ({
      id: acc.id,
      name: acc.name,
      agent: acc.agent,
      office: acc.office,
      mp_client_id: acc.mp_client_id,
      receiver_id: acc.receiver_id,
    })));

    const receiverIdStr = receiverId.toString();

    // Buscar la cuenta que coincida con el receiver_id
    const account = this.accounts.find(acc =>
      acc.wallet === 'mercadopago' &&
      acc.status === 'active' &&
      acc.receiver_id &&
      acc.receiver_id.toString() === receiverIdStr
    );

    if (account) {
      console.log(`Cuenta encontrada: ${account.name} (ID: ${account.id}) con office: ${account.office}`);
      return account;
    }

    console.log(`No se encontró cuenta para receiver_id: ${receiverId}`);
    return undefined;
  }
}