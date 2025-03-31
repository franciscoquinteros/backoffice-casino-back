import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { Transaction } from '../transaction.types';
import { IpnService } from '../transactions.service';
import { RussiansDepositData } from './russians-deposit.types';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';

interface DepositResponseTransaction {
    idClient: string;
    type: 'deposit' | 'withdraw';
    amount: number;
    email: string;
    status?: string;
    date_created?: string;
    description?: string;
    cbu?: string; // Añadir CBU a la respuesta
}

interface DepositResult {
    status: string;
    message: string;
    transaction?: DepositResponseTransaction;
}

// Definir el DTO para el cuerpo de la solicitud
class ExternalDepositDto {
    amount: number;
    email: string;
    idClient: string;
    cbu: string; // Campo CBU opcional
    idTransaction: string;
}

@ApiTags('Deposits')
@Controller()
export class ExternalDepositController {
    constructor(private readonly ipnService: IpnService) { }

    @Post('deposit')
    @ApiOperation({ summary: 'Registrar un nuevo depósito desde sistema externo' })
    @ApiBody({ type: ExternalDepositDto })
    @ApiResponse({ status: 200, description: 'Depósito registrado exitosamente' })
    @ApiResponse({ status: 400, description: 'Datos inválidos' })
    async handleExternalDeposit(@Body() body: ExternalDepositDto): Promise<DepositResult> {
        try {
            console.log('Recibida solicitud de depósito externo:', body);
            console.log('Email recibido:', body.email);
            console.log('ID Transacción recibido:', body.idTransaction || 'No proporcionado');

            if (!body.amount || !body.email || !body.idClient) {
                throw new HttpException(
                    'Se requieren los campos amount, email e idClient',
                    HttpStatus.BAD_REQUEST
                );
            }

            const cbuToUse = body.cbu || 'DEFAULT_CBU';
            
            // PASO 1: Verificar si el idTransaction ya fue utilizado anteriormente
            if (body.idTransaction) {
                const allTransactions = await this.ipnService.getTransactions();
                const existingTransaction = allTransactions.find(tx => 
                    tx.external_reference === body.idTransaction || 
                    tx.id.toString() === body.idTransaction
                );

                if (existingTransaction) {
                    console.log(`El idTransaction ${body.idTransaction} ya fue utilizado anteriormente`);
                    
                    // Devolver respuesta de error
                    return {
                        status: 'error',
                        message: 'Este ID de transacción ya fue procesado anteriormente',
                        transaction: {
                            idClient: body.idClient,
                            type: 'deposit',
                            amount: body.amount,
                            email: body.email,
                            status: 'Rechazado',
                            date_created: new Date().toISOString(),
                            description: 'Transacción rechazada: ID de transacción duplicado',
                            cbu: cbuToUse
                        }
                    };
                }
            }

            // PASO 2: Buscar transacciones existentes que coincidan por monto y email
            const allTransactions = await this.ipnService.getTransactions();
            console.log(`Buscando coincidencias entre ${allTransactions.length} transacciones...`);
            
            const matchingTransaction = allTransactions.find(tx => 
                tx.type === 'deposit' && 
                Math.abs(tx.amount - body.amount) < 0.01 && 
                tx.payer_email?.toLowerCase() === body.email.toLowerCase() &&
                (tx.status === 'Aceptado' || tx.status === 'approved')
            );

            if (matchingTransaction) {
                console.log('¡Encontrada transacción coincidente!', matchingTransaction);
                
                // Crear transacción aceptada usando el idTransaction proporcionado
                const idTransferencia = body.idTransaction || `deposit_${Date.now()}`;
                const autoApprovedTransaction: Transaction = {
                    id: idTransferencia,
                    type: 'deposit',
                    amount: body.amount,
                    status: 'Aceptado',
                    date_created: new Date().toISOString(),
                    description: 'Depósito validado automáticamente',
                    cbu: cbuToUse,
                    idCliente: body.idClient,
                    payer_email: body.email,
                    external_reference: body.idTransaction // Guardar idTransaction como referencia externa
                };
                
                await this.ipnService.saveTransaction(autoApprovedTransaction);
                
                return {
                    status: 'success',
                    message: 'true',
                    transaction: {
                        idClient: body.idClient,
                        type: 'deposit',
                        amount: body.amount,
                        email: body.email,
                        status: 'Aceptado',
                        date_created: autoApprovedTransaction.date_created,
                        description: autoApprovedTransaction.description,
                        cbu: cbuToUse
                    }
                };
            }

            // Flujo normal si no hay coincidencia
            const depositData: RussiansDepositData = {
                cbu: cbuToUse,
                amount: body.amount,
                idTransferencia: body.idTransaction || `deposit_${Date.now()}`,
                dateCreated: new Date().toISOString(),
                idCliente: body.idClient,
                email: body.email,
                externalReference: body.idTransaction // Guardar como referencia externa
            };

            const result = await this.ipnService.validateWithMercadoPago(depositData);

            if (!result.transaction.payer_email) {
                await this.ipnService.updateTransactionEmail(
                    result.transaction.id.toString(),
                    body.email
                );
            }

            return {
                status: result.status,
                message: result.status === 'success' ? 'true' : result.message,
                transaction: {
                    idClient: body.idClient,
                    type: 'deposit',
                    amount: typeof result.transaction.amount === 'number'
                        ? result.transaction.amount
                        : parseFloat(String(result.transaction.amount)),
                    email: body.email,
                    status: result.transaction.status,
                    date_created: result.transaction.date_created,
                    description: result.transaction.description || 'Pending deposit',
                    cbu: cbuToUse
                }
            };
        } catch (error) {
            console.error('Error al procesar depósito externo:', error);
            throw new HttpException(
                error.message || 'Error al procesar el depósito',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
}