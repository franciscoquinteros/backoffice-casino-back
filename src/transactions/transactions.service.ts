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
      reference_transaction: entity.referenceTransaction,
      relatedUserTransactionId: entity.relatedUserTransactionId,
      office: entity.office, // <-- Mapear el campo 'office'
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
    entity.relatedUserTransactionId = transaction.relatedUserTransactionId;
    entity.office = transaction.office || null; // <-- Mapear y guardar 'office'
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

    // Inicializamos la transacción de Mercado Pago que vamos a guardar/actualizar
    let mpTransaction: Transaction; // <-- Renombrado a mpTransaction
    const paymentId = data?.resource || id; // ID del pago de Mercado Pago

    // --- CONSULTAR DETALLES DEL PAGO EN MERCADO PAGO ---
    // Lista de tokens a intentar
    const tokensToTry = this.getAllAccessTokens();

    if (tokensToTry.length === 0) {
      console.error(`[IPN] ${paymentId}: No hay tokens de acceso disponibles para consultar Mercado Pago.`);
      // Crear una transacción básica de error si no se pueden obtener detalles
      mpTransaction = { // <-- Usamos mpTransaction
        id: paymentId,
        type: 'deposit',
        amount: 0, // Monto desconocido si no se puede consultar MP
        status: 'Error', // Estado de error en nuestro sistema
        date_created: new Date().toISOString(),
        description: 'Error IPN: No hay tokens de acceso configurados para consultar detalles.',
      };
      // Guardar en BD y agregar a memoria
      const savedErrorTransaction = await this.saveTransaction(mpTransaction); // <-- Usamos mpTransaction
      // saveTransaction ya actualiza la lista en memoria

      return {
        status: 'error',
        message: 'No hay tokens de acceso configurados para Mercado Pago',
        transaction: savedErrorTransaction // <-- Devolver la transacción de error
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

        // Si llegamos aquí, el token funcionó
        successfulResponse = response;
        console.log(`[IPN] ${paymentId}: Consulta exitosa con token.`);
        break; // Salir del bucle al obtener una respuesta exitosa
      } catch (error) {
        console.warn(`[IPN] ${paymentId}: Error al consultar con token ${token.substring(0, 10)}...`, error.message);
        lastError = error;

        // Si el error es 401/403 (token inválido o permisos), probar con el siguiente
        if (error.response?.status === 401 || error.response?.status === 403) {
          continue;
        } else {
          // Para otros errores, no intentamos más tokens, asumimos un problema general
          continue;
        }
      }
    }

    if (!successfulResponse) {
      console.error(`[IPN] ${paymentId}: Todos los tokens fallaron al consultar Mercado Pago.`, lastError?.message);

      // Crear una transacción de error o actualizar una existente si la IPN es reintentada
      const existingMpTx = await this.getTransactionById(paymentId.toString());

      if (existingMpTx) {
        console.warn(`[IPN] ${paymentId}: Transacción ya existe, actualizando estado a Error.`);
        await this.updateTransactionStatus(existingMpTx.id.toString(), 'Error');
        await this.updateTransactionInfo(existingMpTx.id.toString(), {
          description: (existingMpTx.description || '') + ' | Error IPN: Fallo al consultar detalles.'
        });
        mpTransaction = existingMpTx; // Usar la existente para el retorno
      } else {
        mpTransaction = { // <-- Usamos mpTransaction
          id: paymentId,
          type: 'deposit',
          amount: 0,
          status: 'Error', // Estado de error en nuestro sistema
          date_created: new Date().toISOString(),
          description: 'Error IPN: No se pudieron obtener los detalles del pago con ningún token.',
        };
        // Guardar la nueva transacción de error
        mpTransaction = await this.saveTransaction(mpTransaction); // mpTransaction ahora es la guardada
      }


      return {
        status: 'error',
        message: 'No se pudieron obtener los detalles del pago con ningún token',
        transaction: mpTransaction // <-- Devolver la transacción de error
      };
    }

    // --- PROCESAR RESPUESTA EXITOSA DE LA API DE MP ---
    const apiData = successfulResponse.data;
    console.log(`[IPN] ${paymentId}: Respuesta de la API de Mercado Pago (parcial):`, {
      id: apiData.id, status: apiData.status, amount: apiData.transaction_amount,
      payer_email: apiData.payer?.email, receiver_id: apiData.collector_id || apiData.receiver_id,
      date_created: apiData.date_created
    });
    console.log('Respuesta completa de la API de Mercado Pago:', JSON.stringify(apiData, null, 2)); // Descomentar para debug completo

    // Determinar la cuenta asociada basada en el receiver_id de MP
    const associatedAccount = this.findAccountByReceiverId(apiData.collector_id || apiData.receiver_id);
    const cbuFromMp = associatedAccount?.cbu; // El CBU asociado a la cuenta receptora en MP

    // Crear o actualizar la transacción local de Mercado Pago
    // Usamos el ID del pago de MP como ID de nuestra transacción
    const existingMpTx = await this.getTransactionById(apiData.id.toString());

    // Si ya existe, usarla para preservar los campos personalizados como relatedUserTransactionId
    mpTransaction = existingMpTx ? existingMpTx : { id: apiData.id.toString(), type: 'deposit' } as Transaction;


    // Actualizar datos de la transacción de MP con la info fresca de la API
    mpTransaction.amount = apiData.transaction_amount || 0;
    mpTransaction.status = 'Pending'; // Estado reportado por MP
    mpTransaction.date_created = apiData.date_created;
    mpTransaction.description = apiData.description || 'Pago recibido vía IPN - Pendiente de validación';
    mpTransaction.payment_method_id = apiData.payment_method_id;
    mpTransaction.payer_id = apiData.payer?.id?.toString() || null;
    mpTransaction.payer_email = apiData.payer?.email || null;
    mpTransaction.payer_identification = apiData.payer?.identification || null;
    mpTransaction.external_reference = apiData.external_reference || null;
    mpTransaction.receiver_id = apiData.collector_id?.toString() || apiData.receiver_id?.toString() || null;
    mpTransaction.cbu = cbuFromMp; // Asociar el CBU si se encontró la cuenta
    // --- AÑADIR ASIGNACIÓN DE OFICINA AL MP Transaction si se encuentra la cuenta ---
    // Esto es útil para poder filtrar las transacciones de MP por oficina receptora
    mpTransaction.office = associatedAccount?.office || null; // <-- Asignar office de la cuenta receptora si está disponible


    // Si ya tenía relatedUserTransactionId (porque validateWithMercadoPago lo marcó), mantenerlo
    // mpTransaction.relatedUserTransactionId = existingMpTx?.relatedUserTransactionId || undefined; // Ya se copia si se carga el existente

    // Guardar/Actualizar la transacción de Mercado Pago en nuestra BD
    const savedMpTransaction = await this.saveTransaction(mpTransaction); // mpTransaction ahora es la guardada
    // saveTransaction ya actualiza la lista en memoria
    console.log(`[IPN] DEPURACIÓN: Transacción MP guardada con los siguientes datos:`);
    console.log(`  - ID: ${savedMpTransaction.id}`);
    console.log(`  - Monto: ${savedMpTransaction.amount}`);
    console.log(`  - Status: "${savedMpTransaction.status}"`); // El doble comillas es intencional para ver espacios
    console.log(`  - Email: ${savedMpTransaction.payer_email}`);
    console.log(`  - CBU: ${savedMpTransaction.cbu}`);
    console.log(`  - Office: ${savedMpTransaction.office}`);
    console.log(`  - Descripción: ${savedMpTransaction.description}`);

    console.log(`[IPN] ${savedMpTransaction.id}: Transacción de MP guardada/actualizada con estado MP: ${savedMpTransaction.status}. Oficina: ${savedMpTransaction.office}`); // <-- Log office


    // --- INICIO LÓGICA DE VALIDACIÓN CRUZADA POR IPN ---
    let matchingUserDeposit: Transaction | undefined = undefined;
    // Solo intentar validar si el pago de MP está APROBADO y aún NO HA SIDO USADO para validar otro depósito
    if ((savedMpTransaction.status === 'approved' || savedMpTransaction.status === 'Aceptado' || savedMpTransaction.status === 'Pending') && !savedMpTransaction.relatedUserTransactionId) {

      console.log(`[IPN] ${savedMpTransaction.id}: Pago APROBADO y no usado. Buscando depósito de usuario PENDIENTE para matchear...`);

      // Buscar un depósito de usuario pendiente (creado por validateWithMercadoPago)
      // que coincida con este pago de MP y que NO HAYA SIDO YA VALIDADO
      const matchingUserDeposit = this.transactions.find(userTx => {
        // Asegurarse de que userTx es un depósito de usuario válido para matchear
        return (
          userTx.type === 'deposit' && // Debe ser un depósito reportado por el usuario
          userTx.status === 'Pending' && // Busca depósitos reportados por usuario que están pendientes
          !userTx.reference_transaction && // <--- ¡CLAVE! Asegura que este depósito pendiente NO haya sido validado ya por otro pago MP
          typeof userTx.amount === 'number' && userTx.amount > 0 && // Asegurar monto válido en User Tx
          userTx.amount === savedMpTransaction.amount && // Mismo monto
          userTx.cbu && // Asegurar que el depósito de usuario tiene CBU
          this.matchCbuWithMp(savedMpTransaction, userTx.cbu) && // El pago de MP llegó a la cuenta del CBU reportado por el usuario
          savedMpTransaction.payer_email && userTx.payer_email && savedMpTransaction.payer_email.toLowerCase() === userTx.payer_email.toLowerCase() && // Mismo email del pagador (ignorando mayúsculas/minúsculas), asegurando que ambos emails existan
          userTx.date_created && savedMpTransaction.date_created && // Asegurar que ambas fechas existan
          this.isDateCloseEnough(savedMpTransaction.date_created, userTx.date_created) // Fecha de creación cercana (del pago MP y del reporte de usuario)
        );
      });

      if (matchingUserDeposit) {
        console.log(`[IPN] ${savedMpTransaction.id}: ¡Coincidencia encontrada vía IPN! Validando depósito de usuario ID: ${matchingUserDeposit.id}`);

        // 1. Actualizar la transacción MP a "Aceptado"
        await this.updateTransactionStatus(savedMpTransaction.id.toString(), 'Aceptado');
        console.log(`[IPN DEBUG ${savedMpTransaction.id}] MP TX actualizada a Aceptado (aparentemente).`);

        // 2. Cambiar el depósito externo a "Consolidado" (no "Pending" ni "Aceptado")
        await this.updateTransactionStatus(matchingUserDeposit.id.toString(), 'Consolidado');
        console.log(`[IPN DEBUG ${matchingUserDeposit.id}] User Deposit actualizado a Consolidado (aparentemente).`);

        // 3. Añadir referencias cruzadas entre ambas transacciones
        await this.updateTransactionInfo(matchingUserDeposit.id.toString(), {
          reference_transaction: savedMpTransaction.id.toString(),
          description: `Depósito consolidado en transacción MP ID: ${savedMpTransaction.id}`,
        });

        await this.updateTransactionInfo(savedMpTransaction.id.toString(), {
          relatedUserTransactionId: matchingUserDeposit.id.toString(),
          description: `Transacción validada con depósito externo ID: ${matchingUserDeposit.id}`
        });

        console.log(`[IPN] ${savedMpTransaction.id}: Depósito externo ${matchingUserDeposit.id} marcado como Consolidado.`);
        console.log(`[IPN] ${savedMpTransaction.id}: Transacción MP marcada como Aceptado.`);

        // Opcional: Emitir un evento WebSocket al usuario para notificarle
        // this.server.emit('depositValidated', { userId: matchingUserDeposit.idCliente, transactionId: matchingUserDeposit.id });
      } else {
        console.log(`[IPN] ${savedMpTransaction.id}: No se encontró depósito de usuario pendiente y sin usar coincidente para este pago MP.`);
        // El pago de MP (savedMpTransaction) queda registrado con su estado original ('approved', etc.)
        // y relatedUserTransactionId = null, listo para ser matcheado por validateWithMercadoPago
        // si un usuario reporta su depósito *después* de que llegue la IPN.
      }
    } else {
      if (savedMpTransaction.relatedUserTransactionId) {
        console.log(`[IPN] ${savedMpTransaction.id}: Pago MP ya usado para validar depósito ID: ${savedMpTransaction.relatedUserTransactionId}. No requiere validación adicional.`);
      } else {
        console.log(`[IPN] ${savedMpTransaction.id}: Pago MP no está Aprobado (${savedMpTransaction.status}). No se busca validación cruzada con depósitos pendientes.`);
      }
      // El pago de MP queda registrado con el estado reportado por MP o se mantiene su estado 'usado'.
    }

    // --- FIN LÓGICA DE VALIDACIÓN CRUZADA POR IPN ---


    // Devolver respuesta indicando que la notificación IPN fue procesada
    return {
      status: 'success', // La notificación IPN fue procesada exitosamente (independientemente si matcheó un depósito)
      message: 'Notificación de Mercado Pago procesada correctamente.' + (matchingUserDeposit ? ' Depósito de usuario validado.' : ''),
      transaction: savedMpTransaction // Devuelve la transacción de MP procesada
    };
  }

  // Modificar validateWithMercadoPago para GUARDAR idAgent como 'office'
  async validateWithMercadoPago(depositData: RussiansDepositData) {

    const pendingMpTransactions = this.transactions.filter(tx =>
      tx.type === 'deposit' &&
      tx.status === 'Pending'
    );
    const opId = `validate_${Date.now()}`;
    console.log(`[${opId}] INICIO: Validando depósito:`, JSON.stringify(depositData));
    console.log(`[${opId}] Email recibido para depósito:`, depositData.email);
    console.log('Validando depósito:', depositData);
    console.log('Email recibido para depósito:', depositData.email);
    // Log para ver idAgent recibido
    console.log(`[${opId}] idAgent recibido:`, depositData.idAgent); // <-- Log para ver idAgent recibido
    console.log(`[${opId}] DEPURACIÓN: Encontradas ${pendingMpTransactions.length} transacciones MP Pendientes en total`);

    // Extraemos el idTransferencia del payload, usando fallback si es necesario
    const idTransferencia = depositData.idTransaction || `deposit_${Date.now()}`;


    // Log detalles de cada transacción candidata


    // --- VALIDACIÓN DE CBU CON FILTRO DE OFICINA ---
    // Pasar el CBU del payload Y el idAgent (oficina) a isValidCbu
    if (!this.isValidCbu(depositData.cbu, depositData.idAgent)) { // <-- ¡PASAR depositData.idAgent AQUÍ!
      console.warn(`[${opId}] Validación de CBU fallida para CBU ${depositData.cbu} en oficina ${depositData.idAgent}.`); // Log actualizado
      // Crear transacción 'Rechazado' por CBU inválido si no existe ya con ese idTransferencia
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
        const rejectedTransaction: Transaction = {
          id: idTransferencia,
          type: 'deposit',
          amount: depositData.amount,
          status: 'Rechazado',
          date_created: new Date().toISOString(),
          description: 'Depósito rechazado: CBU inválido o no configurado para esta oficina.', // Mensaje más específico
          cbu: depositData.cbu,
          idCliente: depositData.idCliente,
          payer_email: depositData.email, // Si usas este campo en tu DTO
          external_reference: depositData.idTransaction,

          office: officeAccount?.office, // <-- GUARDAR idAgent como 'office'
        };
        await this.saveTransaction(rejectedTransaction);
        return { status: 'error', message: 'El CBU proporcionado no es válido o no está configurado para esta oficina.', transaction: rejectedTransaction }; // Mensaje más específico
      }
    }
    // --- FIN VALIDACIÓN DE CBU CON FILTRO DE OFICINA ---


    // Si llegamos aquí, el CBU es válido para la oficina especificada y el idTransferencia no existía previamente (o existía pero no en estado Error/Rechazado)
    // Creamos o actualizamos la transacción del usuario como PENDING


    const existingPendingOrAcceptedUserReport = await this.getTransactionById(idTransferencia);

    const userDepositTransaction: Transaction = existingPendingOrAcceptedUserReport ? existingPendingOrAcceptedUserReport : {
      id: idTransferencia, // Usamos el ID proporcionado por el usuario
      type: 'deposit',
      amount: depositData.amount,
      status: 'Pending', // Inicialmente siempre es Pendiente al reportar el usuario (o se mantiene si ya era Pending/Aceptado)
      date_created: depositData.dateCreated || new Date().toISOString(),
      description: existingPendingOrAcceptedUserReport?.description || 'Depósito reportado por usuario, pendiente de validación', // Mantiene desc existente si actualiza
      cbu: depositData.cbu, // Mantenemos el CBU guardado
      idCliente: depositData.idCliente,
      payer_email: depositData.email, // O depositData.email si usas ese campo
      external_reference: depositData.idTransaction, // Referencia al ID del usuario
      office: depositData.idAgent, // <-- GUARDAR idAgent como 'office'
      // reference_transaction y relatedUserTransactionId se mantienen si ya estaban, o se establecen si se encuentra match
    };

    // Si ya existía y estaba Aceptado, no la volvemos a Pendiente
    if (existingPendingOrAcceptedUserReport?.status === 'Aceptado') {
      userDepositTransaction.status = 'Aceptado';
      userDepositTransaction.description = existingPendingOrAcceptedUserReport.description; // No cambiar descripción si ya estaba Aceptado
    } else {
      userDepositTransaction.status = 'Pending'; // Si no existía o era Pending/otro, establecer como Pending
    }


    console.log(`[${opId}] Creando/Actualizando transacción de usuario con estado: ${userDepositTransaction.status} (ID: ${userDepositTransaction.id}) en oficina: ${userDepositTransaction.office}`, userDepositTransaction); // <-- Log office
    // saveTransaction ya actualiza la lista en memoria si la transacción existe, o la añade si es nueva
    const savedUserTransaction = await this.saveTransaction(userDepositTransaction);
    const sameAmountTransactions = pendingMpTransactions.filter(tx =>
      Math.abs(tx.amount - savedUserTransaction.amount) < 0.01
    );

    sameAmountTransactions.forEach(tx => {
      console.log(`[${opId}] DEPURACIÓN: Analizando transacción MP ID: ${tx.id}`);
      console.log(`  - Tipo: ${tx.type === 'deposit' ? 'Depósito ✓' : 'Otro X'}`);
      console.log(`  - Estado: ${tx.status === 'Pendiente' ? 'Pendiente ✓' : tx.status + ' X'}`);
      console.log(`  - Ya usada: ${!tx.relatedUserTransactionId ? 'No ✓' : 'Sí X'}`);
      console.log(`  - Monto: ${tx.amount} (Diff: ${Math.abs(tx.amount - savedUserTransaction.amount)})`);
      console.log(`  - CBU Match: ${this.matchCbuWithMp(tx, savedUserTransaction.cbu) ? 'Sí ✓' : 'No X'}`);
      console.log(`  - Email User: ${savedUserTransaction.payer_email}`);
      console.log(`  - Email MP: ${tx.payer_email}`);
      console.log(`  - Email Match: ${tx.payer_email && savedUserTransaction.payer_email &&
        tx.payer_email.toLowerCase() === savedUserTransaction.payer_email.toLowerCase() ? 'Sí ✓' : 'No X'}`);
      console.log(`  - Fecha cercana: ${tx.date_created && savedUserTransaction.date_created &&
        this.isDateCloseEnough(tx.date_created, savedUserTransaction.date_created) ? 'Sí ✓' : 'No X'}`);
    });


    // Si la transacción del usuario ya estaba Aceptada, no necesitamos buscar un match de nuevo.
    if (savedUserTransaction.status === 'Aceptado') {
      console.log(`[${opId}] Depósito de usuario ${savedUserTransaction.id} ya estaba Aceptado.`);
      return {
        status: 'success',
        message: 'Este depósito ya fue validado.',
        transaction: savedUserTransaction
      };
    }


    // --- INICIO LÓGICA DE BÚSQUEDA INMEDIATA DE PAGO MP ---
    // Ahora buscamos un PAGO MP que matchee (Monto, CBU, Fecha) y no esté usado,
    // para validar el depósito del usuario que acabamos de guardar como Pending.
    // Se elimina el matching por email.
    console.log(`[${opId}] Buscando un pago de Mercado Pago existente (local o API) y sin usar para matchear depósito pendiente ${savedUserTransaction.id} (sin email)...`);

    let matchedMpPayment: Transaction | PaymentData | undefined = undefined;
    let matchedFromApi = false; // Bandera para saber si el match vino de la API

    // Obtenemos un token para poder consultar la API si es necesario.
    // Intentamos usar el token asociado al CBU del usuario si existe, o uno cualquiera si no.
    const tokenForApiSearch = this.getAccessTokenByCbu(savedUserTransaction.cbu) || this.getAllAccessTokens()[0];
    console.log(`[${opId}] Token para búsqueda de pagos MP: ${tokenForApiSearch ? tokenForApiSearch.substring(0, 10) : 'Ninguno disponible'}`);

    // 1. Buscar en las transacciones locales (recibidas previamente por IPN)
    const matchingLocalMpTx = this.transactions.find(mpTx => {
      if (mpTx.id.toString() === savedUserTransaction.id.toString()) {
        return false;
      }
      // Buscamos una transacción que represente un pago de Mercado Pago procesado
      return (
        mpTx.type === 'deposit' && // Es una transacción de tipo 'deposit' (originada por MP IPN)
        (mpTx.status === 'Pending') && // Solo pagos que MP reporta como aprobados/aceptados
        !mpTx.relatedUserTransactionId && // Que NO haya validado ya otro depósito de usuario
        typeof mpTx.amount === 'number' && mpTx.amount > 0 && // Asegurar monto válido en MP Tx
        mpTx.amount === savedUserTransaction.amount && // Mismo monto
        savedUserTransaction.cbu && // Asegurar que el depósito de usuario tiene CBU
        this.matchCbuWithMp(mpTx, savedUserTransaction.cbu) && // El pago de MP llegó a la cuenta del CBU reportado por el usuario
        mpTx.payer_email && savedUserTransaction.payer_email && mpTx.payer_email.toLowerCase() === savedUserTransaction.payer_email.toLowerCase() && // <-- VALIDACIÓN POR EMAIL ELIMINADA
        mpTx.date_created && savedUserTransaction.date_created && // Asegurar que ambas fechas existan
        this.isDateCloseEnough(mpTx.date_created, savedUserTransaction.date_created) // Fecha de creación cercana (del pago MP y del reporte de usuario)
      );
    });

    // En la función validateWithMercadoPago, después de encontrar una coincidencia y 
    // antes de actualizar la transacción MP:

    if (matchingLocalMpTx) {
      matchedMpPayment = matchingLocalMpTx;
      matchedFromApi = false;
      console.log(`[${opId}] Coincidencia encontrada localmente con Pago MP ID: ${matchingLocalMpTx.id}`);

      // 1. Actualizar la transacción MP a "Aceptado"
      await this.updateTransactionStatus(matchedMpPayment.id.toString(), 'Aceptado');

      // 2. Cambiar el depósito externo a "Consolidado" (no "Pending" ni "Aceptado")
      await this.updateTransactionStatus(savedUserTransaction.id.toString(), 'Aceptado');

      // 3. Añadir referencias cruzadas entre ambas transacciones
      await this.updateTransactionInfo(savedUserTransaction.id.toString(), {
        reference_transaction: matchedMpPayment.id.toString(),
        description: `Depósito consolidado en transacción MP ID: ${matchedMpPayment.id}`,
      });

      await this.updateTransactionInfo(matchedMpPayment.id.toString(), {
        relatedUserTransactionId: savedUserTransaction.id.toString(),
        description: `Transacción validada con depósito externo ID: ${savedUserTransaction.id}`
      });

      console.log(`[${opId}] Depósito externo ${savedUserTransaction.id} marcado como Consolidado.`);
      console.log(`[${opId}] Transacción MP ${matchedMpPayment.id} marcada como Aceptado.`);

      // Obtener la transacción MP actualizada para devolverla
      const updatedMpTransaction = await this.getTransactionById(matchedMpPayment.id.toString());

      return {
        status: 'success',
        message: 'Depósito validado y consolidado automáticamente.',
        transaction: updatedMpTransaction
      };
    } else {
      // 2. Si no hay coincidencia local de un pago MP *aprobado y sin usar*, consultar la API de MP
      console.log(`[${opId}] No hay coincidencia local disponible. Consultando API de Mercado Pago para pagos aprobados recientes...`);


      if (tokenForApiSearch) {
        try {
          const response = await axios.get(`https://api.mercadopago.com/v1/payments`, {
            headers: { 'Authorization': `Bearer ${tokenForApiSearch}` },
            // No podemos filtrar por oficina aquí, la API de MP no tiene ese concepto.
            // La validación por CBU/receiver_id en matchCbuWithMp ayudará a limitar los resultados relevantes.
            params: { status: 'approved', limit: 20 }, // Buscar los últimos 20 pagos aprobados
          });

          console.log(`[${opId}] Respuesta de búsqueda en API de Mercado Pago: ${response.data.results.length} resultados.`);

          const apiPayments = response.data.results;
          const matchingApiPayment = apiPayments.find((apiPayment: PaymentData) => {
            // Reusamos la lógica de matching con los datos de la API
            const isMatch = (
              typeof apiPayment.amount === 'number' && apiPayment.amount > 0 && // Asegurar monto válido en API Payment
              apiPayment.amount === savedUserTransaction.amount && // MISMO MONTO
              savedUserTransaction.cbu && // Asegurar que el depósito de usuario tiene CBU
              this.matchCbuWithMp(apiPayment, savedUserTransaction.cbu) && // matchCbuWithMp puede manejar PaymentData
              // apiPayment.payer_email && savedUserTransaction.payer_email && apiPayment.payer_email.toLowerCase() === savedUserTransaction.payer_email.toLowerCase() && // <-- VALIDACIÓN POR EMAIL ELIMINADA
              apiPayment.date_created && savedUserTransaction.date_created && // Asegurar que ambas fechas existan
              this.isDateCloseEnough(apiPayment.date_created, savedUserTransaction.date_created) // FECHA CERCANA
            );

            // Adicionalmente, verificar si este pago de la API ya fue usado localmente para validar
            // Buscamos una transacción local (previamente creada por IPN o API search) con este ID de MP
            // y chequeamos si ya tiene relatedUserTransactionId asignado.
            const existingLocalMpTxWithThisId = this.transactions.find(t => t.id.toString() === apiPayment.id.toString());
            const isAlreadyUsed = existingLocalMpTxWithThisId && existingLocalMpTxWithThisId.relatedUserTransactionId;
            if (isAlreadyUsed) {
              console.log(`[${opId}] Pago MP de API ${apiPayment.id} encontrado, pero ya está marcado como usado localmente.`);
            }


            return isMatch && !isAlreadyUsed; // Solo matchea si cumple criterios Y no ha sido usado ya
          });

          if (matchingApiPayment) {
            matchedMpPayment = matchingApiPayment;
            matchedFromApi = true; // El match vino de la API
            console.log(`[${opId}] Coincidencia encontrada en la API de MP con Pago ID: ${matchingApiPayment.id}`);
          } else {
            console.log(`[${opId}] No se encontraron pagos aprobados recientes en la API de MP que coincidan y no estén usados.`);
          }

        } catch (error) {
          console.error(`[${opId}] Error al consultar la API de MP durante la validación inmediata:`, error.message);
          // Si hay un error en la API, simplemente continuamos sin match inmediato desde API.
        }
      } else {
        console.warn(`[${opId}] No hay tokens de acceso disponibles para consultar la API de MP.`);
      }
    }


    // --- MANEJAR EL RESULTADO DE LA BÚSQUEDA ---
    if (matchedMpPayment) {
      console.log(`[${opId}] ¡Éxito! Procediendo a validar el depósito de usuario ${savedUserTransaction.id} con Pago MP ID: ${matchedMpPayment.id}`);

      // Si encontramos un pago de MP que coincide y no ha sido usado:
      // 1. Actualizar el estado del depósito del usuario a 'Aceptado'
      await this.updateTransactionStatus(savedUserTransaction.id.toString(), 'Aceptado');

      // 2. Establecer la referencia al ID del pago de Mercado Pago en el depósito del usuario
      const updateInfo: any = {
        referenceTransaction: matchedMpPayment.id.toString(), // En la transacción del usuario, guardamos el ID del pago MP (asegurar string)
        description: `Depósito validado automáticamente con MP Pago ID: ${matchedMpPayment.id}`
      };
      // Copiar algunos datos del pago MP a la transacción del usuario si son más precisos o faltan
      if ('payer_id' in matchedMpPayment && matchedMpPayment.payer_id) updateInfo.payerId = matchedMpPayment.payer_id.toString();
      if ('payer_email' in matchedMpPayment && matchedMpPayment.payer_email) updateInfo.payerEmail = matchedMpPayment.payer_email; // Ya debería estar, pero lo aseguramos
      if ('payment_method_id' in matchedMpPayment && matchedMpPayment.payment_method_id) updateInfo.paymentMethodId = matchedMpPayment.payment_method_id;
      // Podrías copiar otros campos relevantes aquí si los necesitas en la transacción del usuario
      // if ('date_approved' in matchedMpPayment) updateInfo.dateApproved = matchedMpPayment.date_approved; // Si tu TransactionEntity tiene dateApproved
      if ('receiver_id' in matchedMpPayment && matchedMpPayment.receiver_id) updateInfo.receiverId = matchedMpPayment.receiver_id.toString(); // Copiar el receiver_id del pago MP

      await this.updateTransactionInfo(savedUserTransaction.id.toString(), updateInfo);

      // 3. Marcar el pago de Mercado Pago como 'usado' si lo encontramos localmente
      //    Si el match fue de la API, la IPN posterior (procesada por handleNotification)
      //    se encargará de marcar la transacción de MP como usada.
      if (!matchedFromApi && 'id' in matchedMpPayment) { // Si el match fue local (ya tenemos el objeto Transaction completo)
        await this.updateTransactionInfo(matchedMpPayment.id.toString(), {
          relatedUserTransactionId: savedUserTransaction.id.toString(), // En la transacción de MP, guardamos el ID del depósito de usuario
          description: (matchedMpPayment.description || '') + ` (Valida depósito usuario ID: ${savedUserTransaction.id})` // Añadir una nota
        });
        console.log(`[${opId}] Pago MP local ID ${matchedMpPayment.id} marcado como usado.`);
      }
      // Si el match fue de la API, la lógica en handleNotification (Paso 4) es crucial
      // para encontrar esta transacción de usuario Aceptada (usando reference_transaction)
      // cuando llegue la IPN para matchedMpPayment.id, y entonces marcar la transacción de MP
      // con relatedUserTransactionId.


      console.log(`[${opId}] Depósito de usuario ${savedUserTransaction.id} marcado como Aceptado al instante.`);

      // Opcional: Emitir un evento WebSocket al usuario
      // this.server.emit('depositValidated', { userId: savedUserTransaction.idCliente, transactionId: savedUserTransaction.id });

      // Retornar el resultado exitoso (el depósito del usuario ya actualizado)
      const updatedUserTransaction = await this.getTransactionById(savedUserTransaction.id.toString()); // Recuperar la versión actualizada
      return {
        status: 'success', // Retorna success porque se encontró el pago y se aceptó
        message: 'Depósito validado automáticamente al instante.',
        transaction: updatedUserTransaction // Devuelve la transacción del usuario Aceptada
      };
    } else {
      console.log(`[${opId}] No se encontró pago de Mercado Pago existente y sin usar coincidente. El depósito ${savedUserTransaction.id} queda PENDING.`);
      // Si no se encontró un pago de MP ya registrado que coincida y no esté usado,
      // el depósito del usuario permanece en PENDING.
      // La validación ocurrirá cuando llegue la IPN de Mercado Pago y la procese handleNotification.

      // Retornar el resultado indicando que queda Pendiente
      // No necesitamos actualizar la transacción aquí, ya se guardó como Pending al inicio.
      return {
        status: 'success', // Retorna success porque el reporte del usuario fue procesado
        message: 'Depósito registrado, pendiente de validación con Mercado Pago.',
        transaction: savedUserTransaction // Devuelve la transacción del usuario Pendiente (tal como se guardó inicialmente)
      };
    }
    // --- FIN LÓGICA DE BÚSQUEDA INMEDIATA ---

    // El antiguo bloque try/catch que consultaba la API de MP y creaba una nueva transacción
    // si no había match local se elimina o comenta, ya que la nueva lógica lo reemplaza.
    // Asegúrate de que no haya código remanente después de este punto que duplique la lógica.

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
        number: withdrawData.name
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
  async getTransactions(officeId?: string): Promise<Transaction[]> { // <-- Aceptar officeId opcional
    console.log(`IpnService: Buscando transacciones${officeId ? ` para oficina ${officeId}` : ''}`);

    // Construir las opciones de búsqueda
    const findOptions: FindManyOptions<TransactionEntity> = {
      order: { dateCreated: 'DESC' }, // Ordenar por fecha descendente
    };

    // Si se proporciona officeId, añadir la condición WHERE directa en el campo 'office'
    // TypeORM automáticamente gestiona { office: officeId } para buscar en la columna 'office'
    if (officeId) {
      findOptions.where = { office: officeId }; // <-- Filtrar DIRECTAMENTE por el campo 'office'
    }
    // Si officeId no se proporciona, findOptions.where será undefined, y find() traerá todo (si se permite a un superadmin por ejemplo)
    // O podrías lanzar un error si officeId es obligatorio siempre:
    // if (!officeId) { throw new Error("Filtering by officeId is required"); }
    // findOptions.where = { office: officeId };

    // Ejecutar la consulta y obtener los resultados
    // TypeORM find() ya devuelve TransactionEntity[]
    const entities = await this.transactionRepository.find(findOptions);

    // Mapear las entidades obtenidas al tipo Transaction si es necesario (si mapEntityToTransaction hace transformaciones)
    // Si solo mapea 1:1, puedes devolver entities directamente si el tipo Transaction es igual a TransactionEntity
    // Asumiendo que mapEntityToTransaction mapea correctamente los campos
    const transactions = entities.map(entity => this.mapEntityToTransaction(entity)); // Mantengo el mapeo

    console.log(`IpnService: Obtenidas ${transactions.length} transacciones` + (officeId ? ` para oficina ${officeId}` : ''));
    return transactions; // Devuelve Transaction[]
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
      // console.log(`mapCbuToMpIdentifier: CBU ${cbu} mapeado a mp_client_id ${account.mp_client_id}`);
      return account.mp_client_id;
    }

    console.warn(`mapCbuToMpIdentifier: No se encontró un identificador mp_client_id configurado para el CBU: ${cbu}`);

    // Mantener el mapeo estático como respaldo si es estrictamente necesario,
    // but it's preferable that all valid CBUs are in the configured accounts.
    const cbuMapping: { [key: string]: string } = {
      // '00010101': 'TU_RECEIVER_ID', // Reemplaza con el receiver_id de tu cuenta MP if not in Accounts
      // Add more mappings based on your accounts if they are not in Accounts
    };
    // return cbuMapping[cbu] || ''; // Si usas el mapeo estático de respaldo
    return ''; // If you ONLY rely on configured accounts
  }

  private isValidCbu(cbu: string, officeId?: string): boolean { // <-- Accept optional officeId
    // For a CBU to be valid for Mercado Pago in this context,
    // it must be configured in one of our active Mercado Pago accounts, AND belong to the specified office (agent).
    if (!cbu) {
      console.warn('isValidCbu: CBU is null or empty.');
      return false;
    }

    console.log(`isValidCbu: Buscando cuenta para CBU ${cbu}${officeId ? ` en oficina ${officeId}` : ''}`); // Log

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
      console.warn(`isValidCbu: No se encontró una cuenta activa de Mercado Pago configurada para el CBU: ${cbu}${officeId ? ` en oficina ${officeId}` : ''}`); // Log
      // You can add a basic CBU format check here if you want,
      // but the main validation is that it corresponds to a configured account in the office.
      return false;
    }

    console.log(`isValidCbu: CBU ${cbu} validado contra cuenta configurada ${account.name} (ID: ${account.id}) en oficina ${account.agent}.`); // Log (usar acc.agent en log también)
    return true;
  }

  // Buscar cuenta por receiver_id de Mercado Pago
  private findAccountByReceiverId(receiverId: string): Account | undefined {
    console.log(`Buscando cuenta para receiver_id: ${receiverId}`);
    console.log("Todas las cuentas disponibles:", this.accounts.map(acc => ({
      id: acc.id,
      name: acc.name,
      agent: acc.agent,
      office: acc.office,
      mp_client_id: acc.mp_client_id,
      receiverId: acc.receiver_id,
    })));

    const receiverIdStr = receiverId.toString();

    this.accounts.forEach(acc => {
      if (acc.receiver_id) {
        console.log(`Verificando cuenta: ${acc.name}, receiver_id: ${acc.receiver_id} (${typeof acc.receiver_id}), 
                    coincide con ${receiverIdStr} (${typeof receiverIdStr}): ${acc.receiver_id.toString() === receiverIdStr}`);
      }
    });

    // Buscar primero directamente por receiver_id en la cuenta
    const accountByDirectMatch = this.accounts.find(account =>
      account.wallet === 'mercadopago' &&
      account.status === 'active' &&
      account.receiver_id && // Verificar que receiver_id existe
      account.receiver_id.toString() === receiverIdStr
    );

    if (accountByDirectMatch) {
      console.log(`Cuenta encontrada por mp_client_id: ${accountByDirectMatch.name} (ID: ${accountByDirectMatch.id})`);
      return accountByDirectMatch;
    }

    // Si no se encuentra por mp_client_id, intentar con el mapeo de CBU
    const accountByMappedCbu = this.accounts.find(account =>
      account.wallet === 'mercadopago' &&
      account.status === 'active' &&
      this.mapCbuToMpIdentifier(account.cbu) === receiverId
    );

    if (accountByMappedCbu) {
      console.log(`Cuenta encontrada por mapeo CBU: ${accountByMappedCbu.name} (ID: ${accountByMappedCbu.id})`);
      return accountByMappedCbu;
    }

    console.log(`No se encontró cuenta para receiver_id: ${receiverId}`);
    return undefined;
  }

  private matchCbuWithMp(transaction: Transaction | PaymentData, cbu: string): boolean {
    // Para depuración
    console.log(`matchCbuWithMp: Verificando coincidencia entre transacción ID: ${transaction.id || 'Sin ID'} y CBU: ${cbu}`);
    console.log(`matchCbuWithMp: Datos de transacción - receiver_id: ${transaction.receiver_id || 'null'}, cbu: ${(transaction as Transaction).cbu || 'null'}`);

    // Casos especiales para transacciones locales (ambas tienen CBU)
    if ((transaction as Transaction).cbu && (transaction as Transaction).cbu === cbu) {
      console.log(`matchCbuWithMp: ¡COINCIDENCIA DIRECTA DE CBU!`);
      return true;
    }

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
}