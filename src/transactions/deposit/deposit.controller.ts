import { Controller, Post, Body } from '@nestjs/common';
import { Transaction } from '../transaction.types';
import { IpnService } from '../transactions.service';
import { RussiansDepositData } from './russians-deposit.types';

interface ValidationResult {
    status: string;
    transaction?: Transaction;
    message: string;
}

@Controller('deposit')
export class DepositController {
    constructor(private readonly ipnService: IpnService) { }

    @Post('deposit')
    async handleDeposit(@Body() body: any) {
        const depositData: RussiansDepositData = {
            cbu: body.cbu || 'DEFAULT_CBU', // Ajusta según tu lógica
            amount: body.amount,
            idTransferencia: body.idTransferencia || `deposit_${Date.now()}`,
            dateCreated: new Date().toISOString(),
            idCliente: body.idCliente // Agregar esta línea
        };

        return this.ipnService.validateWithMercadoPago(depositData);
    }
}
