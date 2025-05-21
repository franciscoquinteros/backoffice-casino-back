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
  Put
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
    console.log(`Devolviendo todas las transacciones (${transactions.length})`);
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
  async getTransactionStats(@Req() request: RequestWithUser): Promise<any> {
    const user = request.user;

    // Verificar si el usuario es superadmin
    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    if (user.role !== 'superadmin') {
      throw new ForbiddenException('Solo los superadmins pueden acceder a las estadísticas globales');
    }

    // Obtener todas las transacciones (o podríamos implementar una función más eficiente en el servicio)
    const allTransactions = await this.ipnService.getTransactions();

    // Obtener solo transacciones del último mes para algunos cálculos
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // Calcular estadísticas
    const stats = {
      // Totales generales
      totalTransactions: allTransactions.length,
      totalAmount: allTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0),

      // Desglose por tipo
      deposits: {
        total: allTransactions.filter(tx => tx.type === 'deposit').length,
        amount: allTransactions.filter(tx => tx.type === 'deposit').reduce((sum, tx) => sum + (tx.amount || 0), 0),
        pending: allTransactions.filter(tx => tx.type === 'deposit' && tx.status === 'Pending').length,
        accepted: allTransactions.filter(tx => tx.type === 'deposit' && tx.status === 'Aceptado').length,
        rejected: allTransactions.filter(tx => tx.type === 'deposit' && tx.status === 'Rechazado').length
      },

      withdrawals: {
        total: allTransactions.filter(tx => tx.type === 'withdraw').length,
        amount: allTransactions.filter(tx => tx.type === 'withdraw').reduce((sum, tx) => sum + (tx.amount || 0), 0),
        pending: allTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Pending').length,
        accepted: allTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Aceptado').length,
        rejected: allTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Rechazado').length
      },

      // Estadísticas por oficina
      byOffice: {},

      // Actividad reciente (últimas 5 transacciones)
      recentActivity: allTransactions
        .sort((a, b) => new Date(b.date_created || 0).getTime() - new Date(a.date_created || 0).getTime())
        .slice(0, 5)
        .map(tx => ({
          id: tx.id,
          type: tx.type,
          amount: tx.amount,
          status: tx.status,
          date_created: tx.date_created,
          office: tx.office
        })),

      // Tendencia mensual (comparación con el mes anterior)
      monthlyTrend: {
        currentMonth: {
          count: allTransactions.filter(tx =>
            new Date(tx.date_created || 0) >= oneMonthAgo
          ).length,
          amount: allTransactions
            .filter(tx => new Date(tx.date_created || 0) >= oneMonthAgo)
            .reduce((sum, tx) => sum + (tx.amount || 0), 0)
        },
        previousMonth: {
          count: 0,
          amount: 0
        },
        countChange: 0,
        amountChange: 0
      }
    };

    // Calcular estadísticas por oficina
    const offices = [...new Set(allTransactions.map(tx => tx.office))].filter(Boolean);

    offices.forEach(office => {
      const officeTransactions = allTransactions.filter(tx => tx.office === office);
      stats.byOffice[office] = {
        total: officeTransactions.length,
        totalAmount: officeTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0),
        deposits: officeTransactions.filter(tx => tx.type === 'deposit').length,
        withdrawals: officeTransactions.filter(tx => tx.type === 'withdraw').length,
        depositsAmount: officeTransactions
          .filter(tx => tx.type === 'deposit')
          .reduce((sum, tx) => sum + (tx.amount || 0), 0),
        withdrawalsAmount: officeTransactions
          .filter(tx => tx.type === 'withdraw')
          .reduce((sum, tx) => sum + (tx.amount || 0), 0)
      };
    });

    // Calcular tendencia (cambio porcentual respecto al mes anterior)
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    const previousMonthTransactions = allTransactions.filter(tx =>
      new Date(tx.date_created || 0) >= twoMonthsAgo &&
      new Date(tx.date_created || 0) < oneMonthAgo
    );

    stats.monthlyTrend.previousMonth = {
      count: previousMonthTransactions.length,
      amount: previousMonthTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0)
    };

    // Calcular porcentajes de cambio
    if (stats.monthlyTrend.previousMonth.count > 0) {
      stats.monthlyTrend.countChange = ((stats.monthlyTrend.currentMonth.count - stats.monthlyTrend.previousMonth.count) / stats.monthlyTrend.previousMonth.count) * 100;
    } else {
      stats.monthlyTrend.countChange = 100; // Si no había datos previos, el crecimiento es 100%
    }

    if (stats.monthlyTrend.previousMonth.amount > 0) {
      stats.monthlyTrend.amountChange = ((stats.monthlyTrend.currentMonth.amount - stats.monthlyTrend.previousMonth.amount) / stats.monthlyTrend.previousMonth.amount) * 100;
    } else {
      stats.monthlyTrend.amountChange = 100; // Si no había datos previos, el crecimiento es 100%
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
    @Req() request: RequestWithUser
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
    const officeTransactions = await this.ipnService.getTransactions(officeId);

    // Obtener solo transacciones del último mes para algunos cálculos
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // Calcular estadísticas específicas de la oficina
    const stats = {
      officeId,
      // Totales de la oficina
      totalTransactions: officeTransactions.length,
      totalAmount: officeTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0),

      // Desglose por tipo
      deposits: {
        total: officeTransactions.filter(tx => tx.type === 'deposit').length,
        amount: officeTransactions.filter(tx => tx.type === 'deposit').reduce((sum, tx) => sum + (tx.amount || 0), 0),
        pending: officeTransactions.filter(tx => tx.type === 'deposit' && tx.status === 'Pending').length,
        accepted: officeTransactions.filter(tx => tx.type === 'deposit' && tx.status === 'Aceptado').length,
        rejected: officeTransactions.filter(tx => tx.type === 'deposit' && tx.status === 'Rechazado').length
      },

      withdrawals: {
        total: officeTransactions.filter(tx => tx.type === 'withdraw').length,
        amount: officeTransactions.filter(tx => tx.type === 'withdraw').reduce((sum, tx) => sum + (tx.amount || 0), 0),
        pending: officeTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Pending').length,
        accepted: officeTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Aceptado').length,
        rejected: officeTransactions.filter(tx => tx.type === 'withdraw' && tx.status === 'Rechazado').length
      },

      // Actividad reciente (últimas 5 transacciones)
      recentActivity: officeTransactions
        .sort((a, b) => new Date(b.date_created || 0).getTime() - new Date(a.date_created || 0).getTime())
        .slice(0, 5)
        .map(tx => ({
          id: tx.id,
          type: tx.type,
          amount: tx.amount,
          status: tx.status,
          date_created: tx.date_created
        })),

      // Tendencia mensual (comparación con el mes anterior)
      monthlyTrend: {
        currentMonth: {
          count: officeTransactions.filter(tx =>
            new Date(tx.date_created || 0) >= oneMonthAgo
          ).length,
          amount: officeTransactions
            .filter(tx => new Date(tx.date_created || 0) >= oneMonthAgo)
            .reduce((sum, tx) => sum + (tx.amount || 0), 0)
        },
        previousMonth: {
          count: 0,
          amount: 0
        },
        countChange: 0,
        amountChange: 0
      }
    };

    // Calcular tendencia (cambio porcentual respecto al mes anterior)
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    const previousMonthTransactions = officeTransactions.filter(tx =>
      new Date(tx.date_created || 0) >= twoMonthsAgo &&
      new Date(tx.date_created || 0) < oneMonthAgo
    );

    stats.monthlyTrend.previousMonth = {
      count: previousMonthTransactions.length,
      amount: previousMonthTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0)
    };

    // Calcular porcentajes de cambio
    if (stats.monthlyTrend.previousMonth.count > 0) {
      stats.monthlyTrend.countChange = ((stats.monthlyTrend.currentMonth.count - stats.monthlyTrend.previousMonth.count) / stats.monthlyTrend.previousMonth.count) * 100;
    } else {
      stats.monthlyTrend.countChange = 100; // Si no había datos previos, el crecimiento es 100%
    }

    if (stats.monthlyTrend.previousMonth.amount > 0) {
      stats.monthlyTrend.amountChange = ((stats.monthlyTrend.currentMonth.amount - stats.monthlyTrend.previousMonth.amount) / stats.monthlyTrend.previousMonth.amount) * 100;
    } else {
      stats.monthlyTrend.amountChange = 100; // Si no había datos previos, el crecimiento es 100%
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

    // Para transacciones "Bank Transfer", obtener el nombre de cuenta directamente de la BD
    if (transaction.description === 'Bank Transfer' && transaction.cbu) {
      try {
        // Intentar obtener cuenta por CBU para tener el nombre actualizado
        const accountService = this.ipnService.getAccountService();
        const account = await accountService.findByCbu(transaction.cbu);

        if (account && account.name) {
          // Actualizar account_name con el valor más reciente de la base de datos
          transaction.account_name = account.name;

          // También actualizar la transacción en la BD para futuras consultas
          await this.ipnService.updateTransactionInfo(transactionId, {
            accountName: account.name
          });

          console.log(`[TransactionsController] Updated account_name for transaction ${transactionId} to "${account.name}"`);
        }
      } catch (error) {
        console.error(`[TransactionsController] Error fetching account name for transaction ${transactionId}:`, error);
      }
    }

    console.log(`[TransactionsController] Returning transaction details for ${transactionId}: ${JSON.stringify(transaction)}`);

    return transaction;
  }
}