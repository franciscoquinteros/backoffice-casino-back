import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { Transaction } from '../transaction.types';
import { IpnService } from '../transactions.service';
import { RussiansDepositData } from './russians-deposit.types';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';

// Estructura simplificada para la respuesta del endpoint
interface SimpleResponse {
    status: string;
    message: string;
}

// Updated DTO to match the expected request payload
class ExternalDepositDto {
    amount: number;
    emailOrDni: string;
    idClient: string;
    cbu: string;
    idTransaction: string;
    idAgent?: string;
    nombreDelTitular?: string;
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
    async handleExternalDeposit(@Body() body: ExternalDepositDto): Promise<SimpleResponse> {
        try {
            console.log('Recibida solicitud de depósito externo:', body);

            // Updated validation to use emailOrDni instead of email
            if (!body.amount || !body.emailOrDni || !body.idClient) {
                return {
                    status: 'error',
                    message: 'Fields amount, emailOrDni, and idClient are required'
                };
            }

            const cbuToUse = body.cbu || 'DEFAULT_CBU';

            // Validación de CBU
            if (!this.isValidCbu(cbuToUse)) {
                return {
                    status: 'error',
                    message: 'incorrect CBU'
                };
            }

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

                    // Guardar la transacción rechazada para historial
                    const rejectedTransaction: Transaction = {
                        id: body.idTransaction || `deposit_${Date.now()}`,
                        type: 'deposit',
                        amount: body.amount,
                        status: 'Rechazado',
                        date_created: new Date().toISOString(),
                        description: 'Transacción rechazada: ID de transacción duplicado',
                        cbu: cbuToUse,
                        idCliente: body.idClient,
                        payer_email: body.emailOrDni  // Updated to use emailOrDni
                    };

                    await this.ipnService.saveTransaction(rejectedTransaction);

                    return {
                        status: 'error',
                        message: 'Este ID de transacción ya fue procesado anteriormente'
                    };
                }
            }

            // PASO 2: Verificar si la combinación monto/email ha sido validada automáticamente antes
            const autoValidatedTransactions = allTransactions.filter(tx =>
                tx.type === 'deposit' &&
                Math.abs(tx.amount - body.amount) < 0.01 &&
                tx.payer_email?.toLowerCase() === body.emailOrDni.toLowerCase() &&
                tx.status === 'Aceptado' &&
                tx.description?.includes('validado automáticamente')
            );

            // Dentro del controlador, modificar la sección donde verifica si la combinación ya fue validada
            if (autoValidatedTransactions.length > 0) {
                console.log(`Ya existe una validación automática para monto=${body.amount}, email=${body.emailOrDni}`);

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
                    payer_email: body.emailOrDni, // Updated to use emailOrDni
                    external_reference: body.idTransaction
                };

                // Guardar transacción pendiente
                await this.ipnService.saveTransaction(pendingTransaction);

                // Devolver respuesta simplificada exitosa
                return {
                    status: 'success',
                    message: ''
                };
            }

            // PASO 3: Buscar transacción original que coincida (para validación automática)
            // Solo buscar transacciones reales (no las validadas automáticamente)
            const matchingTransaction = allTransactions.find(tx =>
                tx.type === 'deposit' &&
                Math.abs(tx.amount - body.amount) < 0.01 &&
                tx.payer_email?.toLowerCase() === body.emailOrDni.toLowerCase() &&
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

                    // Guardar transacción rechazada para historial
                    const rejectedTransaction: Transaction = {
                        id: body.idTransaction || `deposit_${Date.now()}`,
                        type: 'deposit',
                        amount: body.amount,
                        status: 'Rechazado',
                        date_created: new Date().toISOString(),
                        description: 'Transacción rechazada: Pago original ya validado',
                        cbu: cbuToUse,
                        idCliente: body.idClient,
                        payer_email: body.emailOrDni // Updated to use emailOrDni
                    };

                    await this.ipnService.saveTransaction(rejectedTransaction);

                    return {
                        status: 'error',
                        message: 'La transacción original ya fue utilizada para validar otro depósito'
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
                    payer_email: body.emailOrDni, // Updated to use emailOrDni
                    external_reference: body.idTransaction,
                    reference_transaction: matchingTransaction.id.toString() // Referencia a la transacción original
                };

                await this.ipnService.saveTransaction(autoApprovedTransaction);

                return {
                    status: 'success',
                    message: ''
                };
            }

            // Si llegamos aquí, seguimos con el flujo normal
            const depositData: RussiansDepositData = {
                cbu: cbuToUse,
                amount: body.amount,
                idTransferencia: body.idTransaction || `deposit_${Date.now()}`,
                dateCreated: new Date().toISOString(),
                idCliente: body.idClient,
                email: body.emailOrDni, // Updated to use emailOrDni
                externalReference: body.idTransaction
            };

            // Add optional fields if present
            if (body.idAgent) {
                depositData['idAgent'] = body.idAgent;
            }

            if (body.nombreDelTitular) {
                depositData['nombreDelTitular'] = body.nombreDelTitular;
            }

            const result = await this.ipnService.validateWithMercadoPago(depositData);

            if (!result.transaction.payer_email) {
                await this.ipnService.updateTransactionEmail(
                    result.transaction.id.toString(),
                    body.emailOrDni // Updated to use emailOrDni
                );
            }

            // Devolver respuesta simplificada
            return {
                status: result.status === 'success' ? 'success' : 'error',
                message: result.status === 'success' ? '' : result.message
            };
        } catch (error) {
            console.error('Error al procesar depósito externo:', error);
            return {
                status: 'error',
                message: error.message || 'Error al procesar el depósito'
            };
        }
    }

    // Método auxiliar para validar CBU
    private isValidCbu(cbu: string): boolean {
        // Implementar la validación de CBU específica para tu negocio
        // Por ejemplo, verificar si el CBU existe en las cuentas configuradas

        // Ejemplo simple de validación (implementar lógica real)
        return cbu && cbu.length > 0 && cbu !== 'INVALID_CBU';
    }
}