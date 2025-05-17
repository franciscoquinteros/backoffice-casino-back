import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AccountService } from '../../account/account.service';

interface CbuRotationResponse {
    cbu: string;
    amount_received: number;
}

@ApiTags('CBU')
@Controller('cbu')
export class CbuRotationController {
    constructor(private readonly accountService: AccountService) { }

    @Get()
    @ApiOperation({ summary: 'Get CBU based on rotation system' })
    @ApiQuery({ name: 'amount', required: true, description: 'Amount to be deposited', type: Number })
    @ApiQuery({ name: 'idAgent', required: true, description: 'ID of the office', type: String })
    @ApiResponse({ status: 200, description: 'CBU selected based on rotation system', type: 'object' })
    @ApiResponse({ status: 400, description: 'Missing required parameters' })
    @ApiResponse({ status: 404, description: 'No active accounts found for the specified office' })
    async getCbuByRotation(
        @Query('amount') amount: number,
        @Query('idAgent') officeId: string
    ): Promise<CbuRotationResponse> {
        if (!amount || !officeId) {
            throw new BadRequestException('amount and idAgent query parameters are required');
        }

        if (isNaN(Number(amount)) || Number(amount) <= 0) {
            throw new BadRequestException('amount must be a positive number');
        }

        console.log(`[CbuRotationController] getCbuByRotation: Requesting CBU for amount: ${amount}, officeId: ${officeId}`);

        const cbu = await this.accountService.getNextAvailableCbu(Number(amount), officeId);

        return {
            cbu,
            amount_received: Number(amount)
        };
    }
} 