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
    cbu?: string;
}

interface DepositResult {
    status: string;
    message: string;
    transaction?: DepositResponseTransaction;
}

class ExternalDepositDto {
    amount: number;
    email: string;
    idClient: string;
    cbu: string;
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

            if (!body.amount || !body.email || !body.idClient) {
                throw new HttpException(
                    'Se requieren los campos amount, email e idClient',
                    HttpStatus.BAD_REQUEST
                );
            }

            const cbuToUse = body.cbu || 'DEFAULT_CBU';

            // Obtener todas las transacciones
            const allTransactions = await this.ipnService.getTransactions();

            // PASO 1: Verificar si ya se procesó este idTransaction específico
            if (body.idTransaction) {
                const existingTransaction = allTransactions.find(tx =>
                    tx.external_reference === body.idTransaction ||
                    tx.id.toString() === body.idTransaction
                );

                if (existingTransaction) {
                    console.log(`El idTransaction ${body.idTransaction} ya fue utilizado anteriormente`);
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

            // PASO 2: Verificar si la combinación monto/email ha sido validada automáticamente antes
            const autoValidatedTransactions = allTransactions.filter(tx =>
                tx.type === 'deposit' &&
                Math.abs(tx.amount - body.amount) < 0.01 &&
                tx.payer_email?.toLowerCase() === body.email.toLowerCase() &&
                tx.status === 'Aceptado' &&
                tx.description?.includes('validado automáticamente')
            );

            // Dentro del controlador, modificar la sección donde verifica si la combinación ya fue validada
            if (autoValidatedTransactions.length > 0) {
                console.log(`Ya existe una validación automática para monto=${body.amount}, email=${body.email}`);

                // En lugar de rechazar, creamos una transacción pendiente que requerirá verificación manual
                const idTransferencia = body.idTransaction || `deposit_${Date.now()}`;
                const pendingTransaction: Transaction = {
                    id: idTransferencia,
                    type: 'deposit',
                    amount: body.amount,
                    status: 'Pending', // Marcamos como pendiente en lugar de rechazado
                    date_created: new Date().toISOString(),
                    description: 'Depósito pendiente: Se requiere verificación manual (combinación usada anteriormente)',
                    cbu: cbuToUse,
                    idCliente: body.idClient,
                    payer_email: body.email,
                    external_reference: body.idTransaction
                };

                // Guardar transacción pendiente
                await this.ipnService.saveTransaction(pendingTransaction);

                // Devolver respuesta que indica que se requiere verificación manual
                return {
                    status: 'pending',
                    message: 'Esta combinación de monto y email ya fue validada anteriormente, se requiere verificación manual',
                    transaction: {
                        idClient: body.idClient,
                        type: 'deposit',
                        amount: body.amount,
                        email: body.email,
                        status: 'Pending',
                        date_created: pendingTransaction.date_created,
                        description: pendingTransaction.description,
                        cbu: cbuToUse
                    }
                };
            }

            // PASO 3: Buscar transacción original que coincida (para validación automática)
            // Solo buscar transacciones reales (no las validadas automáticamente)
            const matchingTransaction = allTransactions.find(tx =>
                tx.type === 'deposit' &&
                Math.abs(tx.amount - body.amount) < 0.01 &&
                tx.payer_email?.toLowerCase() === body.email.toLowerCase() &&
                (tx.status === 'Aceptado' || tx.status === 'approved') &&
                !tx.description?.includes('validado automáticamente')
            );

            if (matchingTransaction) {
                console.log('¡Encontrada transacción coincidente real!', matchingTransaction);

                // Verificar si esta transacción original ya fue usada para validar otra
                const alreadyUsedForValidation = allTransactions.some(tx =>
                    tx.description?.includes('validado automáticamente') &&
                    tx.reference_transaction === matchingTransaction.id.toString()
                );

                if (alreadyUsedForValidation) {
                    console.log(`La transacción original ${matchingTransaction.id} ya fue usada para validar otra transacción`);
                    return {
                        status: 'error',
                        message: 'La transacción original ya fue utilizada para validar otro depósito',
                        transaction: {
                            idClient: body.idClient,
                            type: 'deposit',
                            amount: body.amount,
                            email: body.email,
                            status: 'Rechazado',
                            date_created: new Date().toISOString(),
                            description: 'Transacción rechazada: Pago original ya validado',
                            cbu: cbuToUse
                        }
                    };
                }

                // Crear transacción aceptada
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
                    external_reference: body.idTransaction,
                    reference_transaction: matchingTransaction.id.toString() // Referencia a la transacción original
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

            // Si llegamos aquí, seguimos con el flujo normal
            const depositData: RussiansDepositData = {
                cbu: cbuToUse,
                amount: body.amount,
                idTransferencia: body.idTransaction || `deposit_${Date.now()}`,
                dateCreated: new Date().toISOString(),
                idCliente: body.idClient,
                email: body.email,
                externalReference: body.idTransaction
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