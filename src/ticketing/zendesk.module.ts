import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ZendeskController } from './zendesk.controller';
import { ZendeskService } from './zendesk.service';
import { AuthModule } from '../auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketAssignment } from './entities/ticket-assignment.entity';
import { UserModule } from '../users/user.module';

@Module({
    imports: [
        HttpModule,
        AuthModule,
        TypeOrmModule.forFeature([TicketAssignment]),
        UserModule
    ],
    controllers: [ZendeskController],
    providers: [ZendeskService],
    exports: [ZendeskService],
})
export class ZendeskModule { }
