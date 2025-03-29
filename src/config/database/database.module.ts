import { Injectable } from '@nestjs/common';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/users/entities/user.entity';
import { Transaction } from 'src/payment/entities/transaction.entity';
import { Log } from 'src/payment/entities/log.entity';
import { Chat } from 'src/chat/entities/chat.entity';
import { Conversation } from 'src/chat/entities/conversation.entity';
import { Account as PaymentAccount } from 'src/payment/entities/account.entity';
import { Account as AccountEntity } from 'src/account/entities/account.entity';
import { ApiKey } from 'src/auth/apikeys/entities/apikey.entity';
import { TicketAssignment } from 'src/ticketing/entities/ticket-assignment.entity';
import { Office } from 'src/office/entities/office.entity';
import { TransactionEntity } from 'src/transactions/entities/transaction.entity';

@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
  constructor(private configService: ConfigService) { }

  createTypeOrmOptions(): TypeOrmModuleOptions {
    const entities = [
      User,
      Transaction,
      Log,
      Chat,
      Conversation,
      PaymentAccount,
      AccountEntity,
      ApiKey,
      TicketAssignment,
      Office,
      TransactionEntity,
    ];

    return {
      type: 'postgres',
      host: this.configService.get('DB_HOST'),
      port: +this.configService.get('DB_PORT'),
      username: this.configService.get('DB_USERNAME'),
      password: this.configService.get('DB_PASSWORD'),
      database: this.configService.get('DB_DATABASE'),
      entities: entities,
      synchronize: false,
      logging: false,
    };
  }
}