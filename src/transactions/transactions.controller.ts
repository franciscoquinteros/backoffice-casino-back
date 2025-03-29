import { Controller, Get, Post, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import { IpnService } from './transactions.service';
import { Transaction } from './transaction.types';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly ipnService: IpnService) {}

  @Get()
  async getTransactions(): Promise<Transaction[]> {
    const transactions = await this.ipnService.getTransactions();
    console.log('Transacciones devueltas por el controlador:', transactions.length);
    return transactions;
  }

  @Post('/deposit/:id/accept')
  async acceptDeposit(@Param('id') id: string): Promise<{ status: string; message: string; transaction: Transaction }> {
    const updatedTransaction = await this.ipnService.updateTransactionStatus(id, 'Aceptado');
    
    if (!updatedTransaction) {
      throw new HttpException('Transacción no encontrada', HttpStatus.NOT_FOUND);
    }
    
    return {
      status: 'success',
      message: 'Transacción aceptada correctamente',
      transaction: updatedTransaction
    };
  }

  @Post('/withdraw/:id/accept')
  async acceptWithdraw(@Param('id') id: string): Promise<{ status: string; message: string; transaction: Transaction }> {
    const updatedTransaction = await this.ipnService.updateTransactionStatus(id, 'Aceptado');
    
    if (!updatedTransaction) {
      throw new HttpException('Transacción no encontrada', HttpStatus.NOT_FOUND);
    }
    
    return {
      status: 'success',
      message: 'Retiro aceptado correctamente',
      transaction: updatedTransaction
    };
  }
}
