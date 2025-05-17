import {
  Controller,
  Get,
  Post,
  Param,
  HttpException,
  HttpStatus,
  UseGuards,
  ForbiddenException, // <--- Añadido para error de permisos
  Req, // <--- Añadido para acceder a request.user
  BadRequestException
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBearerAuth, // <--- Añadido para documentar autenticación Bearer en Swagger
  ApiParam
} from '@nestjs/swagger';
import { Request } from 'express'; // <-- Importar Request de express
import { IpnService } from './transactions.service';
import { Transaction, TransactionDto } from './transaction.types';
import axios from 'axios';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // <-- Importar tu guard de JWT

// --- ¡IMPORTANTE! Reemplaza 'JwtAuthGuard' con el nombre real de tu Guard ---
// Este Guard debe validar el token/credencial y adjuntar el usuario
// autenticado (incluyendo su oficina real) a request.user

// Interfaz que describe la estructura esperada en request.user DESPUÉS de que el Guard lo procese
interface AuthenticatedUser {
  id: string | number; // ID del usuario autenticado
  office: string;      // La oficina REAL a la que pertenece el usuario (del token/BD)
  email?: string;      // Email del usuario (opcional)
  username?: string;   // Nombre de usuario (opcional)
  role?: string;       // Rol del usuario (opcional)
  // roles?: string[]; // Opcional: Roles para permisos más detallados
}

// Extiende la interfaz Request de Express para incluir nuestro usuario tipado
interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

@ApiTags('Transactions')
@Controller('transactions')
@UseGuards(JwtAuthGuard) // <--- APLICADO A NIVEL DE CLASE
@ApiBearerAuth()        // <--- APLICADO A NIVEL DE CLASE (para Swagger)
export class TransactionsController {
  private processingTransactions = new Set<string>();
  constructor(private readonly ipnService: IpnService) { }

  /**
   * Obtiene transacciones para una oficina específica (ID en la ruta).
   * Requiere autenticación y verifica que el usuario autenticado
   * pertenezca a la oficina solicitada en la ruta.
   */
  @Get(':officeId') // <--- CAMBIO: Recibe officeId como parámetro de ruta
  @ApiOperation({ summary: 'Get transactions for a specific office ID (from path)' })
  @ApiParam({ name: 'officeId', required: true, description: 'ID of the office to fetch transactions for', type: String }) // <--- Documenta el path param
  @ApiResponse({ status: 200, description: 'List of transactions for the specified office', type: [TransactionDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Forbidden - User cannot access this office' })
  @ApiResponse({ status: 404, description: 'Office ID format might be invalid or resource not found conceptually' }) // 404 si el ID no es válido o no existe lógica asociada
  async getTransactions(
    @Param('officeId') requestedOfficeId: string, // <--- CAMBIO: Recibe de @Param
    @Req() request: RequestWithUser             // Necesitamos el request para la autorización
  ): Promise<Transaction[]> {

    // 1. Validar parámetro de ruta (opcional pero bueno)
    if (!requestedOfficeId || typeof requestedOfficeId !== 'string' || requestedOfficeId.trim() === '') {
      // Puedes añadir validaciones más específicas si el ID tiene un formato
      throw new BadRequestException('Valid officeId path parameter is required');
    }
    const officeIdFromPath = requestedOfficeId.trim(); // Usar versión limpia

    // 2. Obtener usuario autenticado (poblado por JwtAuthGuard)
    const authenticatedUser = request.user;
    if (!authenticatedUser || !authenticatedUser.office) {
      console.error(`[getTransactions/:officeId] Error: User authenticated but missing office data.`);
      throw new ForbiddenException('User authentication data is incomplete.');
    }
    const userId = authenticatedUser.id;
    const userOffice = authenticatedUser.office; // Oficina REAL del usuario

    // 3. AUTORIZACIÓN: Comparar oficina real con la solicitada en la RUTA
    if (userOffice !== officeIdFromPath) {
      // Opcional: Lógica para rol 'admin'
      // if (!authenticatedUser.roles?.includes('admin')) {
      console.warn(`[getTransactions/:officeId] Forbidden: User ${userId} (Office: ${userOffice}) attempted to access office ${officeIdFromPath} via path.`);
      throw new ForbiddenException(`You do not have permission to access transactions for office ${officeIdFromPath}.`);
      // }
    }

    // 4. Si la autorización es exitosa, obtener y devolver las transacciones
    console.log(`[TransactionsController] getTransactions/:officeId: User ${userId} fetching transactions for allowed officeId: ${officeIdFromPath}`);
    // Usamos el ID validado de la ruta para filtrar
    const transactions = await this.ipnService.getTransactions(officeIdFromPath);
    console.log(`Transacciones devueltas (filtradas por oficina ${officeIdFromPath} desde path):`, transactions.length);

    if (transactions.length > 0) {
      console.log('Propiedades disponibles:', Object.keys(transactions[0]));
      console.log('Valor de external_reference:', transactions[0].external_reference || null);
    }

    return transactions;
  }

  /**
   * Acepta una transacción de depósito específica.
   * Requiere autenticación y verifica que el usuario autenticado
   * pertenezca a la misma oficina que la transacción.
   */
  @Post('/deposit/:id/accept')
  @ApiOperation({ summary: 'Accept a specific deposit transaction' })
  @ApiResponse({ status: 200, description: 'Transaction accepted successfully', /* type: TransactionResponseDto */ }) // Define un DTO de respuesta si quieres
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - User cannot modify transactions for this office' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 409, description: 'Transaction already processed or currently being processed' })
  @ApiResponse({ status: 500, description: 'Proxy processing error or internal server error' })
  async acceptDeposit(
    @Param('id') transactionId: string, // ID de la transacción a aceptar
    @Req() request: RequestWithUser
  ): Promise<{ status: string; message: string; transaction: Transaction }> {
    const opId = `accept_deposit_${transactionId}_${Date.now()}`;
    const userId = request.user?.id;
    const userOffice = request.user?.office; // Oficina REAL del usuario
    console.log(`[${opId}] INICIO: User ${userId} (Office: ${userOffice}) attempting to accept deposit ID: ${transactionId}`);

    // Verificar concurrencia
    if (!userOffice) { throw new ForbiddenException('User office information is missing.'); }
    if (this.processingTransactions.has(transactionId)) { /*...*/ }
    this.processingTransactions.add(transactionId);

    try {
      // 1. Obtener la transacción por su ID
      const originalTransaction = await this.ipnService.getTransactionById(transactionId);
      if (!originalTransaction) { /*...*/ throw new HttpException('Not Found', HttpStatus.NOT_FOUND); }
      const transactionOffice = originalTransaction.office; // Oficina de la transacción

      // 2. AUTORIZACIÓN: Comparar oficina del usuario con la de la transacción
      if (!transactionOffice) { throw new ForbiddenException('Transaction is not assigned to an office.'); }
      if (userOffice !== transactionOffice) {
        // if (!request.user.roles?.includes('admin')) {
        console.warn(`[${opId}] FORBIDDEN: User ${userId} (Office: ${userOffice}) attempted action on transaction ${transactionId} from office ${transactionOffice}.`);
        throw new ForbiddenException(`Forbidden action on transaction from office ${transactionOffice}.`);
        // }
      }
      console.log(`[${opId}] AUTHORIZED: User ${userId} on transaction ${transactionId} in office ${transactionOffice}.`);

      // 3. Verificar estado previo
      if (originalTransaction.status === 'Aceptado') {
        console.log(`[${opId}] INFO: Transaction ${transactionId} was already accepted.`);
        return { status: 'success', message: 'Transaction already accepted', transaction: originalTransaction };
      }
      if (originalTransaction.status !== 'Pending' && originalTransaction.status !== 'Error' && originalTransaction.status !== 'Processing') {
        // Ajusta los estados desde los que se puede aceptar (ej: quizás desde 'Error' sí se puede reintentar)
        console.warn(`[${opId}] CONFLICT: Cannot accept transaction ${transactionId} from current status: ${originalTransaction.status}`);
        throw new HttpException(`Cannot accept transaction from status: ${originalTransaction.status}`, HttpStatus.CONFLICT);
      }

      // 4. Marcar como 'Processing' (si tu lógica lo requiere)
      // const processingTransaction = await this.ipnService.updateTransactionStatus(id, 'Processing');
      // Usaremos originalTransaction para los datos del proxy, pero actualizaremos al final
      const processingTransaction = originalTransaction; // Datos para el proxy
      console.log(`[${opId}] Transaction ${transactionId} ready for proxy. Amount: ${processingTransaction.amount}`);


      // 5. Lógica de envío al Proxy
      try {
        const proxyPayload = {
          user_id: parseInt(processingTransaction.idCliente?.toString() || '0', 10), // Manejar posible null/undefined
          amount: processingTransaction.amount,
          transaction_id: processingTransaction.id.toString()
        };

        if (!proxyPayload.user_id || typeof proxyPayload.amount !== 'number' || !proxyPayload.transaction_id) {
          console.error(`[${opId}] BAD REQUEST: Incomplete data for proxy payload: ${JSON.stringify(proxyPayload)}`);
          // No revertimos estado aquí, ya que no se cambió aún, pero lanzamos error
          throw new HttpException('Incomplete transaction data for proxy processing', HttpStatus.BAD_REQUEST);
        }
        console.log(`[${opId}] Sending to proxy, payload:`, JSON.stringify(proxyPayload));
        const proxyResponse = await axios.post('http://18.216.231.42:8080/deposit', proxyPayload);
        console.log(`[${opId}] Proxy response received:`, JSON.stringify(proxyResponse.data));

        // 6. Procesar respuesta del Proxy y actualizar estado final
        if (proxyResponse.data?.status === 0) {
          console.log(`[${opId}] SUCCESS: Proxy accepted. Updating transaction ${transactionId} status to Aceptado.`);
          const updatedTransaction = await this.ipnService.updateTransactionStatus(transactionId, 'Aceptado');

          // Actualizar descripción con el usuario que aceptó manualmente
          const username = request.user?.username || request.user?.email || request.user?.id?.toString() || 'usuario';
          await this.ipnService.updateTransactionDescription(transactionId, `Aceptado manual por ${username}`);

          // Guardar info adicional si es necesario
          if (proxyResponse.data.result?.new_balance) {
            await this.ipnService.updateTransactionInfo(transactionId, { externalBalance: proxyResponse.data.result.new_balance });
          }
          console.log(`[${opId}] FIN: Transaction ${transactionId} accepted successfully.`);
          return { status: 'success', message: 'Transaction accepted and processed', transaction: updatedTransaction! }; // '!' porque sabemos que se actualizó
        } else {
          const errorMsg = proxyResponse.data?.error_message || 'Unknown proxy error';
          console.error(`[${opId}] ERROR: Proxy rejected transaction ${transactionId}. Reason: ${errorMsg}`);
          await this.ipnService.updateTransactionStatus(transactionId, 'Error'); // Marcar como error nuestro
          await this.ipnService.updateTransactionDescription(transactionId, `Proxy Error: ${errorMsg}`);
          throw new HttpException(`Proxy processing failed: ${errorMsg}`, HttpStatus.INTERNAL_SERVER_ERROR); // O BAD_GATEWAY si prefieres
        }
      } catch (error) {
        console.error(`[${opId}] ERROR: Failed communication with proxy for transaction ${transactionId}:`, error.message);
        // Revertir a 'Error' o 'Pending' según prefieras si falla la comunicación
        await this.ipnService.updateTransactionStatus(transactionId, 'Error');
        const commErrorMsg = error.response?.data?.message || error.message || 'Proxy communication failed';
        await this.ipnService.updateTransactionDescription(transactionId, `Proxy Comm Error: ${commErrorMsg}`);

        if (axios.isAxiosError(error)) {
          console.error(`[${opId}] Axios error details:`, error.response?.status, error.response?.data);
          throw new HttpException(`Proxy communication error: ${commErrorMsg}`, error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR);
        } else {
          throw new HttpException(`Internal error processing transaction: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
        }
      }

    } finally {
      // Asegura liberar el lock de procesamiento
      this.processingTransactions.delete(transactionId);
      console.log(`[${opId}] FINALLY: Removed processing lock for transaction ${transactionId}.`);
    }
  }

  /**
   * Rechaza una transacción de depósito específica.
   * Requiere autenticación y verifica que el usuario autenticado
   * pertenezca a la misma oficina que la transacción.
   */
  @Post('/deposit/:id/reject')
  @ApiBearerAuth()        // <-- Documenta en Swagger
  @ApiOperation({ summary: 'Reject a specific deposit transaction' })
  @ApiResponse({ status: 200, description: 'Transaction rejected successfully', /* type: TransactionResponseDto */ })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - User cannot modify transactions for this office' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 409, description: 'Transaction already processed' }) // Si ya está aceptada/rechazada
  async rejectDeposit(
    @Param('id') id: string,
    @Req() request: RequestWithUser
  ): Promise<{ status: string; message: string; transaction: Transaction }> {
    const opId = `reject_deposit_${id}_${Date.now()}`;
    const userId = request.user?.id;
    console.log(`[${opId}] INICIO: User ${userId} attempting to reject deposit ID: ${id}`);

    // 1. Obtener la transacción
    const originalTransaction = await this.ipnService.getTransactionById(id);
    if (!originalTransaction) {
      console.error(`[${opId}] NOT FOUND: Transaction ${id} not found.`);
      throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);
    }
    console.log(`[${opId}] Original transaction found: Status ${originalTransaction.status}, Office ${originalTransaction.office}`);

    // 2. AUTORIZACIÓN: Verificar oficina
    const userOffice = request.user?.office;
    const transactionOffice = originalTransaction.office;
    if (!userOffice) { throw new ForbiddenException('User office information is missing.'); }
    if (!transactionOffice) { throw new ForbiddenException('Transaction is not assigned to an office.'); }
    if (userOffice !== transactionOffice) {
      // if (!request.user.roles?.includes('admin')) {
      console.warn(`[${opId}] FORBIDDEN: User ${userId} (Office: ${userOffice}) attempted to reject transaction ${id} from office ${transactionOffice}.`);
      throw new ForbiddenException(`You do not have permission to modify transactions for office ${transactionOffice}.`);
      // }
    }
    console.log(`[${opId}] AUTHORIZED: User ${userId} is allowed to modify transaction ${id} in office ${transactionOffice}.`);

    // 3. Verificar estado previo (no rechazar si ya está Aceptado)
    if (originalTransaction.status === 'Aceptado') {
      console.warn(`[${opId}] CONFLICT: Cannot reject transaction ${id} because it is already 'Aceptado'.`);
      throw new HttpException(`Cannot reject transaction, it is already accepted.`, HttpStatus.CONFLICT);
    }
    if (originalTransaction.status === 'Rechazado') {
      console.log(`[${opId}] INFO: Transaction ${id} was already rejected.`);
      return { status: 'success', message: 'Transaction already rejected', transaction: originalTransaction };
    }
    // Considera si puedes rechazar desde 'Processing' o 'Error'

    // 4. Actualizar estado a 'Rechazado'
    console.log(`[${opId}] Updating transaction ${id} status to Rechazado.`);
    const updatedTransaction = await this.ipnService.updateTransactionStatus(id, 'Rechazado');

    // Actualizar descripción con el usuario que rechazó manualmente
    const username = request.user?.username || request.user?.email || request.user?.id?.toString() || 'usuario';
    await this.ipnService.updateTransactionDescription(id, `Rechazado manualmente por ${username}`);

    console.log(`[${opId}] FIN: Transaction ${id} rejected successfully.`);
    return {
      status: 'success',
      message: 'Transaction rejected successfully',
      transaction: updatedTransaction!
    };
  }

  // --- Métodos para Withdraw ---
  // Aplicar la misma lógica de @UseGuards, @ApiBearerAuth, @Req, y AUTORIZACIÓN por oficina

  /**
   * Rechaza una transacción de retiro específica.
   * (Aplicar misma lógica de autorización que rejectDeposit)
   */
  @Post('/withdraw/:id/reject')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject a specific withdraw transaction' })
  // ... (ApiResponses) ...
  async rejectWithdraw(
    @Param('id') id: string,
    @Req() request: RequestWithUser
  ): Promise<{ status: string; message: string; transaction: Transaction }> {
    const opId = `reject_withdraw_${id}_${Date.now()}`;
    const userId = request.user?.id;
    console.log(`[${opId}] INICIO: User ${userId} attempting to reject withdraw ID: ${id}`);

    // 1. Obtener Transacción & Validar Existencia
    const originalTransaction = await this.ipnService.getTransactionById(id);
    if (!originalTransaction) { /*...*/ throw new HttpException('Not Found', HttpStatus.NOT_FOUND); }

    // 2. Autorización por Oficina
    const userOffice = request.user?.office;
    const transactionOffice = originalTransaction.office;
    if (!userOffice || !transactionOffice || userOffice !== transactionOffice /* && !isAdmin */) {
      console.warn(`[${opId}] FORBIDDEN: User ${userId} (Office: ${userOffice}) attempted action on transaction ${id} from office ${transactionOffice}.`);
      throw new ForbiddenException(`Forbidden action on transaction from office ${transactionOffice}.`);
    }
    console.log(`[${opId}] AUTHORIZED: User ${userId} on transaction ${id} in office ${transactionOffice}.`);


    // 3. Validar Estado Previo
    if (originalTransaction.status === 'Aceptado') { /*...*/ throw new HttpException('Already accepted', HttpStatus.CONFLICT); }
    if (originalTransaction.status === 'Rechazado') { /*...*/ return { status: 'success', message: 'Already rejected', transaction: originalTransaction }; }

    // 4. Actualizar Estado
    const updatedTransaction = await this.ipnService.updateTransactionStatus(id, 'Rechazado');

    // Actualizar descripción con el usuario que rechazó manualmente
    const username = request.user?.username || request.user?.email || request.user?.id?.toString() || 'usuario';
    await this.ipnService.updateTransactionDescription(id, `Rechazado manualmente por ${username}`);

    console.log(`[${opId}] FIN: Withdraw ${id} rejected successfully.`);
    return { status: 'success', message: 'Withdraw rejected successfully', transaction: updatedTransaction! };
  }

  /**
   * Acepta una transacción de retiro específica.
   * (Aplicar misma lógica de autorización que acceptDeposit)
   */
  @Post('/withdraw/:id/accept')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept a specific withdraw transaction' })
  // ... (ApiResponses) ...
  async acceptWithdraw(
    @Param('id') id: string,
    @Req() request: RequestWithUser
  ): Promise<{ status: string; message: string; transaction: Transaction }> {
    const opId = `accept_withdraw_${id}_${Date.now()}`;
    const userId = request.user?.id;
    console.log(`[${opId}] INICIO: User ${userId} attempting to accept withdraw ID: ${id}`);

    // Verificar concurrencia
    if (this.processingTransactions.has(id)) { /*...*/ throw new HttpException('Processing', HttpStatus.CONFLICT); }
    this.processingTransactions.add(id);

    try { // Bloque finally
      // 1. Obtener Transacción & Validar Existencia
      const originalTransaction = await this.ipnService.getTransactionById(id);
      if (!originalTransaction) { /*...*/ throw new HttpException('Not Found', HttpStatus.NOT_FOUND); }

      // 2. Autorización por Oficina
      const userOffice = request.user?.office;
      const transactionOffice = originalTransaction.office;
      if (!userOffice || !transactionOffice || userOffice !== transactionOffice /* && !isAdmin */) {
        console.warn(`[${opId}] FORBIDDEN: User ${userId} (Office: ${userOffice}) attempted action on transaction ${id} from office ${transactionOffice}.`);
        throw new ForbiddenException(`Forbidden action on transaction from office ${transactionOffice}.`);
      }
      console.log(`[${opId}] AUTHORIZED: User ${userId} on transaction ${id} in office ${transactionOffice}.`);

      // 3. Validar Estado Previo
      if (originalTransaction.status === 'Aceptado') { /*...*/ return { status: 'success', message: 'Already accepted', transaction: originalTransaction }; }
      if (originalTransaction.status === 'Rechazado') { /*...*/ throw new HttpException('Already rejected', HttpStatus.CONFLICT); }
      if (originalTransaction.status !== 'Pending' && originalTransaction.status !== 'Error' /*...*/) {
        throw new HttpException(`Cannot accept from status: ${originalTransaction.status}`, HttpStatus.CONFLICT);
      }

      // 4. Marcar como 'Processing' (si aplica)
      // const processingTransaction = await this.ipnService.updateTransactionStatus(id, 'Processing');
      const processingTransaction = originalTransaction; // Usar datos originales para proxy

      // 5. Lógica de envío al Proxy de Retiros
      try {
        // Mapear Payload para el proxy de retiros - SIMPLIFICADO como en acceptDeposit
        const proxyPayload = {
          user_id: parseInt(processingTransaction.idCliente?.toString() || '0', 10),
          amount: processingTransaction.amount,
          transaction_id: processingTransaction.id.toString()
        };

        // Validación simplificada, igual que en acceptDeposit
        if (!proxyPayload.user_id || typeof proxyPayload.amount !== 'number' || !proxyPayload.transaction_id) {
          console.error(`[${opId}] BAD REQUEST: Incomplete data for proxy payload: ${JSON.stringify(proxyPayload)}`);
          throw new HttpException('Incomplete transaction data for proxy processing', HttpStatus.BAD_REQUEST);
        }

        console.log(`[${opId}] Sending to withdraw proxy, payload:`, JSON.stringify(proxyPayload));
        const proxyResponse = await axios.post('http://18.216.231.42:8080/withdraw', proxyPayload);
        console.log(`[${opId}] Withdraw proxy response:`, JSON.stringify(proxyResponse.data));

        // 6. Procesar respuesta y actualizar estado final
        if (proxyResponse.data?.status === 0) {
          console.log(`[${opId}] SUCCESS: Withdraw Proxy accepted. Updating transaction ${id} to Aceptado.`);
          const updatedTransaction = await this.ipnService.updateTransactionStatus(id, 'Aceptado');

          // Actualizar descripción con el usuario que aceptó manualmente
          const username = request.user?.username || request.user?.email || request.user?.id?.toString() || 'usuario';
          await this.ipnService.updateTransactionDescription(id, `Aceptado manual por ${username}`);

          // Guardar info adicional si aplica
          console.log(`[${opId}] FIN: Withdraw ${id} accepted successfully.`);
          return { status: 'success', message: 'Withdraw accepted and processed', transaction: updatedTransaction! };
        } else {
          const errorMsg = proxyResponse.data?.error_message || 'Unknown withdraw proxy error';
          console.error(`[${opId}] ERROR: Withdraw Proxy rejected transaction ${id}. Reason: ${errorMsg}`);
          await this.ipnService.updateTransactionStatus(id, 'Error');
          await this.ipnService.updateTransactionDescription(id, `Withdraw Proxy Error: ${errorMsg}`);
          throw new HttpException(`Withdraw Proxy processing failed: ${errorMsg}`, HttpStatus.INTERNAL_SERVER_ERROR);
        }
      } catch (error) {
        // Manejar error de comunicación con proxy de retiros
        console.error(`[${opId}] ERROR: Failed communication with withdraw proxy for transaction ${id}:`, error.message);
        await this.ipnService.updateTransactionStatus(id, 'Error');
        const commErrorMsg = error.response?.data?.message || error.message || 'Withdraw Proxy communication failed';
        await this.ipnService.updateTransactionDescription(id, `Withdraw Proxy Comm Error: ${commErrorMsg}`);
        // Lanzar HttpException
        if (axios.isAxiosError(error)) {
          throw new HttpException(`Withdraw proxy communication error: ${commErrorMsg}`, error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR);
        } else {
          throw new HttpException(`Internal error processing withdraw: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
        }
      }
    } finally {
      // Liberar lock
      this.processingTransactions.delete(id);
      console.log(`[${opId}] FINALLY: Removed processing lock for withdraw transaction ${id}.`);
    }
  }
}