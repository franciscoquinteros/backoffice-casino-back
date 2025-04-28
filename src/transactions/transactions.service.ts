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
      reference_transaction: entity.referenceTransaction,
      relatedUserTransactionId: entity.relatedUserTransactionId // De entidad a tipo
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
          break;
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
    // console.log('Respuesta completa de la API de Mercado Pago:', JSON.stringify(apiData, null, 2)); // Descomentar para debug completo

    // Determinar la cuenta asociada basada en el receiver_id de MP
    const associatedAccount = this.findAccountByReceiverId(apiData.collector_id || apiData.receiver_id);
    const cbuFromMp = associatedAccount?.cbu; // El CBU asociado a la cuenta receptora en MP

    // Crear o actualizar la transacción local de Mercado Pago
    // Usamos el ID del pago de MP como ID de nuestra transacción
    const existingMpTx = await this.getTransactionById(apiData.id.toString());

    mpTransaction = existingMpTx ? existingMpTx : { id: apiData.id.toString(), type: 'deposit' } as Transaction; // Usar existente o crear base

    // Actualizar datos de la transacción de MP con la info de la API
    mpTransaction.amount = apiData.transaction_amount || 0;
    mpTransaction.status = apiData.status || 'Pending'; // Estado reportado por MP
    mpTransaction.date_created = apiData.date_created;
    mpTransaction.description = apiData.description || 'Pago recibido vía IPN';
    mpTransaction.payment_method_id = apiData.payment_method_id;
    mpTransaction.payer_id = apiData.payer?.id?.toString() || null;
    mpTransaction.payer_email = apiData.payer?.email || null;
    mpTransaction.payer_identification = apiData.payer?.identification || null;
    mpTransaction.external_reference = apiData.external_reference || null;
    mpTransaction.receiver_id = apiData.collector_id?.toString() || apiData.receiver_id?.toString() || null;
    mpTransaction.cbu = cbuFromMp; // Asociar el CBU si se encontró la cuenta

    // Si ya tenía relatedUserTransactionId (porque validateWithMercadoPago lo marcó), mantenerlo
    // mpTransaction.relatedUserTransactionId = existingMpTx?.relatedUserTransactionId || undefined; // Ya se copia si se carga el existente

    // Guardar/Actualizar la transacción de Mercado Pago en nuestra BD
    const savedMpTransaction = await this.saveTransaction(mpTransaction); // mpTransaction ahora es la guardada
    // saveTransaction ya actualiza la lista en memoria

    console.log(`[IPN] ${savedMpTransaction.id}: Transacción de MP guardada/actualizada con estado MP: ${savedMpTransaction.status}.`);

    // --- INICIO LÓGICA DE VALIDACIÓN CRUZADA POR IPN ---
    let matchingUserDeposit: Transaction | undefined = undefined;
    // Solo intentar validar si el pago de MP está APROBADO y aún NO HA SIDO USADO para validar otro depósito
    if ((savedMpTransaction.status === 'approved' || savedMpTransaction.status === 'Aceptado') && !savedMpTransaction.relatedUserTransactionId) {

      console.log(`[IPN] ${savedMpTransaction.id}: Pago APROBADO y no usado. Buscando depósito de usuario PENDIENTE para matchear...`);

      // Buscar un depósito de usuario pendiente (creado por validateWithMercadoPago)
      // que coincida con este pago de MP y que NO HAYA SIDO YA VALIDADO
      const matchingUserDeposit = this.transactions.find(userTx => {
        return (
          userTx.type === 'deposit' && // Debe ser un depósito reportado por el usuario
          userTx.status === 'Pending' && // Busca depósitos reportados por usuario que están pendientes
          !userTx.reference_transaction && // <--- ¡CLAVE! Asegura que este depósito pendiente NO haya sido validado ya por otro pago MP
          userTx.amount === savedMpTransaction.amount && // Mismo monto
          // Verificar que el CBU del depósito de usuario corresponde al receptor del pago MP
          this.matchCbuWithMp(savedMpTransaction, userTx.cbu) && // matchCbuWithMp puede manejar Transaction (MP)
          savedMpTransaction.payer_email && userTx.payer_email && savedMpTransaction.payer_email.toLowerCase() === userTx.payer_email.toLowerCase() && // Mismo email del pagador (ignorando mayúsculas/minúsculas)
          this.isDateCloseEnough(savedMpTransaction.date_created, userTx.date_created) // Fecha de creación cercana (del pago MP y del reporte de usuario)
        );
      });

      if (matchingUserDeposit) {
        console.log(`[IPN] ${savedMpTransaction.id}: ¡Coincidencia encontrada vía IPN! Validando depósito de usuario ID: ${matchingUserDeposit.id}`);

        // Si encontramos un depósito pendiente de usuario que coincide:
        // 1. Actualizar el estado del depósito del usuario a 'Aceptado'
        await this.updateTransactionStatus(matchingUserDeposit.id.toString(), 'Aceptado');

        // 2. Establecer la referencia al ID del pago de Mercado Pago en el depósito del usuario
        await this.updateTransactionInfo(matchingUserDeposit.id.toString(), {
          referenceTransaction: savedMpTransaction.id.toString(), // En el depósito del usuario, guardamos el ID del pago MP
          description: `Depósito validado automáticamente con MP Pago ID: ${savedMpTransaction.id} (vía IPN)`
          // Opcional: Copiar datos del MP Tx si son más precisos
          // payerId: savedMpTransaction.payer_id, // Ya debería estar copiado si vino de MP
          // paymentMethodId: savedMpTransaction.payment_method_id, // Ya debería estar copiado si vino de MP
        });

        // 3. Marcar el pago de Mercado Pago (savedMpTransaction) como 'usado'
        await this.updateTransactionInfo(savedMpTransaction.id.toString(), {
          relatedUserTransactionId: matchingUserDeposit.id.toString(), // En el pago de MP, guardamos el ID del depósito de usuario que lo validó
          description: (savedMpTransaction.description || '') + ` (Valida depósito usuario ID: ${matchingUserDeposit.id})` // Añadir una nota
        });

        console.log(`[IPN] ${savedMpTransaction.id}: Depósito de usuario ID ${matchingUserDeposit.id} marcado como Aceptado.`);

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

  private mapCbuToMpIdentifier(cbu: string): string {
    // Buscar en la lista de cuentas configuradas
    // Asegurarse de que la cuenta esté activa, sea de mercadopago y tenga mp_client_id
    const account = this.accounts.find(acc =>
      acc.cbu === cbu &&
      acc.wallet === 'mercadopago' &&
      acc.status === 'active' &&
      acc.mp_client_id // Asegurar que el campo necesario para el mapeo exista
    );

    if (account?.mp_client_id) {
      // console.log(`mapCbuToMpIdentifier: CBU ${cbu} mapeado a mp_client_id ${account.mp_client_id}`);
      return account.mp_client_id;
    }

    console.warn(`mapCbuToMpIdentifier: No se encontró un identificador mp_client_id configurado para el CBU: ${cbu}`);

    // Mantener el mapeo estático como respaldo si es estrictamente necesario,
    // pero es preferible que todos los CBU válidos estén en las cuentas configuradas.
    const cbuMapping: { [key: string]: string } = {
      // '00010101': 'TU_RECEIVER_ID', // Reemplaza con el receiver_id de tu cuenta MP si no está en Accounts
      // Agrega más mapeos según tus cuentas si no están en Accounts
    };
    // return cbuMapping[cbu] || ''; // Si usas el mapeo estático de respaldo
    return ''; // Si SOLO dependes de las cuentas configuradas
  }

  private isValidCbu(cbu: string): boolean {
    // Para que un CBU sea válido para Mercado Pago en este contexto,
    // debe estar configurado en una de nuestras cuentas activas de tipo mercadopago.
    if (!cbu) {
      console.warn('isValidCbu: CBU es nulo o vacío.');
      return false;
    }

    const account = this.accounts.find(acc =>
      acc.cbu === cbu &&
      acc.wallet === 'mercadopago' &&
      acc.status === 'active' && // Solo considerar cuentas activas
      acc.mp_client_id // Asegurarse de que tenga el ID de cliente MP necesario para mapeo
    );

    if (!account) {
      console.warn(`isValidCbu: No se encontró una cuenta activa de Mercado Pago configurada para el CBU: ${cbu}`);
      // Puedes añadir aquí una verificación de formato básico de CBU si lo deseas,
      // pero la validación principal es que corresponda a una cuenta configurada.
      return false;
    }

    console.log(`isValidCbu: CBU ${cbu} validado contra cuenta configurada ${account.name} (ID: ${account.id}).`);
    return true;
  }

  // Buscar cuenta por receiver_id de Mercado Pago
  private findAccountByReceiverId(receiverId: string): Account | undefined {
    return this.accounts.find(account =>
      account.wallet === 'mercadopago' &&
      (this.mapCbuToMpIdentifier(account.cbu) === receiverId ||
        account.mp_client_id === receiverId)
    );
  }

  private matchCbuWithMp(transaction: Transaction | PaymentData, cbu: string): boolean {
    // Asegurarse de que la transacción tenga los campos necesarios
    if (!('receiver_id' in transaction) || !transaction.receiver_id) {
      // console.warn('matchCbuWithMp: Transacción no tiene receiver_id.');
      return false;
    }

    // El payment_method_id no es estrictamente necesario para el matcheo CBU vs receiver_id,
    // pero la lógica original lo incluía. Mantengámoslo si es parte del requisito.
    // if (!transaction.payment_method_id) return false; // Depende de si siempre esperas payment_method_id

    // Asegurarse de que el CBU del usuario sea válido
    if (!cbu) {
      // console.warn('matchCbuWithMp: CBU del usuario es nulo o vacío.');
      return false;
    }

    const mappedCbuIdentifier = this.mapCbuToMpIdentifier(cbu);

    // Si no pudimos mapear el CBU a un identificador de MP, no puede haber coincidencia
    if (!mappedCbuIdentifier) {
      // console.warn(`matchCbuWithMp: No se pudo mapear CBU ${cbu} a identificador de MP.`);
      return false;
    }




    // Lógica de coincidencia: El identificador de MP del CBU debe coincidir con el receiver_id de la transacción de MP
    const receiverIdMatch = mappedCbuIdentifier === transaction.receiver_id;

    // Lógica adicional si el payment_method_id es 'cvu' (como estaba en tu código original)
    // Esto podría ser redundante si el mapeo CBU -> receiver_id ya es suficiente.
    // Lo mantengo como estaba, pero considera si esta parte es realmente necesaria para CVUs.
    const cvuCheck = transaction.payment_method_id === 'cvu' && (transaction as Transaction).type === 'deposit'; // Asegurarse que solo aplica a depósitos de tipo Transaction


    const isMatch = receiverIdMatch || cvuCheck;

    // if (isMatch) {
    //    console.log(`matchCbuWithMp: CBU ${cbu} (mapeado a ${mappedCbuIdentifier}) matchea con receiver_id ${transaction.receiver_id} (o check CVU).`);
    // } else {
    //    console.log(`matchCbuWithMp: CBU ${cbu} (mapeado a ${mappedCbuIdentifier}) NO matchea con receiver_id ${transaction.receiver_id}.`);
    // }


    return isMatch;
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
      idTransferencia: depositData.idTransaction || `deposit_${Date.now()}`, // Usar idTransaction como idTransferencia
      dateCreated: depositData.dateCreated,
      email: depositData.email,
    };

    // VALIDACIÓN DE CBU (Mantener)
    if (!this.isValidCbu(depositToValidate.cbu)) {
      console.warn(`[${opId}] Validación de CBU fallida: ${depositToValidate.cbu}`);
      // Opcional: Crear transacción 'Rechazado' por CBU inválido
      return { status: 'error', message: 'incorrect CBU', transaction: null }; // Devolver error si el CBU no es válido antes de crear la transacción
    }

    // VERIFICAR SI EL idTransferencia (ID DEL USUARIO) YA EXISTE EN NUESTRO SISTEMA
    const existingUserReport = await this.getTransactionById(depositToValidate.idTransferencia);
    if (existingUserReport) {
      console.log(`[${opId}] El ID de transferencia ${depositToValidate.idTransferencia} ya existe. Devolviendo información existente.`);
      // Devolver la transacción existente en lugar de crear una nueva
      return {
        status: existingUserReport.status === 'Aceptado' ? 'success' : 'pending', // Ajustar el status de la respuesta
        message: existingUserReport.status === 'Aceptado' ? 'Este depósito ya fue validado.' : 'Este depósito ya está registrado y pendiente.',
        transaction: existingUserReport
      };
    }


    // Crear la transacción DEL USUARIO y guardarla en BD inmediatamente con estado PENDING
    const userDepositTransaction: Transaction = {
      id: depositToValidate.idTransferencia, // Usamos el ID proporcionado por el usuario
      type: 'deposit',
      amount: depositToValidate.amount,
      status: 'Pending', // Inicialmente siempre es Pendiente al reportar el usuario
      date_created: depositToValidate.dateCreated || new Date().toISOString(),
      description: 'Depósito reportado por usuario, pendiente de validación',
      cbu: depositToValidate.cbu,
      idCliente: depositData.idCliente,
      payer_email: depositData.email,
      external_reference: depositData.idTransaction, // Referencia al ID del usuario
      // Los campos reference_transaction y relatedUserTransactionId se establecen si se encuentra un match
    };

    console.log(`[${opId}] Creando transacción de usuario con estado inicial PENDING:`, userDepositTransaction);
    // saveTransaction ya actualiza la lista en memoria si la transacción existe, o la añade si es nueva
    const savedUserTransaction = await this.saveTransaction(userDepositTransaction);


    // --- INICIO LÓGICA DE BÚSQUEDA INMEDIATA DE PAGO MP ---
    console.log(`[${opId}] Buscando un pago de Mercado Pago existente (local o API) y sin usar para matchear...`);

    let matchedMpPayment: Transaction | PaymentData | undefined = undefined;
    let matchedFromApi = false; // Bandera para saber si el match vino de la API


    // 1. Buscar en las transacciones locales (recibidas previamente por IPN)
    const matchingLocalMpTx = this.transactions.find(mpTx => {
      // Buscamos una transacción que represente un pago de Mercado Pago procesado
      return (
        mpTx.type === 'deposit' && // Es una transacción de tipo 'deposit' (originada por MP IPN)
        // NOTA: mpTx.status aquí es el status reportado por Mercado Pago ('approved', 'pending', etc.)
        (mpTx.status === 'Aceptado' || mpTx.status === 'approved') && // Solo pagos que MP reporta como aprobados/aceptados
        !mpTx.relatedUserTransactionId && // <--- ¡CLAVE! Que NO haya validado ya otro depósito de usuario
        mpTx.amount === savedUserTransaction.amount && // Mismo monto que el depósito del usuario
        this.matchCbuWithMp(mpTx, savedUserTransaction.cbu) && // El pago de MP llegó a la cuenta del CBU reportado por el usuario
        mpTx.payer_email && savedUserTransaction.payer_email && mpTx.payer_email.toLowerCase() === savedUserTransaction.payer_email.toLowerCase() && // Mismo email del pagador (ignorando mayúsculas/minúsculas)
        this.isDateCloseEnough(mpTx.date_created, savedUserTransaction.date_created) // Fecha de creación cercana (dentro de la tolerancia)
      );
    });

    if (matchingLocalMpTx) {
      matchedMpPayment = matchingLocalMpTx;
      matchedFromApi = false; // El match vino de la lista local en memoria
      console.log(`[${opId}] Coincidencia encontrada localmente con Pago MP ID: ${matchingLocalMpTx.id}`);

    } else {
      // 2. Si no hay coincidencia local de un pago MP *aprobado y sin usar*, consultar la API de MP
      console.log(`[${opId}] No hay coincidencia local disponible. Consultando API de Mercado Pago para pagos aprobados recientes...`);
      const tokenToUse = this.getAccessTokenByCbu(savedUserTransaction.cbu) || this.getAllAccessTokens()[0];

      if (tokenToUse) {
        try {
          const response = await axios.get(`https://api.mercadopago.com/v1/payments`, {
            headers: { 'Authorization': `Bearer ${tokenToUse}` },
            // Buscamos los últimos pagos aprobados. El limite puede ajustarse.
            // Se podría añadir `external_reference` o algún otro filtro si Mercado Pago lo soporta y es relevante.
            params: { status: 'approved', limit: 20 }, // Aumentado el límite por si acaso
          });

          console.log(`[${opId}] Respuesta de búsqueda en API de Mercado Pago: ${response.data.results.length} resultados.`);

          const apiPayments = response.data.results;
          const matchingApiPayment = apiPayments.find((apiPayment: PaymentData) => {
            // Reusamos la lógica de matching con los datos de la API
            const isMatch = (
              apiPayment.amount === savedUserTransaction.amount &&
              this.matchCbuWithMp(apiPayment, savedUserTransaction.cbu) && // matchCbuWithMp puede manejar PaymentData
              apiPayment.payer_email && savedUserTransaction.payer_email && apiPayment.payer_email.toLowerCase() === savedUserTransaction.payer_email.toLowerCase() &&
              this.isDateCloseEnough(apiPayment.date_created, savedUserTransaction.date_created)
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
        referenceTransaction: matchedMpPayment.id, // En la transacción del usuario, guardamos el ID del pago MP
        description: `Depósito validado automáticamente con MP Pago ID: ${matchedMpPayment.id}`
      };
      // Copiar algunos datos del pago MP a la transacción del usuario si son más precisos o faltan
      if ('payer_id' in matchedMpPayment && matchedMpPayment.payer_id) updateInfo.payerId = matchedMpPayment.payer_id.toString();
      if ('payer_email' in matchedMpPayment && matchedMpPayment.payer_email) updateInfo.payerEmail = matchedMpPayment.payer_email; // Ya debería estar, pero lo aseguramos
      if ('payment_method_id' in matchedMpPayment && matchedMpPayment.payment_method_id) updateInfo.paymentMethodId = matchedMpPayment.payment_method_id;
      // Podrías copiar otros campos relevantes aquí si los necesitas en la transacción del usuario
      // if ('date_approved' in matchedMpPayment) updateInfo.dateApproved = matchedMpPayment.date_approved; // Si tu TransactionEntity tiene dateApproved

      await this.updateTransactionInfo(savedUserTransaction.id.toString(), updateInfo);

      // 3. Marcar el pago de Mercado Pago como 'usado' si lo encontramos localmente
      //    Si el match fue de la API, la IPN posterior (procesada por handleNotification)
      //    se encargará de marcar la transacción de MP como usada.
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





  private isDateCloseEnough(date1: string | undefined, date2: string | undefined): boolean {
    if (!date1 || !date2) return false;
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffMs = Math.abs(d1.getTime() - d2.getTime());
    const diffHours = diffMs / (1000 * 60 * 60); // Diferencia en horas
    return diffHours <= 24; // Tolerancia de 24 horas para transferencias
  }
}
