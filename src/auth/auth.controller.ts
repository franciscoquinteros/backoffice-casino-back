// src/auth/auth.controller.ts (NESTJS BACKEND)
import { Controller, Post, Body, HttpCode, HttpStatus, Logger, UseGuards, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ThrottlerGuard } from '@nestjs/throttler';
// --- Quita ApiExcludeController si quieres documentar el login ---
// import { ApiExcludeController } from '@nestjs/swagger';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'; // Para documentar

// @ApiExcludeController()
@ApiTags('Authentication') // Mejor documentarlo
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
    private readonly logger = new Logger(AuthController.name);
    constructor(private readonly authService: AuthService) {}

    @Post('login')
    @HttpCode(HttpStatus.OK) // Un login exitoso suele ser 200 OK
    @ApiOperation({ summary: 'Authenticate user and return JWT' })
    @ApiResponse({ status: 200, description: 'Authentication successful.' /*, type: LoginResponseDto */ }) // Define un DTO si quieres
    @ApiResponse({ status: 401, description: 'Unauthorized (Invalid Credentials / Inactive User).' })
    @ApiResponse({ status: 429, description: 'Too Many Requests.' })
    async login(@Body() loginDto: LoginDto) { // Recibe email/password
        this.logger.debug(`Login attempt for email: ${loginDto.email}`);
        try {
            // --- PASO 1: Validar usuario ---
            const validatedUser = await this.authService.validateUser(loginDto.email, loginDto.password);
            // Si validateUser falla, lanzará UnauthorizedException y no continuará

            this.logger.debug(`User ${loginDto.email} validated, proceeding to generate token.`);

            // --- PASO 2: Generar token y respuesta ---
            // Llama al nuevo método login del servicio pasando el usuario validado
            const loginResult = await this.authService.login(validatedUser);

            this.logger.log(`User ${loginDto.email} logged in successfully.`);
            // Devuelve el resultado de authService.login ({ accessToken, user: {...} })
            return loginResult;

        } catch (error) {
            // Loguear el error que ocurrió (validateUser ya loguea sus propios errores)
            if (!(error instanceof UnauthorizedException)) {
                 // Loguear errores inesperados
                 this.logger.error(`Unexpected error during login for ${loginDto.email}: ${error.message}`, error.stack);
            }
            // Re-lanzar la excepción para que NestJS la maneje y devuelva el status HTTP correcto (ej: 401)
            throw error;
        }
    }
}