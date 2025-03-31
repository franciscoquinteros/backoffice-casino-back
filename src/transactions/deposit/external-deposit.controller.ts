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
            console.log('CBU recibido:', body.cbu || 'No proporcionado');

            if (!body.amount || !body.email || !body.idClient) {
                throw new HttpException(
                    'Se requieren los campos amount, email e idClient',
                    HttpStatus.BAD_REQUEST
                );
            }

            // Usar el CBU proporcionado o un valor predeterminado
            const cbuToUse = body.cbu || 'DEFAULT_CBU';

            // *** NUEVO CÓDIGO: Buscar transacciones existentes que coincidan por monto y email ***
            const allTransactions = await this.ipnService.getTransactions();
            console.log(`Buscando coincidencias entre ${allTransactions.length} transacciones...`);

            // Buscar coincidencias exactas por monto y email (con estado Aceptado)
            const matchingTransaction = allTransactions.find(tx =>
                tx.type === 'deposit' &&
                Math.abs(tx.amount - body.amount) < 0.01 &&
                tx.payer_email?.toLowerCase() === body.email.toLowerCase() &&
                (tx.status === 'Aceptado' || tx.status === 'approved')
            );

            if (matchingTransaction) {
                console.log('¡Encontrada transacción coincidente!', matchingTransaction);

                // Crear directamente una transacción aceptada
                const idTransferencia = `deposit_${Date.now()}`;
                const autoApprovedTransaction: Transaction = {
                    id: idTransferencia,
                    type: 'deposit',
                    amount: body.amount,
                    status: 'Aceptado', // Marcamos como Aceptado directamente
                    date_created: new Date().toISOString(),
                    description: 'Depósito validado automáticamente',
                    cbu: cbuToUse,
                    idCliente: body.idClient,
                    payer_email: body.email
                };

                // Guardar la transacción
                await this.ipnService.saveTransaction(autoApprovedTransaction);

                // Devolver respuesta exitosa
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
            // *** FIN DEL NUEVO CÓDIGO ***

            // Si no hay coincidencia, seguir con el flujo normal
            const depositData: RussiansDepositData = {
                cbu: cbuToUse,
                amount: body.amount,
                idTransferencia: `deposit_${Date.now()}`,
                dateCreated: new Date().toISOString(),
                idCliente: body.idClient,
                email: body.email
            };

            console.log('Datos enviados a validateWithMercadoPago, email:', depositData.email, 'cbu:', depositData.cbu);

            // Llamar al servicio para procesar el depósito
            const result = await this.ipnService.validateWithMercadoPago(depositData);

            console.log('Resultado de validateWithMercadoPago:', result);
            console.log('Email en resultado:', result.transaction.payer_email);

            // Si el email no se guardó en la transacción, actualizarlo manualmente
            if (!result.transaction.payer_email) {
                console.log('Email no encontrado en la transacción, actualizando manualmente...');

                // Actualizar el email en la transacción
                await this.ipnService.updateTransactionEmail(
                    result.transaction.id.toString(),
                    body.email
                );
            }

            // Crear y enviar la respuesta en el formato requerido
            const response: DepositResult = {
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
                    cbu: cbuToUse // Incluir el CBU en la respuesta
                }
            };

            return response;
        } catch (error) {
            console.error('Error al procesar depósito externo:', error);
            throw new HttpException(
                error.message || 'Error al procesar el depósito',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
}