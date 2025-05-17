import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { Account } from '../entities/account.entity';

export class AccountDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  office: string;

  @ApiProperty()
  wallet: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  alias: string;

  @ApiProperty()
  cbu: string;

  @ApiProperty()
  operator: string;

  @ApiProperty()
  agent: string;

  @ApiProperty()
  status: string;

  @ApiPropertyOptional()
  mp_access_token?: string;

  @ApiPropertyOptional()
  mp_public_key?: string;

  @ApiPropertyOptional()
  mp_client_id?: string;

  @ApiPropertyOptional()
  mp_client_secret?: string;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  receiver_id: String;

  // --- AÑADE ESTE CONSTRUCTOR ---
  constructor(entity: Account) {
    this.id = entity.id;
    this.office = entity.office; // Asume que 'office' es string ID
    this.wallet = entity.wallet;
    this.name = entity.name;
    this.alias = entity.alias;
    this.cbu = entity.cbu;
    this.operator = entity.operator;
    this.agent = entity.agent; // Asume que 'agent' es string ID del usuario/agente
    this.status = entity.status;
    this.mp_access_token = entity.mp_access_token;
    this.mp_public_key = entity.mp_public_key;
    this.mp_client_id = entity.mp_client_id;
    this.mp_client_secret = entity.mp_client_secret;
    this.created_at = entity.created_at;
    this.receiver_id = entity.receiver_id; // Asume que 'receiver_id' es string ID
  }
}

export class CreateAccountDto {
  @ApiProperty()
  @IsString()
  office: string;

  @ApiProperty()
  @IsString()
  @IsEnum(['mercadopago', 'paypal'])
  wallet: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  alias: string;

  @ApiProperty()
  @IsString()
  cbu: string;

  @ApiProperty()
  @IsString()
  operator: string;

  @ApiProperty()
  @IsString()
  agent: string;

  @ApiProperty()
  @IsString()
  @IsEnum(['active', 'inactive'])
  status: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  mp_access_token?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  mp_public_key?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  mp_client_id?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  mp_client_secret?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  receiver_id?: string;
}

export class UpdateAccountDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  office?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsEnum(['mercadopago', 'paypal'])
  @IsOptional()
  wallet?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  alias?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  cbu?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  operator?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  agent?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsEnum(['active', 'inactive'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  mp_access_token?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  mp_public_key?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  mp_client_id?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  mp_client_secret?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  receiver_id?: string;
}

export class AccountsResponseDto {
  @ApiProperty({ type: [AccountDto] })
  accounts: AccountDto[];
}

export class CbuSingleResponseDto {
  @ApiProperty({ type: String })
  cbu: string;
}

export class CbuRotationResponseDto {
  cbu: string;
  amount_received: number;
}

export class GetCbuRotationDto {
  amount: number;
}