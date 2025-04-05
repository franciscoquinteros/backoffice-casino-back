import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';

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
}

export class AccountsResponseDto {
  @ApiProperty({ type: [AccountDto] })
  accounts: AccountDto[];
}

export class CbuSingleResponseDto {
  @ApiProperty({ type: String })
  cbu: string;
}