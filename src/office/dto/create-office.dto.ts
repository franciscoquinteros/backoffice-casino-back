import { IsString, IsOptional, IsEnum, } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOfficeDto {
  @ApiProperty({ description: 'Custom ID for the office, used for external integrations' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Office name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Office WhatsApp contact', required: false })
  @IsString()
  @IsOptional()
  whatsapp?: string;

  @ApiProperty({ description: 'Office Telegram contact', required: false })
  @IsString()
  @IsOptional()
  telegram?: string;

  @ApiProperty({ description: 'First deposit bonus percentage', required: false })
  @IsString()
  @IsOptional()
  firstDepositBonus?: string;

  @ApiProperty({ description: 'Perpetual bonus percentage', required: false })
  @IsString()
  @IsOptional()
  perpetualBonus?: string;

  @ApiProperty({ description: 'Minimum deposit amount', required: false })
  @IsString()
  @IsOptional()
  minDeposit?: string;

  @ApiProperty({ description: 'Minimum withdrawal amount', required: false })
  @IsString()
  @IsOptional()
  minWithdrawal?: string;

  @ApiProperty({ description: 'Minimum waiting time for withdrawals', required: false })
  @IsString()
  @IsOptional()
  minWithdrawalWait?: string;

  @ApiProperty({ description: 'Office status', enum: ['active', 'inactive'], default: 'active' })
  @IsEnum(['active', 'inactive'])
  @IsOptional()
  status?: string;

  @ApiProperty({ description: 'Email of the assigned administrator' })
  @IsString()
  agentAssigned: string;
}