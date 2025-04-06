import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateOfficeDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  agentAssigned: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

  @IsOptional()
  @IsString()
  telegram?: string;

  @IsOptional()
  @IsString()
  firstDepositBonus?: string;

  @IsOptional()
  @IsString()
  perpetualBonus?: string;

  @IsOptional()
  @IsString()
  minDeposit?: string;

  @IsOptional()
  @IsString()
  minWithdrawal?: string;

  @IsOptional()
  @IsString()
  minWithdrawalWait?: string;

  @IsOptional()
  @IsString()
  status?: string;
} 