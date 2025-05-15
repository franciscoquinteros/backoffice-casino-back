// src/auth/auth.controller.ts (NESTJS BACKEND)
import { Controller, Post, Body, HttpCode, HttpStatus, Logger, UseGuards, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ThrottlerGuard } from '@nestjs/throttler';
// --- Quita ApiExcludeController si quieres documentar el login ---
// import { ApiExcludeController } from '@nestjs/swagger';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'; // Para documentar
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

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

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Obtener un nuevo access token usando un refresh token' })
    @ApiResponse({ status: 200, description: 'Token actualizado correctamente' })
    @ApiResponse({ status: 401, description: 'Refresh token inválido o expirado' })
    async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
        this.logger.debug('Intento de refresh token');
        try {
            const result = await this.authService.refreshAccessToken(refreshTokenDto.refreshToken);
            this.logger.debug('Token refreshed successfully');
            return result;
        } catch (error) {
            this.logger.warn(`Refresh token failed: ${error.message}`);
            throw error;
        }
    }

    @Post('logout')
    @UseGuards(JwtAuthGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Cerrar sesión y revocar refresh token' })
    @ApiResponse({ status: 200, description: 'Sesión cerrada correctamente' })
    async logout(@Body() refreshTokenDto: RefreshTokenDto) {
        this.logger.debug('Logout attempt');
        await this.authService.logout(refreshTokenDto.refreshToken);
        return { message: 'Sesión cerrada correctamente' };
    }
}