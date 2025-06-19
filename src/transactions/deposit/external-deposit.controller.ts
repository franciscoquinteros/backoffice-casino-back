import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { Transaction } from '../transaction.types'; // Asegúrate de que Transaction esté correctamente exportado
import { IpnService } from '../transactions.service'; // Asegúrate de que IpnService esté correctamente exportado
import { RussiansDepositData } from './russians-deposit.types'; // Asegúrate de que RussiansDepositData esté correctamente definido y exportado
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsEmail, IsOptional, IsNotEmpty, Min } from 'class-validator';

// Estructura simplificada para la respuesta del endpoint
interface SimpleResponse {
    status: string; // 'success' or 'error'
    message: string;
}

// Updated DTO to match the expected request payload
class ExternalDepositDto {
    @ApiProperty({
        description: 'Monto del depósito',
        example: 100.00,
        minimum: 0.01
    })
    @IsNumber()
    @Min(0.01)
    amount: number;

    @ApiProperty({
        description: 'Nombre del titular de la cuenta',
        example: 'Juan Pérez',
        required: false
    })
    @IsOptional()
    @IsString()
    nombreDelTitular?: string;

    @ApiProperty({
        description: 'Email del depositante',
        example: 'user@example.com'
    })
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiProperty({
        description: 'DNI del depositante',
        example: '38295248'
    })
    @IsString()
    @IsNotEmpty()
    DNI: string;

    @ApiProperty({
        description: 'CBU de la cuenta bancaria',
        example: '1234567890123456789012'
    })
    @IsString()
    @IsNotEmpty()
    cbu: string;

    @ApiProperty({
        description: 'ID del cliente',
        example: '12345'
    })
    @IsString()
    @IsNotEmpty()
    idClient: string;

    @ApiProperty({
        description: 'Nombre de usuario del depositante',
        example: 'juanperez123'
    })
    @IsString()
    @IsNotEmpty()
    username: string;

    @ApiProperty({
        description: 'ID único de la transacción',
        example: 'DEP_20250117_001'
    })
    @IsString()
    @IsNotEmpty()
    idTransaction: string;

    @ApiProperty({
        description: 'ID del agente/oficina',
        example: 'OFICINA_001',
        required: true
    })
    @IsString()
    @IsNotEmpty()
    idAgent: string;

    // Campos adicionales opcionales para compatibilidad
    @ApiProperty({
        description: 'Email o DNI (campo de compatibilidad)',
        example: 'user@example.com',
        required: false
    })
    @IsOptional()
    @IsString()
    emailOrDni?: string;

    @ApiProperty({
        description: 'Fecha de creación (ISO string)',
        example: '2025-01-17T15:30:00.000Z',
        required: false
    })
    @IsOptional()
    @IsString()
    dateCreated?: string;
}

@ApiTags('Deposits')
@Controller() // Un prefijo para el controlador puede ser útil
export class ExternalDepositController {
    constructor(private readonly ipnService: IpnService) { }

    @Post('deposit') // Endpoint específico para depósitos externos
    @ApiOperation({ summary: 'Registrar un nuevo depósito desde sistema externo y validar' })
    @ApiBody({ type: ExternalDepositDto })
    @ApiResponse({ status: 200, description: 'Depósito procesado exitosamente (puede estar Pendiente o Aceptado)' })
    @ApiResponse({ status: 400, description: 'Datos inválidos o CBU incorrecto para la oficina' })
    @ApiResponse({ status: 500, description: 'Error interno del servidor' })
    async handleExternalDeposit(@Body() body: ExternalDepositDto): Promise<SimpleResponse> {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        console.log(`[${requestId}] INICIO: Solicitud de depósito externo recibida:`, JSON.stringify(body));

        try {
            // 1. Validación básica de campos requeridos en el Controller
            if (!body.amount || !body.username || !body.email || !body.DNI || !body.idClient || !body.cbu || !body.idTransaction || !body.idAgent) {
                console.warn(`[${requestId}] Validación básica fallida: Faltan campos requeridos.`);
                throw new HttpException('Campos requeridos: amount, username, email, DNI, idClient, cbu, idTransaction, idAgent', HttpStatus.BAD_REQUEST);
            }

            // 2. Validaciones adicionales
            if (typeof body.amount !== 'number' || body.amount <= 0) {
                console.warn(`[${requestId}] Validación de monto fallida: ${body.amount}`);
                throw new HttpException('El campo amount debe ser un número positivo', HttpStatus.BAD_REQUEST);
            }

            // 3. Preparar los datos en el formato esperado por el servicio
            // Usamos body.idTransaction como idTransferencia y externalReference
            const depositData: RussiansDepositData = {
                cbu: body.cbu,
                amount: body.amount,
                idTransaction: body.idTransaction, // Usamos este como ID reportado
                dateCreated: body.dateCreated || new Date().toISOString(), // Usar fecha si viene, sino current
                idCliente: body.idClient,
                email: body.email, // Usar el nuevo campo email separado
                externalReference: body.idTransaction, // Puede ser útil guardar el idTransaction original aquí también
                idAgent: body.idAgent, // Este es el 'office'
                nombreDelTitular: body.nombreDelTitular, // Campos opcionales
                idTransferencia: body.idTransaction, // Este es el ID único del depósito reportado por el usuario
                // Campos adicionales nuevos
                username: body.username, // Nuevo campo username
                dni: body.DNI, // Nuevo campo DNI
                // Usar email como campo principal para payer_email
                payer_email: body.email, // Usar email como campo principal
            };

            console.log(`[${requestId}] Datos recibidos: username=${body.username}, email=${body.email}, DNI=${body.DNI}, idClient=${body.idClient}, amount=${body.amount}, cbu=${body.cbu}, idAgent=${body.idAgent}`);
            console.log(`[${requestId}] Llamando a ipnService.validateWithMercadoPago con datos mapeados`);

            // 4. Delegar la validación completa al servicio
            const result = await this.ipnService.validateWithMercadoPago(depositData);

            console.log(`[${requestId}] Resultado de ipnService.validateWithMercadoPago:`, JSON.stringify(result));

            // 5. Interpretar el resultado del servicio y devolver la respuesta simplificada
            if (result.status === 'error') {
                // Si el servicio devuelve un error (ej: CBU inválido para la oficina), responder 400
                if (result.message?.includes('CBU proporcionado no es válido') || result.message?.includes('ID de transacción duplicado con estado de error')) {
                    console.warn(`[${requestId}] Error de validación reportado por servicio: ${result.message}`);
                    throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
                }
                // Otros errores del servicio pueden ser 500 internos si no son errores de validación de entrada
                console.error(`[${requestId}] Error inesperado reportado por servicio: ${result.message}`);
                throw new HttpException(result.message || 'Error interno al procesar depósito', HttpStatus.INTERNAL_SERVER_ERROR);

            } else { // result.status === 'success'
                // El servicio devolvió éxito. El depósito está PENDING o ACEPTADO.
                // La respuesta simplificada solo necesita status 'success' y un mensaje si es necesario.
                console.log(`[${requestId}] Depósito procesado exitosamente por el servicio. Estado final: ${result.transaction.status}`);
                return {
                    status: 'success',
                    // Puedes incluir un mensaje más detallado si quieres, basado en result.message
                    message: result.message // El servicio ya devuelve un mensaje descriptivo
                };
            }

        } catch (error) {
            console.error(`[${requestId}] Error al procesar depósito externo:`, error);
            if (error instanceof HttpException) {
                throw error; // Relanzar excepciones HTTP controladas
            }
            // Para cualquier otro error no manejado específicamente
            throw new HttpException(error.message || 'Error interno del servidor', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // NOTA: La validación de CBU más compleja (contra cuentas configuradas y oficina)
    // ya está implementada DENTRO del IpnService (isValidCbu allí).
    // Si esta función aquí no hace nada más allá de un chequeo de formato básico,
    // podría incluso eliminarse y dejar que el servicio la maneje.
    // Si la dejas, asegúrate de que no esté consultando la base de datos o el estado global del servicio.
    private isValidCbu(cbu: string): boolean {
        // Implementación básica (ejemplo: solo verificar que no esté vacío)
        return cbu && cbu.length > 0;
    }
}