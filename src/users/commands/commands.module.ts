import { Module } from '@nestjs/common';
import { CreateSuperadminCommand } from './create-superadmin.command';
import { UserModule } from '../user.module';

@Module({
    imports: [UserModule],
    providers: [CreateSuperadminCommand],
    exports: [CreateSuperadminCommand],
})
export class UserCommandsModule { } 