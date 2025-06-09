import {
  Controller,
  Get,
  Post,
  Param,
  HttpException,
  HttpStatus,
  UseGuards,
  ForbiddenException,
  Req,
  BadRequestException,
  Put,
  Body,
  Query
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
  ApiParam
} from '@nestjs/swagger';
import { Request } from 'express';
import { IpnService } from './transactions.service';
import { Transaction, TransactionDto } from './transaction.types';
import axios from 'axios';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedUser {
  id: string | number;
  office: string;
  email?: string;
  username?: string;
  role?: string;
}

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

@ApiTags('Transactions')
@Controller('transactions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TransactionsController {
  private processingTransactions = new Set<string>();

  constructor(private readonly ipnService: IpnService) { }

  // Función helper para calcular rangos de fechas
  private getDateRange(period?: string, from?: string, to?: string): { startDate: Date; endDate: Date } {
    const now = new Date();
    const endDate = new Date();
    let startDate: Date;

    if (period === 'custom' && from && to) {
      startDate = new Date(from);
      endDate.setTime(new Date(to).getTime());
      endDate.setHours(23, 59, 59, 999); // Fin del día
    } else if (period === 'custom' && (!from || !to)) {
      // Si period es 'custom' pero no hay fechas, devolver datos históricos (todo el tiempo)
      console.log('Custom period without dates - returning all historical data');
      startDate = new Date('2020-01-01'); // Fecha muy atrás para incluir todo
      endDate.setTime(now.getTime());
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'day') {
      // Hoy
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'week') {
      // Esta semana (desde lunes)
      startDate = new Date();
      const day = startDate.getDay();
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1); // Ajustar para que lunes sea el primer día
      startDate.setDate(diff);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else {
      // month (por defecto)
      startDate = new Date();
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    }

    return { startDate, endDate };
  }

  // Función helper para filtrar transacciones por fecha
  private filterTransactionsByDate(transactions: any[], startDate: Date, endDate: Date): any[] {
    return transactions.filter(tx => {
      const txDate = new Date(tx.date_created || tx.dateCreated || tx.createdAt);
      return txDate >= startDate && txDate <= endDate;
    });
  }

  @Get('all')
  @ApiOperation({ summary: 'Get all transactions from all offices (superadmin only)' })
  @ApiResponse({ status: 200, description: 'List of all transactions in the system', type: [TransactionDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Forbidden - User is not a superadmin' })
  async getAllTransactions(@Req() request: RequestWithUser): Promise<Transaction[]> {
    const authenticatedUser = request.user;
    if (!authenticatedUser) {
      console.error('[getAllTransactions] Error: No authenticated user found');
      throw new ForbiddenException('User authentication data is missing.');
    }
    if (authenticatedUser.role !== 'superadmin') {
      console.warn(`[getAllTransactions] Forbidden: User ${authenticatedUser.id} with role ${authenticatedUser.role} attempted to access all transactions.`);
      throw new ForbiddenException('Only superadmins can access all transactions.');
    }

    console.log(`[TransactionsController] getAllTransactions: Superadmin ${authenticatedUser.id} fetching all transactions`);
    const transactions = await this.ipnService.getTransactions();
    const transactionsFromService: Transaction[] = await this.ipnService.getTransactions();
    console.log(`Devolviendo todas las transacciones (${transactions.length})`);
    // LOG CRÍTICO: ¿Qué está a punto de retornar el controlador ANTES de la serialización de NestJS?
    const specificWithdrawForLog = transactionsFromService.find(t => t.id === 'withdraw_1748266345329');
    if (specificWithdrawForLog) {
      console.log(`[CONTROLLER PRE-RETURN] Transaction ${specificWithdrawForLog.id}:`, JSON.stringify(specificWithdrawForLog, null, 2));
    } else if (transactionsFromService.length > 0) {
      const firstWithdraw = transactionsFromService.find(t => t.type === 'withdraw');
      if (firstWithdraw) {
        console.log('[CONTROLLER PRE-RETURN] First withdraw transaction from service:', JSON.stringify(firstWithdraw, null, 2));
      } else {
        console.log('[CONTROLLER PRE-RETURN] No withdraw transactions found. First transaction overall from service:', JSON.stringify(transactionsFromService[0], null, 2));
      }
    }
    return transactions;
  }

  @Get(':officeId')
  @ApiOperation({ summary: 'Get transactions for a specific office ID (from path)' })
  @ApiParam({ name: 'officeId', required: true, description: 'ID of the office to fetch transactions for', type: String })
  @ApiResponse({ status: 200, description: 'List of transactions for the specified office', type: [TransactionDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Forbidden - User cannot access this office' })
  @ApiResponse({ status: 404, description: 'Office ID format might be invalid or resource not found conceptually' })
  async getTransactions(
    @Param('officeId') requestedOfficeId: string,
    @Req() request: RequestWithUser
  ): Promise<Transaction[]> {
    if (!requestedOfficeId || typeof requestedOfficeId !== 'string' || requestedOfficeId.trim() === '') {
      throw new BadRequestException('Valid officeId path parameter is required');
    }

    const officeIdFromPath = requestedOfficeId.trim();
    const authenticatedUser = request.user;

    if (!authenticatedUser || !authenticatedUser.office) {
      console.error(`[getTransactions/:officeId] Error: User authenticated but missing office data.`);
      throw new ForbiddenException('User authentication data is incomplete.');
    }

    const userId = authenticatedUser.id;
    const userOffice = authenticatedUser.office;

    if (userOffice !== officeIdFromPath) {
      console.warn(`[getTransactions/:officeId] Forbidden: User ${userId} (Office: ${userOffice}) attempted to access office ${officeIdFromPath} via path.`);
      throw new ForbiddenException(`You do not have permission to access transactions for office ${officeIdFromPath}.`);
    }

    console.log(`[TransactionsController] getTransactions/:officeId: User ${userId} fetching transactions for allowed officeId: ${officeIdFromPath}`);
    const transactions = await this.ipnService.getTransactions(officeIdFromPath);
    console.log(`Transacciones devueltas (filtradas por oficina ${officeIdFromPath} desde path):`, transactions.length);

    if (transactions.length > 0) {
      console.log('Propiedades disponibles:', Object.keys(transactions[0]));
      console.log('Valor de external_reference:', transactions[0].external_reference || null);
    }

    return transactions;
  }

  @Post('/deposit/:id/accept')
  @ApiOperation({ summary: 'Accept a specific deposit transaction' })
  @ApiResponse({ status: 200, description: 'Transaction accepted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - User cannot modify transactions for this office' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 409, description: 'Transaction already processed or currently being processed' })
  @ApiResponse({ status: 500, description: 'Proxy processing error or internal server error' })
  async acceptDeposit(
    @Param('id') transactionId: string,
    @Req() request: RequestWithUser
  ): Promise<{ status: string; message: string; transaction: Transaction }> {
    const opId = `accept_deposit_${transactionId}_${Date.now()}`;
    const userId = request.user?.id;
    const userOffice = request.user?.office;

    console.log(`[${opId}] INICIO: User ${userId} (Office: ${userOffice}) attempting to accept deposit ID: ${transactionId}`);

    if (!userOffice) {
      throw new ForbiddenException('User office information is missing.');
    }

    if (this.processingTransactions.has(transactionId)) {
      throw new HttpException('Transaction is being processed', HttpStatus.CONFLICT);
    }

    this.processingTransactions.add(transactionId);

    try {
      const originalTransaction = await this.ipnService.getTransactionById(transactionId);
      if (!originalTransaction) {
        throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);
      }

      const transactionOffice = originalTransaction.office;

      if (!transactionOffice) {
        throw new ForbiddenException('Transaction is not assigned to an office.');
      }

      if (userOffice !== transactionOffice) {
        console.warn(`[${opId}] FORBIDDEN: User ${userId} (Office: ${userOffice}) attempted action on transaction ${transactionId} from office ${transactionOffice}.`);
        throw new ForbiddenException(`Forbidden action on transaction from office ${transactionOffice}.`);
      }

      console.log(`[${opId}] AUTHORIZED: User ${userId} on transaction ${transactionId} in office ${transactionOffice}.`);

      if (originalTransaction.status === 'Aceptado') {
        console.log(`[${opId}] INFO: Transaction ${transactionId} was already accepted.`);
        return { status: 'success', message: 'Transaction already accepted', transaction: originalTransaction };
      }

      if (originalTransaction.status !== 'Pending' && originalTransaction.status !== 'Error' && originalTransaction.status !== 'Processing') {
        console.warn(`[${opId}] CONFLICT: Cannot accept transaction ${transactionId} from current status: ${originalTransaction.status}`);
        throw new HttpException(`Cannot accept transaction from status: ${originalTransaction.status}`, HttpStatus.CONFLICT);
      }

      const processingTransaction = originalTransaction;
      console.log(`[${opId}] Transaction ${transactionId} ready for proxy. Amount: ${processingTransaction.amount}`);

      try {
        const proxyPayload = {
          user_id: parseInt(processingTransaction.idCliente?.toString() || '0', 10),
          amount: processingTransaction.amount,
          transaction_id: processingTransaction.id.toString()
        };

        if (!proxyPayload.user_id || typeof proxyPayload.amount !== 'number' || !proxyPayload.transaction_id) {
          console.error(`[${opId}] BAD REQUEST: Incomplete data for proxy payload: ${JSON.stringify(proxyPayload)}`);
          throw new HttpException('Incomplete transaction data for proxy processing', HttpStatus.BAD_REQUEST);
        }

        console.log(`[${opId}] Sending to proxy, payload:`, JSON.stringify(proxyPayload));
        const proxyResponse = await axios.post('http://18.216.231.42:8080/deposit', proxyPayload);
        console.log(`[${opId}] Proxy response received:`, JSON.stringify(proxyResponse.data));

        if (proxyResponse.data?.status === 0) {
          console.log(`[${opId}] SUCCESS: Proxy accepted. Updating transaction ${transactionId} status to Aceptado.`);
          const updatedTransaction = await this.ipnService.updateTransactionStatus(transactionId, 'Aceptado');

          const username = request.user?.username || request.user?.email || request.user?.id?.toString() || 'usuario';
          await this.ipnService.updateTransactionDescription(transactionId, `Aceptado manual por ${username}`);

          if (proxyResponse.data.result?.new_balance) {
            await this.ipnService.updateTransactionInfo(transactionId, { externalBalance: proxyResponse.data.result.new_balance });
          }

          console.log(`[${opId}] FIN: Transaction ${transactionId} accepted successfully.`);
          return { status: 'success', message: 'Transaction accepted and processed', transaction: updatedTransaction! };
        } else {
          const errorMsg = proxyResponse.data?.error_message || 'Unknown proxy error';
          console.error(`[${opId}] ERROR: Proxy rejected transaction ${transactionId}. Reason: ${errorMsg}`);
          await this.ipnService.updateTransactionStatus(transactionId, 'Error');
          await this.ipnService.updateTransactionDescription(transactionId, `Proxy Error: ${errorMsg}`);
          throw new HttpException(`Proxy processing failed: ${errorMsg}`, HttpStatus.INTERNAL_SERVER_ERROR);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[${opId}] ERROR: Failed communication with proxy for transaction ${transactionId}:`, errorMsg);
        await this.ipnService.updateTransactionStatus(transactionId, 'Error');
        await this.ipnService.updateTransactionDescription(transactionId, `Proxy Communication Error: ${errorMsg}`);
        throw new HttpException(`Failed to communicate with proxy: ${errorMsg}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    } finally {
      this.processingTransactions.delete(transactionId);
      console.log(`[${opId}] FINALLY: Removed processing lock for transaction ${transactionId}.`);
    }
  }

  @Post('/deposit/:id/reject')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject a specific deposit transaction' })
  @ApiResponse({ status: 200, description: 'Transaction rejected successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - User cannot modify transactions for this office' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 409, description: 'Transaction already processed' })
  async rejectDeposit(
    @Param('id') id: string,
    @Req() request: RequestWithUser
  ): Promise<{ status: string; message: string; transaction: Transaction }> {
    const opId = `reject_deposit_${id}_${Date.now()}`;
    const userId = request.user?.id;
    console.log(`[${opId}] INICIO: User ${userId} attempting to reject deposit ID: ${id}`);

    const originalTransaction = await this.ipnService.getTransactionById(id);
    if (!originalTransaction) {
      console.error(`[${opId}] NOT FOUND: Transaction ${id} not found.`);
      throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);
    }
    console.log(`[${opId}] Original transaction found: Status ${originalTransaction.status}, Office ${originalTransaction.office}`);

    const userOffice = request.user?.office;
    const transactionOffice = originalTransaction.office;
    if (!userOffice || !transactionOffice || userOffice !== transactionOffice) {
      console.warn(`[${opId}] FORBIDDEN: User ${userId} (Office: ${userOffice}) attempted to reject transaction ${id} from office ${transactionOffice}.`);
      throw new ForbiddenException(`You do not have permission to modify transactions for office ${transactionOffice}.`);
    }
    console.log(`[${opId}] AUTHORIZED: User ${userId} is allowed to modify transaction ${id} in office ${transactionOffice}.`);

    if (originalTransaction.status === 'Aceptado') {
      console.warn(`[${opId}] CONFLICT: Cannot reject transaction ${id} because it is already 'Aceptado'.`);
      throw new HttpException(`Cannot reject transaction, it is already accepted.`, HttpStatus.CONFLICT);
    }
    if (originalTransaction.status === 'Rechazado') {
      console.log(`[${opId}] INFO: Transaction ${id} was already rejected.`);
      return { status: 'success', message: 'Transaction already rejected', transaction: originalTransaction };
    }

    console.log(`[${opId}] Updating transaction ${id} status to Rechazado.`);
    const updatedTransaction = await this.ipnService.updateTransactionStatus(id, 'Rechazado');

    const username = request.user?.username || request.user?.email || request.user?.id?.toString() || 'usuario';
    await this.ipnService.updateTransactionDescription(id, `Rechazado manualmente por ${username}`);

    console.log(`[${opId}] FIN: Transaction ${id} rejected successfully.`);
    return {
      status: 'success',
      message: 'Transaction rejected successfully',
      transaction: updatedTransaction!
    };
  }

  @Post('/withdraw/:id/reject')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject a specific withdraw transaction' })
  @ApiResponse({ status: 200, description: 'Transaction rejected successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - User cannot modify transactions for this office' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 409, description: 'Transaction already processed' })
  async rejectWithdraw(
    @Param('id') id: string,
    @Req() request: RequestWithUser
  ): Promise<{ status: string; message: string; transaction: Transaction }> {
    const opId = `reject_withdraw_${id}_${Date.now()}`;
    const userId = request.user?.id;
    console.log(`[${opId}] INICIO: User ${userId} attempting to reject withdraw ID: ${id}`);

    const originalTransaction = await this.ipnService.getTransactionById(id);
    if (!originalTransaction) {
      console.error(`[${opId}] NOT FOUND: Transaction ${id} not found.`);
      throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);
    }

    const userOffice = request.user?.office;
    const transactionOffice = originalTransaction.office;
    if (!userOffice || !transactionOffice || userOffice !== transactionOffice) {
      console.warn(`[${opId}] FORBIDDEN: User ${userId} (Office: ${userOffice}) attempted action on transaction ${id} from office ${transactionOffice}.`);
      throw new ForbiddenException(`Forbidden action on transaction from office ${transactionOffice}.`);
    }
    console.log(`[${opId}] AUTHORIZED: User ${userId} on transaction ${id} in office ${transactionOffice}.`);

    if (originalTransaction.status === 'Aceptado') {
      console.error(`[${opId}] CONFLICT: Cannot reject transaction ${id} because it is already 'Aceptado'.`);
      throw new HttpException(`Cannot reject transaction, it is already accepted.`, HttpStatus.CONFLICT);
    }
    if (originalTransaction.status === 'Rechazado') {
      console.log(`[${opId}] INFO: Transaction ${id} was already rejected.`);
      return { status: 'success', message: 'Already rejected', transaction: originalTransaction };
    }

    console.log(`[${opId}] Updating transaction ${id} status to Rechazado.`);
    const updatedTransaction = await this.ipnService.updateTransactionStatus(id, 'Rechazado');

    const username = request.user?.username || request.user?.email || request.user?.id?.toString() || 'usuario';
    await this.ipnService.updateTransactionDescription(id, `Rechazado manualmente por ${username}`);

    console.log(`[${opId}] FIN: Withdraw ${id} rejected successfully.`);
    return {
      status: 'success',
      message: 'Withdraw rejected successfully',
      transaction: updatedTransaction!
    };
  }

  @Post('/withdraw/:id/accept')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept a specific withdraw transaction' })
  @ApiResponse({ status: 200, description: 'Transaction accepted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - User cannot modify transactions for this office' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 409, description: 'Transaction already processed or currently being processed' })
  @ApiResponse({ status: 500, description: 'Proxy processing error or internal server error' })
  async acceptWithdraw(
    @Param('id') id: string,
    @Req() request: RequestWithUser
  ): Promise<{ status: string; message: string; transaction: Transaction }> {
    const opId = `accept_withdraw_${id}_${Date.now()}`;
    const userId = request.user?.id;
    console.log(`[${opId}] INICIO: User ${userId} attempting to accept withdraw ID: ${id}`);

    if (this.processingTransactions.has(id)) {
      throw new HttpException('Transaction is being processed', HttpStatus.CONFLICT);
    }

    this.processingTransactions.add(id);

    try {
      const originalTransaction = await this.ipnService.getTransactionById(id);
      if (!originalTransaction) {
        throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);
      }

      const userOffice = request.user?.office;
      const transactionOffice = originalTransaction.office;
      if (!userOffice || !transactionOffice || userOffice !== transactionOffice) {
        console.warn(`[${opId}] FORBIDDEN: User ${userId} (Office: ${userOffice}) attempted action on transaction ${id} from office ${transactionOffice}.`);
        throw new ForbiddenException(`Forbidden action on transaction from office ${transactionOffice}.`);
      }
      console.log(`[${opId}] AUTHORIZED: User ${userId} on transaction ${id} in office ${transactionOffice}.`);

      if (originalTransaction.status === 'Aceptado') {
        console.log(`[${opId}] INFO: Transaction ${id} was already accepted.`);
        return { status: 'success', message: 'Already accepted', transaction: originalTransaction };
      }
      if (originalTransaction.status === 'Rechazado') {
        throw new HttpException('Already rejected', HttpStatus.CONFLICT);
      }
      if (originalTransaction.status !== 'Pending' && originalTransaction.status !== 'Error') {
        throw new HttpException(`Cannot accept from status: ${originalTransaction.status}`, HttpStatus.CONFLICT);
      }

      const processingTransaction = originalTransaction;
      console.log(`[${opId}] Transaction ${id} ready for proxy. Amount: ${processingTransaction.amount}`);

      try {
        const proxyPayload = {
          user_id: parseInt(processingTransaction.idCliente?.toString() || '0', 10),
          amount: processingTransaction.amount,
          transaction_id: processingTransaction.id.toString()
        };

        if (!proxyPayload.user_id || typeof proxyPayload.amount !== 'number' || !proxyPayload.transaction_id) {
          console.error(`[${opId}] BAD REQUEST: Incomplete data for proxy payload: ${JSON.stringify(proxyPayload)}`);
          throw new HttpException('Incomplete transaction data for proxy processing', HttpStatus.BAD_REQUEST);
        }

        console.log(`[${opId}] Sending to withdraw proxy, payload:`, JSON.stringify(proxyPayload));
        const proxyResponse = await axios.post('http://18.216.231.42:8080/withdraw', proxyPayload);
        console.log(`[${opId}] Withdraw proxy response:`, JSON.stringify(proxyResponse.data));

        if (proxyResponse.data?.status === 0) {
          console.log(`[${opId}] SUCCESS: Withdraw Proxy accepted. Updating transaction ${id} to Aceptado.`);
          const updatedTransaction = await this.ipnService.updateTransactionStatus(id, 'Aceptado');

          const username = request.user?.username || request.user?.email || request.user?.id?.toString() || 'usuario';
          await this.ipnService.updateTransactionDescription(id, `Aceptado manual por ${username}`);

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
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[${opId}] ERROR: Failed communication with withdraw proxy for transaction ${id}:`, errorMsg);
        await this.ipnService.updateTransactionStatus(id, 'Error');
        await this.ipnService.updateTransactionDescription(id, `Withdraw Proxy Communication Error: ${errorMsg}`);
        throw new HttpException(`Failed to communicate with withdraw proxy: ${errorMsg}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    } finally {
      this.processingTransactions.delete(id);
      console.log(`[${opId}] FINALLY: Removed processing lock for withdraw transaction ${id}.`);
    }
  }

  @Get('stats/summary')
  @ApiOperation({ summary: 'Get transaction statistics and summary data for dashboard (superadmin only)' })
  @ApiResponse({ status: 200, description: 'Transaction statistics by office or global' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Forbidden - User is not a superadmin' })
  async getTransactionStats(
    @Req() request: RequestWithUser,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string
  ): Promise<any> {
    const user = request.user;

    // Verificar si el usuario es superadmin
    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    if (user.role !== 'superadmin') {
      throw new ForbiddenException('Solo los superadmins pueden acceder a las estadísticas globales');
    }

    // Obtener todas las transacciones
    const allTransactions = await this.ipnService.getTransactions();

    // Aplicar filtro de fecha si se especifica
    const { startDate, endDate } = this.getDateRange(period, from, to);
    console.log(`Filtering transactions from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const filteredTransactions = this.filterTransactionsByDate(allTransactions, startDate, endDate);
    console.log(`Filtered ${allTransactions.length} transactions to ${filteredTransactions.length} for period: ${period || 'month'}`);

    // Obtener solo transacciones del último mes para comparación de tendencias
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // Calcular estadísticas con transacciones filtradas
    const stats = {
      // Totales generales
      totalTransactions: filteredTransactions.length,
      totalAmount: filteredTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0),

      // Desglose por tipo
      deposits: {
        total: filteredTransactions.filter(tx => tx.type === 'deposit' && (tx.status === 'Match MP' || tx.status === 'Aceptado')).length,
        amount: filteredTransactions.filter(tx => tx.type === 'deposit' && (tx.status === 'Match MP' || tx.status === 'Aceptado')).reduce((sum, tx) => sum + (tx.amount || 0), 0),
        pending: filteredTransactions.filter(tx => tx.type === 'deposit' && tx.status === 'Pending').length,
        accepted: filteredTransactions.filter(tx => tx.type === 'deposit' && tx.status === 'Aceptado').length,
        rejected: filteredTransactions.filter(tx => tx.type === 'deposit' && tx.status === 'Rechazado').length,
        matchMP: filteredTransactions.filter(tx => tx.type === 'deposit' && tx.status === 'Match MP').length
      },

      withdrawals: {
        total: filteredTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Aceptado').length,
        amount: filteredTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Aceptado').reduce((sum, tx) => sum + (tx.amount || 0), 0),
        pending: filteredTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Pending').length,
        accepted: filteredTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Aceptado').length,
        rejected: filteredTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Rechazado').length,
        matchMP: filteredTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Match MP').length
      },

      // Total neto (depósitos - retiros)
      netTotal: 0,

      // Estadísticas por oficina
      byOffice: {},

      // Tendencia mensual (usando el período filtrado como "actual" y comparando con período anterior del mismo tamaño)
      monthlyTrend: {
        currentMonth: {
          count: filteredTransactions.length,
          amount: filteredTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0)
        },
        previousMonth: {
          count: 0,
          amount: 0
        },
        countChange: 0,
        amountChange: 0
      }
    };

    // Calcular el total neto (depósitos - retiros)
    stats.netTotal = stats.deposits.amount - stats.withdrawals.amount;

    // Calcular estadísticas por oficina (solo del período filtrado)
    const offices = [...new Set(filteredTransactions.map(tx => tx.office))].filter(Boolean);

    offices.forEach(office => {
      const officeTransactions = filteredTransactions.filter(tx => tx.office === office);
      const depositsAmount = officeTransactions
        .filter(tx => tx.type === 'deposit' && (tx.status === 'Match MP' || tx.status === 'Aceptado'))
        .reduce((sum, tx) => sum + (tx.amount || 0), 0);
      const withdrawalsAmount = officeTransactions
        .filter(tx => tx.type === 'withdraw' && tx.status === 'Aceptado')
        .reduce((sum, tx) => sum + (tx.amount || 0), 0);

      stats.byOffice[office] = {
        total: officeTransactions.length,
        totalAmount: depositsAmount - withdrawalsAmount, // Depósitos - Retiros
        deposits: officeTransactions.filter(tx => tx.type === 'deposit').length,
        withdrawals: officeTransactions.filter(tx => tx.type === 'withdraw').length,
        depositsAmount: depositsAmount,
        withdrawalsAmount: withdrawalsAmount
      };
    });

    // Calcular período anterior del mismo tamaño para comparación
    const periodDuration = endDate.getTime() - startDate.getTime();
    const previousPeriodEnd = new Date(startDate.getTime() - 1); // Un milisegundo antes del período actual
    const previousPeriodStart = new Date(previousPeriodEnd.getTime() - periodDuration);

    const previousPeriodTransactions = this.filterTransactionsByDate(allTransactions, previousPeriodStart, previousPeriodEnd);

    stats.monthlyTrend.previousMonth = {
      count: previousPeriodTransactions.length,
      amount: previousPeriodTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0)
    };

    // Calcular porcentajes de cambio
    if (stats.monthlyTrend.previousMonth.count > 0) {
      stats.monthlyTrend.countChange = ((stats.monthlyTrend.currentMonth.count - stats.monthlyTrend.previousMonth.count) / stats.monthlyTrend.previousMonth.count) * 100;
    } else {
      stats.monthlyTrend.countChange = stats.monthlyTrend.currentMonth.count > 0 ? 100 : 0;
    }

    if (stats.monthlyTrend.previousMonth.amount > 0) {
      stats.monthlyTrend.amountChange = ((stats.monthlyTrend.currentMonth.amount - stats.monthlyTrend.previousMonth.amount) / stats.monthlyTrend.previousMonth.amount) * 100;
    } else {
      stats.monthlyTrend.amountChange = stats.monthlyTrend.currentMonth.amount > 0 ? 100 : 0;
    }

    return stats;
  }

  @Get('stats/by-office/:officeId')
  @ApiOperation({ summary: 'Get transaction statistics for a specific office' })
  @ApiResponse({ status: 200, description: 'Transaction statistics for the specified office' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Forbidden - User cannot access this office data' })
  async getOfficeTransactionStats(
    @Param('officeId') officeId: string,
    @Req() request: RequestWithUser,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string
  ): Promise<any> {
    const user = request.user;

    // Verificar permisos: solo superadmin o usuario de la misma oficina
    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    // Si no es superadmin, solo puede ver su propia oficina
    if (user.role !== 'superadmin' && user.office !== officeId) {
      throw new ForbiddenException('No tienes permisos para ver estadísticas de esta oficina');
    }

    // Obtener transacciones filtradas por oficina
    const allOfficeTransactions = await this.ipnService.getTransactions(officeId);

    // Aplicar filtro de fecha si se especifica
    const { startDate, endDate } = this.getDateRange(period, from, to);
    console.log(`Filtering office ${officeId} transactions from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const officeTransactions = this.filterTransactionsByDate(allOfficeTransactions, startDate, endDate);
    console.log(`Filtered ${allOfficeTransactions.length} office transactions to ${officeTransactions.length} for period: ${period || 'month'}`);

    // Obtener solo transacciones del último mes para comparación de tendencias
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // Calcular estadísticas específicas de la oficina
    const depositsAmount = officeTransactions.filter(tx => tx.type === 'deposit' && (tx.status === 'Match MP' || tx.status === 'Aceptado')).reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const withdrawalsAmount = officeTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Aceptado').reduce((sum, tx) => sum + (tx.amount || 0), 0);

    const stats = {
      officeId,
      // Totales de la oficina
      totalTransactions: officeTransactions.length,
      totalAmount: depositsAmount - withdrawalsAmount, // Depósitos - Retiros

      // Desglose por tipo
      deposits: {
        total: officeTransactions.filter(tx => tx.type === 'deposit' && (tx.status === 'Match MP' || tx.status === 'Aceptado')).length,
        amount: depositsAmount,
        pending: officeTransactions.filter(tx => tx.type === 'deposit' && tx.status === 'Pending').length,
        accepted: officeTransactions.filter(tx => tx.type === 'deposit' && tx.status === 'Aceptado').length,
        rejected: officeTransactions.filter(tx => tx.type === 'deposit' && tx.status === 'Rechazado').length,
        matchMP: officeTransactions.filter(tx => tx.type === 'deposit' && tx.status === 'Match MP').length
      },

      withdrawals: {
        total: officeTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Aceptado').length,
        amount: withdrawalsAmount,
        pending: officeTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Pending').length,
        accepted: officeTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Aceptado').length,
        rejected: officeTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Rechazado').length,
        matchMP: officeTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Match MP').length
      },

      // Total neto (depósitos - retiros)
      netTotal: 0,

      // Tendencia mensual (usando el período filtrado como "actual" y comparando con período anterior del mismo tamaño)
      monthlyTrend: {
        currentMonth: {
          count: officeTransactions.length,
          amount: officeTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0)
        },
        previousMonth: {
          count: 0,
          amount: 0
        },
        countChange: 0,
        amountChange: 0
      }
    };

    // Calcular el total neto (depósitos - retiros)
    stats.netTotal = depositsAmount - withdrawalsAmount;

    // Calcular período anterior del mismo tamaño para comparación
    const periodDuration = endDate.getTime() - startDate.getTime();
    const previousPeriodEnd = new Date(startDate.getTime() - 1); // Un milisegundo antes del período actual
    const previousPeriodStart = new Date(previousPeriodEnd.getTime() - periodDuration);

    const previousPeriodTransactions = this.filterTransactionsByDate(allOfficeTransactions, previousPeriodStart, previousPeriodEnd);

    stats.monthlyTrend.previousMonth = {
      count: previousPeriodTransactions.length,
      amount: previousPeriodTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0)
    };

    // Calcular porcentajes de cambio
    if (stats.monthlyTrend.previousMonth.count > 0) {
      stats.monthlyTrend.countChange = ((stats.monthlyTrend.currentMonth.count - stats.monthlyTrend.previousMonth.count) / stats.monthlyTrend.previousMonth.count) * 100;
    } else {
      stats.monthlyTrend.countChange = stats.monthlyTrend.currentMonth.count > 0 ? 100 : 0;
    }

    if (stats.monthlyTrend.previousMonth.amount > 0) {
      stats.monthlyTrend.amountChange = ((stats.monthlyTrend.currentMonth.amount - stats.monthlyTrend.previousMonth.amount) / stats.monthlyTrend.previousMonth.amount) * 100;
    } else {
      stats.monthlyTrend.amountChange = stats.monthlyTrend.currentMonth.amount > 0 ? 100 : 0;
    }

    return stats;
  }

  @Put(':id/assign/:userId')
  @ApiOperation({ summary: 'Asignar un usuario a una transacción' })
  @ApiParam({ name: 'id', description: 'ID de la transacción' })
  @ApiParam({ name: 'userId', description: 'ID del usuario al que se asignará la transacción' })
  @ApiResponse({ status: 200, description: 'Transacción asignada correctamente' })
  @ApiResponse({ status: 404, description: 'Transacción no encontrada' })
  @ApiResponse({ status: 403, description: 'Acceso prohibido' })
  async assignTransactionToUser(
    @Param('id') transactionId: string,
    @Param('userId') assignToUserId: string,
    @Req() request: RequestWithUser
  ): Promise<{ status: string; message: string; transaction: Transaction }> {
    const opId = `assign_transaction_${transactionId}_${Date.now()}`;
    console.log(`[${opId}] Asignando transacción ${transactionId} al usuario ${assignToUserId}`);

    // Verificar que el usuario autenticado tiene acceso a la transacción (misma oficina)
    const userOffice = request.user?.office;
    const currentUserId = request.user?.id;

    if (!userOffice) {
      console.warn(`[${opId}] FORBIDDEN: User ${currentUserId} has no office assigned.`);
      throw new ForbiddenException('User does not have an office assigned');
    }

    try {
      const transaction = await this.ipnService.getTransactionById(transactionId);
      if (!transaction) {
        throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);
      }

      const transactionOffice = transaction.office;

      if (!transactionOffice) {
        throw new HttpException('Transaction is not assigned to an office', HttpStatus.BAD_REQUEST);
      }

      if (userOffice !== transactionOffice) {
        console.warn(`[${opId}] FORBIDDEN: User ${currentUserId} (Office: ${userOffice}) attempted action on transaction ${transactionId} from office ${transactionOffice}.`);
        throw new ForbiddenException(`Forbidden action on transaction from office ${transactionOffice}.`);
      }

      // Actualizar la transacción con el usuario asignado
      const updatedTransaction = await this.ipnService.updateTransactionInfo(transactionId, { assignedTo: assignToUserId });
      if (!updatedTransaction) {
        throw new HttpException('Failed to update transaction', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        status: 'success',
        message: 'Transaction assigned successfully',
        transaction: updatedTransaction
      };
    } catch (error) {
      console.error(`[${opId}] Error asignando transacción:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Error assigning transaction', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('details/:id')
  @ApiOperation({ summary: 'Get details of a specific transaction by ID' })
  @ApiParam({ name: 'id', required: true, description: 'ID of the transaction to fetch details for', type: String })
  @ApiResponse({ status: 200, description: 'Transaction details retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async getTransactionDetails(
    @Param('id') transactionId: string,
    @Req() request: RequestWithUser
  ) {
    if (!transactionId) {
      throw new BadRequestException('Transaction ID is required');
    }

    console.log(`[TransactionsController] getTransactionDetails: Fetching details for transaction ID ${transactionId}`);

    const transaction = await this.ipnService.getTransactionById(transactionId);

    if (!transaction) {
      throw new HttpException(`Transaction with ID ${transactionId} not found`, HttpStatus.NOT_FOUND);
    }

    // Para transacciones "Bank Transfer", SIEMPRE obtener el nombre de cuenta más actualizado de la BD
    if (transaction.description === 'Bank Transfer' && transaction.cbu) {
      try {
        console.log(`[TransactionsController] Bank Transfer ${transactionId}: Buscando nombre de cuenta actualizado para CBU ${transaction.cbu}`);

        // Intentar obtener cuenta por CBU para tener el nombre actualizado
        const accountService = this.ipnService.getAccountService();
        const account = await accountService.findByCbu(transaction.cbu);

        if (account && account.name) {
          console.log(`[TransactionsController] Bank Transfer ${transactionId}: Nombre de cuenta encontrado en BD: "${account.name}" (anterior: "${transaction.account_name}")`);

          // Actualizar account_name con el valor más reciente de la base de datos
          transaction.account_name = account.name;

          // También actualizar la transacción en la BD para futuras consultas
          await this.ipnService.updateTransactionInfo(transactionId, {
            accountName: account.name
          });

          console.log(`[TransactionsController] Bank Transfer ${transactionId}: Actualizado account_name a "${account.name}" en BD`);
        } else {
          console.log(`[TransactionsController] No se encontró cuenta en BD para Bank Transfer ${transactionId} con CBU ${transaction.cbu}`);
        }
      } catch (error) {
        console.error(`[TransactionsController] Error fetching account name for Bank Transfer ${transactionId}:`, error);
      }
    }

    console.log(`[TransactionsController] Returning transaction details for ${transactionId} with account_name: "${transaction.account_name}"`);

    return transaction;
  }

  @Post('refresh-account-names')
  @ApiOperation({ summary: 'Refresh account names for Bank Transfer transactions' })
  @ApiResponse({ status: 200, description: 'Account names refreshed successfully' })
  async refreshBankTransferAccountNames(
    @Req() request: RequestWithUser
  ): Promise<{ status: string; message: string; updated: number }> {
    console.log('[TransactionController] Iniciando actualización de nombres de cuentas para transacciones Bank Transfer');

    try {
      // Buscar todas las transacciones con descripción "Bank Transfer"
      const transactions = await this.ipnService.getTransactions(
        undefined, // No filtrar por officeid
        'deposit', // Solo depósitos
        undefined  // No filtrar por estado
      );

      const bankTransfers = transactions.filter(tx => tx.description === 'Bank Transfer');
      console.log(`[TransactionController] Encontradas ${bankTransfers.length} transacciones Bank Transfer para actualizar`);

      let updatedCount = 0;
      const accountService = this.ipnService.getAccountService();
      const accountCache = new Map<string, string>();

      // Procesar cada transacción Bank Transfer
      for (const tx of bankTransfers) {
        if (tx.cbu) {
          try {
            // Primero verificar si ya tenemos este CBU en caché
            let accountName = accountCache.get(tx.cbu);

            // Si no está en caché, buscarlo en la BD
            if (!accountName) {
              const account = await accountService.findByCbu(tx.cbu);
              if (account && account.name) {
                accountName = account.name;
                accountCache.set(tx.cbu, accountName);
              }
            }

            if (accountName) {
              // Actualizar la transacción siempre, forzando la actualización 
              // aunque el nombre no parezca haber cambiado
              await this.ipnService.updateTransactionInfo(tx.id.toString(), {
                accountName: accountName
              });
              updatedCount++;
              console.log(`[RefreshNames] Actualizado nombre para tx ${tx.id}: "${tx.account_name || 'N/A'}" -> "${accountName}"`);
            } else {
              console.log(`[RefreshNames] No se encontró nombre para CBU ${tx.cbu} de tx ${tx.id}`);
            }
          } catch (err) {
            console.error(`[RefreshNames] Error al actualizar tx ${tx.id}:`, err);
          }
        } else {
          console.log(`[RefreshNames] La transacción ${tx.id} no tiene CBU asociado`);
        }
      }

      return {
        status: 'success',
        message: `Se actualizaron ${updatedCount} de ${bankTransfers.length} transacciones Bank Transfer`,
        updated: updatedCount
      };
    } catch (error) {
      console.error('[RefreshNames] Error al actualizar nombres de cuenta:', error);
      throw new HttpException('Error al actualizar nombres de cuenta', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('update-all-account-names')
  @ApiOperation({ summary: 'Update ALL existing Bank Transfer transactions with current account names (RETROACTIVE)' })
  @ApiResponse({ status: 200, description: 'All Bank Transfer account names updated successfully' })
  async updateAllBankTransferAccountNames(
    @Req() request: RequestWithUser
  ): Promise<{ status: string; message: string; updated: number; details: any[] }> {
    const user = request.user;

    // Solo permitir a superadmins realizar esta operación masiva
    if (user?.role !== 'superadmin') {
      throw new ForbiddenException('Solo los superadmins pueden realizar actualizaciones masivas');
    }

    console.log('[TransactionController] INICIO: Actualización masiva retroactiva de nombres de cuenta para Bank Transfer');

    try {
      // Obtener TODAS las transacciones Bank Transfer de la BD directamente
      const bankTransferEntities = await this.ipnService.getTransactionRepository().find({
        where: {
          description: 'Bank Transfer'
        }
      });

      console.log(`[UpdateAll] Encontradas ${bankTransferEntities.length} transacciones Bank Transfer en total`);

      let updatedCount = 0;
      const updateDetails = [];
      const accountService = this.ipnService.getAccountService();
      const accountCache = new Map<string, string>();

      // Procesar cada transacción
      for (const entity of bankTransferEntities) {
        if (entity.cbu) {
          try {
            // Obtener el nombre actual de la cuenta
            let currentAccountName = accountCache.get(entity.cbu);

            if (!currentAccountName) {
              const account = await accountService.findByCbu(entity.cbu);
              if (account && account.name) {
                currentAccountName = account.name;
                accountCache.set(entity.cbu, currentAccountName);
              }
            }

            if (currentAccountName) {
              const oldName = entity.accountName;

              // Solo actualizar si el nombre es diferente
              if (oldName !== currentAccountName) {
                // Actualizar directamente en la BD
                await this.ipnService.getTransactionRepository().update(
                  { id: entity.id },
                  { accountName: currentAccountName }
                );

                updatedCount++;
                updateDetails.push({
                  transactionId: entity.id,
                  cbu: entity.cbu,
                  oldName: oldName || 'Sin nombre',
                  newName: currentAccountName
                });

                console.log(`[UpdateAll] TX ${entity.id}: "${oldName || 'Sin nombre'}" -> "${currentAccountName}"`);
              } else {
                console.log(`[UpdateAll] TX ${entity.id}: Nombre ya correcto: "${currentAccountName}"`);
              }
            } else {
              console.log(`[UpdateAll] TX ${entity.id}: No se encontró cuenta para CBU ${entity.cbu}`);
            }
          } catch (err) {
            console.error(`[UpdateAll] Error al procesar TX ${entity.id}:`, err);
          }
        } else {
          console.log(`[UpdateAll] TX ${entity.id}: No tiene CBU asociado`);
        }
      }

      console.log(`[UpdateAll] COMPLETADO: Se actualizaron ${updatedCount} transacciones`);

      return {
        status: 'success',
        message: `Actualización masiva completada: ${updatedCount} de ${bankTransferEntities.length} transacciones Bank Transfer actualizadas`,
        updated: updatedCount,
        details: updateDetails.slice(0, 10) // Solo mostrar los primeros 10 para no sobrecargar la respuesta
      };
    } catch (error) {
      console.error('[UpdateAll] Error en actualización masiva:', error);
      throw new HttpException('Error en actualización masiva de nombres de cuenta', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update transaction status' })
  @ApiParam({ name: 'id', required: true, description: 'ID of the transaction to update', type: String })
  @ApiResponse({ status: 200, description: 'Transaction status updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async updateTransactionStatus(
    @Param('id') transactionId: string,
    @Req() request: RequestWithUser,
    @Body() body: { status: string }
  ): Promise<{ status: string; message: string; transaction: Transaction }> {
    const userId = request.user?.id;
    const userOffice = request.user?.office;

    console.log(`[UpdateStatus] User ${userId} updating status of transaction ${transactionId} to ${body.status}`);

    if (!userOffice) {
      throw new ForbiddenException('User office information is missing.');
    }

    try {
      const transaction = await this.ipnService.getTransactionById(transactionId);
      if (!transaction) {
        throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);
      }

      const transactionOffice = transaction.office;

      if (!transactionOffice) {
        throw new ForbiddenException('Transaction is not assigned to an office.');
      }

      if (userOffice !== transactionOffice) {
        console.warn(`[UpdateStatus] FORBIDDEN: User ${userId} (Office: ${userOffice}) attempted action on transaction ${transactionId} from office ${transactionOffice}.`);
        throw new ForbiddenException(`Forbidden action on transaction from office ${transactionOffice}.`);
      }

      // Validar que el nuevo estado sea válido
      const validStatuses = ['Pending', 'Asignado', 'Aceptado', 'Rechazado', 'Match', 'Match MP'];
      if (!validStatuses.includes(body.status)) {
        throw new HttpException(`Invalid status: ${body.status}`, HttpStatus.BAD_REQUEST);
      }

      const updatedTransaction = await this.ipnService.updateTransactionStatus(transactionId, body.status);
      if (!updatedTransaction) {
        throw new HttpException('Failed to update transaction status', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        status: 'success',
        message: `Transaction status updated to ${body.status}`,
        transaction: updatedTransaction
      };
    } catch (error) {
      console.error(`[UpdateStatus] Error updating transaction ${transactionId}:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Error updating transaction status', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}