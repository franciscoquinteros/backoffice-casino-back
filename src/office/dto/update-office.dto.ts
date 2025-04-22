import { IsOptional, IsString } from 'class-validator';

export class UpdateOfficeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  agentAssigned?: string;

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