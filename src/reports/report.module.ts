import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { ZendeskModule } from '../ticketing/zendesk.module';
import { ChatModule } from '../chat/chat.module';
import { UserModule } from '../users/user.module';
import { Chat } from '../chat/entities/chat.entity';
import { User } from '../users/entities/user.entity';
import { Conversation } from '../chat/entities/conversation.entity';
import { OfficeModule } from 'src/office/office.module';
import { Office } from 'src/office/entities/office.entity';
import { TicketAssignment } from 'src/ticketing/entities/ticket-assignment.entity';
import { ZendeskService } from '../ticketing/zendesk.service';
import { ChatService } from '../chat/chat.service';
import { UserService } from '../users/user.service';
import { ConversationService } from '../chat/conversation.service';
import { OfficeService } from '../office/office.service';
import { IpnModule } from '../transactions/transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Chat,
      User,
      Conversation,
      Office,           // Añadir la entidad Office
      TicketAssignment  // Añadir la entidad TicketAssignment
    ]),
    ZendeskModule,
    ChatModule,
    UserModule,
    OfficeModule,
    forwardRef(() => IpnModule),
    HttpModule,
  ],
  controllers: [ReportController],
  providers: [
    ReportService,
    ZendeskService,
    ChatService,
    UserService,
    ConversationService,
    OfficeService
  ],
  exports: [ReportService]
})
export class ReportModule { }