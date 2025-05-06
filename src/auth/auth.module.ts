import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { UserModule } from '../users/user.module';
import { AuthController } from './auth.controller';
import { ApiKeysModule } from './apikeys/apikey.module';
import { ApiKey } from './apikeys/entities/apikey.entity';
import { ApiKeyGuard } from './apikeys/apikey.guard';
import { ApiKeyService } from './apikeys/apikey.service';
import { ApiKeyController } from './apikeys/apikey.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from '../auth/strategies/jwt.strategy'; // <-- 1. Importa la Estrategia
import { OfficeService } from 'src/office/office.service';
import { OfficeModule } from 'src/office/office.module';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    UserModule,
    ConfigModule,
    TypeOrmModule.forFeature([ApiKey]),
    ApiKeysModule,
    OfficeModule,
    // --- CONFIGURACIÓN JWT ---
    PassportModule.register({ defaultStrategy: 'jwt' }), // Correcto
    JwtModule.registerAsync({                           // Correcto
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRATION', '3600s'),
        },
      }),
      inject: [ConfigService],
    }),
    // --- FIN CONFIGURACIÓN JWT ---

    ThrottlerModule.forRoot([{ ttl: 60 * 15, limit: 5 }]), // Correcto
  ],
  providers: [
    AuthService,
    ApiKeyGuard,
    ApiKeyService,
    JwtAuthGuard,
    JwtStrategy,  // <--- 2. Añade la Estrategia a los providers
    RolesGuard
  ],
  controllers: [AuthController, ApiKeyController],
  // Exporta lo necesario
  exports: [AuthService, ApiKeyGuard, ApiKeyService, JwtAuthGuard, PassportModule, JwtModule],
})
export class AuthModule { }