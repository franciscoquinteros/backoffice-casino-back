import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from './entities/refresh-token.entity';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RefreshTokenService {
    private readonly logger = new Logger(RefreshTokenService.name);

    constructor(
        @InjectRepository(RefreshToken)
        private refreshTokenRepository: Repository<RefreshToken>,
        private configService: ConfigService,
    ) { }

    /**
     * Crea un nuevo refresh token para un usuario
     */
    async createRefreshToken(userId: string): Promise<RefreshToken> {
        try {
            this.logger.debug(`Creando refresh token para userId: ${userId}`);

            // Convertir userId a número
            const userIdNum = parseInt(userId);
            this.logger.debug(`userId convertido a número: ${userIdNum}`);

            const refreshToken = this.refreshTokenRepository.create({
                userId: userIdNum,
                token: uuidv4(),
                expiresAt: new Date(Date.now() + this.getRefreshTokenTTL() * 1000),
                isRevoked: false,
            });

            this.logger.debug('Token creado, guardando en la base de datos...');
            const savedToken = await this.refreshTokenRepository.save(refreshToken);
            this.logger.debug(`Token guardado con éxito, ID: ${savedToken.id}`);

            return savedToken;
        } catch (error) {
            this.logger.error(`Error al crear refresh token: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Encuentra un token por su valor
     */
    async findTokenByValue(token: string): Promise<RefreshToken> {
        return this.refreshTokenRepository.findOne({
            where: { token },
            relations: ['user']
        });
    }

    /**
     * Revoca todos los tokens anteriores de un usuario
     */
    async revokeTokensByUser(userId: string): Promise<void> {
        await this.refreshTokenRepository.update(
            { userId: parseInt(userId), isRevoked: false },
            { isRevoked: true }
        );
    }

    /**
     * Valida un token y devuelve el usuario asociado si es válido
     */
    async validateRefreshToken(token: string): Promise<string> {
        const refreshToken = await this.findTokenByValue(token);

        if (!refreshToken) {
            this.logger.warn('Intentando usar un refresh token inexistente');
            throw new UnauthorizedException('Invalid refresh token');
        }

        if (refreshToken.isRevoked) {
            this.logger.warn(`El refresh token ${refreshToken.id} ha sido revocado previamente`);
            throw new UnauthorizedException('Refresh token has been revoked');
        }

        if (new Date() > refreshToken.expiresAt) {
            this.logger.warn(`El refresh token ${refreshToken.id} ha expirado`);
            throw new UnauthorizedException('Refresh token has expired');
        }

        return refreshToken.userId.toString();
    }

    /**
     * Revoca un token específico
     */
    async revokeToken(token: string): Promise<void> {
        const refreshToken = await this.findTokenByValue(token);
        if (refreshToken) {
            refreshToken.isRevoked = true;
            await this.refreshTokenRepository.save(refreshToken);
        }
    }

    /**
     * Obtiene el tiempo de vida del refresh token desde la configuración o usa un valor predeterminado
     * (30 días en segundos)
     */
    private getRefreshTokenTTL(): number {
        return this.configService.get<number>('REFRESH_TOKEN_TTL', 30 * 24 * 60 * 60);
    }
} 