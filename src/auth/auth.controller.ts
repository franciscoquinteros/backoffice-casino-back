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
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    @HttpCode(HttpStatus.OK) // Un login exitoso suele ser 200 OK
    @ApiOperation({ summary: 'Authenticate user and return JWT' })
    @ApiResponse({ status: 200, description: 'Authentication successful.' /*, type: LoginResponseDto */ }) // Define un DTO si quieres
    @ApiResponse({ status: 401, description: 'Unauthorized (Invalid Credentials / Inactive User).' })
    @ApiResponse({ status: 429, description: 'Too Many Requests.' })
    async login(@Body() loginDto: LoginDto) { // loginDto ahora tiene { email, password, viewOfficeId? }
        this.logger.debug(`Login attempt for email: ${loginDto.email}${loginDto.viewOfficeId ? ` (requesting view for office ${loginDto.viewOfficeId})` : ''}`);
        try {
            const validatedUser = await this.authService.validateUser(loginDto.email, loginDto.password);
            this.logger.debug(`User ${loginDto.email} validated, proceeding to generate token.`);

            // --- PASA viewOfficeId (si existe) AL SERVICIO ---
            const loginResult = await this.authService.login(validatedUser, loginDto.viewOfficeId); // <-- Cambio aquí

            this.logger.log(`User ${loginDto.email} logged in successfully (effective office: ${loginResult.user.officeId}).`);
            return loginResult;

        } catch (error) {
            // ... (tu manejo de error actual) ...
            if (!(error instanceof UnauthorizedException)) {
                this.logger.error(`Unexpected error during login for ${loginDto.email}: ${error.message}`, error.stack);
            }
            throw error; // Re-lanza para que NestJS devuelva el status correcto
        }
    }
}