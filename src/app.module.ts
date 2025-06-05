import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmConfigService } from './config/database/database.module';
import { UserModule } from './users/user.module';
import { PaymentModule } from './payment/payment.module';
import { ChatModule } from './chat/chat.module';
import { AccountModule } from './account/account.module';
import { AuthModule } from './auth/auth.module';
import { ReportModule } from './reports/report.module';
import { IpnModule } from './transactions/transactions.module';
import { ZendeskModule } from './ticketing/zendesk.module';
import { ZendeskController } from './ticketing/zendesk.controller';
import { OfficeModule } from './office/office.module';
import { TransactionEntity } from './transactions/entities/transaction.entity';
import { ProxyController } from './proxy/proxy.controller';
import { ProxyModule } from './proxy/proxy.module';
import { UserCommandsModule } from './users/commands/commands.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useClass: TypeOrmConfigService,
    }),
    HttpModule,
    AuthModule,
    UserModule,
    UserCommandsModule,
    AccountModule,
    PaymentModule,
    ChatModule,
    ReportModule,
    IpnModule,
    ZendeskModule,
    OfficeModule,
    ProxyModule,
  ],
  controllers: [ZendeskController,],
  providers: [],
})
export class AppModule { }