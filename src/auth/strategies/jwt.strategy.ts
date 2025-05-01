// Archivo: src/auth/strategies/jwt.strategy.ts

import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

// 1. Cambia 'office' a 'officeId' aquí para que coincida con el payload REAL
interface JwtPayload {
    sub: string | number;
    email: string;
    role: string;
    officeId: string; // <-- CAMBIADO: Debe coincidir con lo que AuthService pone en el token
    // iat?: number;
    // exp?: number;
}

// 2. Decide qué nombre quieres en request.user.
//    Mantenemos 'office' aquí para ser consistentes con los controladores que ya usan request.user.office
interface AuthenticatedUserPayload {
    id: string | number;
    email: string;
    role: string;
    office: string; // <-- Mantenemos 'office' para request.user (más semántico)
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    private readonly logger = new Logger(JwtStrategy.name);

    constructor(
        private readonly configService: ConfigService,
        // private readonly userService: UserService, // Opcional
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('JWT_SECRET'),
        });
        this.logger.log(`JwtStrategy initialized. Expecting secret: ${configService.get<string>('JWT_SECRET') ? 'OK' : 'MISSING!'}`);
    }

    async validate(payload: JwtPayload): Promise<AuthenticatedUserPayload> {
        this.logger.debug(`Validating JWT payload for user ID: ${payload.sub}`, payload); // Loguear el payload recibido

        // 3. Cambia la validación para buscar 'officeId'
        if (!payload.sub || !payload.email || !payload.officeId) { // <-- CAMBIADO a officeId
            this.logger.warn('JWT validation failed: Payload missing required fields (sub, email, officeId).', payload); // <-- Mensaje de log actualizado
            throw new UnauthorizedException('Invalid token payload (missing required fields).');
        }

        // Opcional: Validaciones extra (usuario existe/activo)

        // 4. Mapea 'payload.officeId' a 'office' en el objeto retornado
        const userPayload: AuthenticatedUserPayload = {
            id: payload.sub,
            email: payload.email,
            role: payload.role,
            office: payload.officeId, // <-- Mapea payload.officeId a request.user.office
        };

        this.logger.debug(`JWT validation successful. Returning user payload for request.user:`, userPayload);
        return userPayload;
    }
}