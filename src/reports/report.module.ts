import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
    OfficeModule
  ],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService]
})
export class ReportModule { }