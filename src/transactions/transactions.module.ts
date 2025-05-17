import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IpnController } from './ipn.controller';
import { IpnService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { DepositController } from './deposit/deposit.controller';
import { ExternalWithdrawController, } from './withdraw/withdrawler.controller';
import { Account } from '../account/entities/account.entity';
import { AccountModule } from '../account/account.module';
import { ChatModule } from 'src/chat/chat.module';
import { TransactionEntity } from './entities/transaction.entity';
import { ExternalDepositController } from './deposit/external-deposit.controller';
import { CbuRotationController } from './deposit/cbu-rotation.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Account, TransactionEntity]),
    forwardRef(() => AccountModule),
    forwardRef(() => ChatModule),
  ],
  controllers: [
    IpnController,
    DepositController,
    TransactionsController,
    ExternalDepositController,
    ExternalWithdrawController,
    CbuRotationController
  ],
  providers: [IpnService],
  exports: [IpnService],
})
export class IpnModule { }
