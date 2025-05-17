// src/auth/auth.service.ts (NESTJS BACKEND)
import { Injectable, UnauthorizedException, Logger, NotFoundException } from '@nestjs/common'; // <-- Añade NotFoundException
import { UserService } from '../users/user.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { OfficeService } from 'src/office/office.service'; // <-- 1. Importa OfficeService (ajusta ruta)
import { User } from '../users/entities/user.entity'; // Importa la entidad User
import { RefreshTokenService } from './refresh-token.service';

// Interfaz ajustada para claridad y consistencia
// Asegúrate que userService.findByEmail devuelva estas propiedades
interface ValidatedUser {
    id: string | number;
    email: string;
    username: string;
    role: string;
    status: string;
    office: string; // ID de la oficina REAL del usuario (string)
}

interface TokenPayload {
    sub: string | number;
    email: string;
    role: string;
    officeId: string;
    username?: string;
}

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
    constructor(
        private readonly userService: UserService,
        private readonly jwtService: JwtService,
        private readonly officeService: OfficeService, // <-- 2. Inyecta OfficeService
        private readonly refreshTokenService: RefreshTokenService
    ) {
        // Verifica logger en constructor
        if (!this.logger) { console.error("CRITICAL: Logger is UNDEFINED in AuthService constructor!"); }
        else { this.logger.log("AuthService Initialized - Logger OK."); }

        // Verifica si refreshTokenService está inyectado correctamente
        if (!this.refreshTokenService) {
            this.logger.error("CRITICAL: RefreshTokenService is UNDEFINED in AuthService constructor!");
        } else {
            this.logger.log("RefreshTokenService inyectado correctamente en AuthService");
        }
    }

    async validateUser(email: string, passwordInput: string): Promise<ValidatedUser> { // Cambiado tipo retorno
        // ... (tu lógica de validación existente está bien) ...
        // ... (busca usuario, compara password, verifica status y que user.office exista) ...
        const user = await this.userService.findByEmail(email);
        if (!user || !user.password || !user.office || user.status === 'inactive' || !(await bcrypt.compare(passwordInput, user.password))) {
            // Simplifica el manejo de errores de validación
            this.logger.warn(`Validation failed for user: ${email}`);
            throw new UnauthorizedException('Invalid credentials or inactive user');
        }
        this.logger.debug(`User ${email} validated successfully.`);
        const { password, ...result } = user; // Quita el password
        // Asegúrate que el objeto devuelto coincida con ValidatedUser
        return {
            id: result.id,
            email: result.email,
            username: result.username, // o result.name
            role: result.role,
            status: result.status,
            office: result.office // ID de oficina real
        };
    }

    /**
     * Genera el token JWT y estructura la respuesta final para el login.
     * @param user - El objeto usuario YA VALIDADO por validateUser
     * @param requestedOfficeId - El ID de oficina opcional solicitado desde el login form (solo para superadmin)
     * @returns Objeto con accessToken, refreshToken y datos del usuario para NextAuth.
     */
    async login(
        user: ValidatedUser,
        requestedOfficeId?: string
    ): Promise<{ accessToken: string; refreshToken: string; user: any }> {

        let officeIdToUseInToken: string = user.office; // 4. Por defecto, usa la oficina REAL del usuario

        // --- Lógica de Super Admin ---
        if (user.role === 'superadmin' && requestedOfficeId && requestedOfficeId !== user.office) {
            // 5. Si es superadmin y pidió una oficina DIFERENTE a la suya
            try {
                // Valida que la oficina solicitada exista en la BD
                this.logger.debug(`Superadmin ${user.id} requested office ${requestedOfficeId}. Validating...`);
                const targetOffice = await this.officeService.findOne(requestedOfficeId); // Ya es string, no necesita conversión
                if (targetOffice) {
                    this.logger.log(`Superadmin ${user.id} login validated for viewing office ${requestedOfficeId} (${targetOffice.name})`);
                    officeIdToUseInToken = requestedOfficeId; // Usa la oficina solicitada
                } else {
                    this.logger.warn(`Superadmin ${user.id} requested non-existent office ${requestedOfficeId}. Using own office ${user.office}.`);
                    // Si no existe, se queda con la suya por seguridad
                }
            } catch (error) {
                if (error instanceof NotFoundException) {
                    this.logger.warn(`Superadmin ${user.id} requested non-existent office ${requestedOfficeId}. Using own office ${user.office}.`);
                } else {
                    this.logger.error(`Error validating requested office ${requestedOfficeId}: ${error.message}. Using own office ${user.office}.`);
                }
                // Si hay error validando, usa la oficina propia del superadmin
            }
        } else if (requestedOfficeId && requestedOfficeId !== user.office) {
            // Si NO es superadmin pero intenta especificar otra oficina (no debería pasar si el frontend lo oculta bien)
            this.logger.warn(`Non-admin user ${user.id} tried to log into office ${requestedOfficeId}. Denying and using own office ${user.office}.`);
            // Ignoramos la petición y usamos su oficina real
        }
        // --- Fin Lógica Super Admin ---

        this.logger.debug(`Generating JWT for user: ${user.email}, effective officeId: ${officeIdToUseInToken}`);
        const payload: TokenPayload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            officeId: officeIdToUseInToken,
            username: user.username,
        };

        // Creamos un accessToken con duración corta (30-60 minutos)
        const accessToken = this.jwtService.sign(payload, { expiresIn: '60m' });
        this.logger.debug(`Access token generado para usuario: ${user.email}`);

        // VERIFICACIÓN EXPLÍCITA: ¿Existe refreshTokenService?
        if (!this.refreshTokenService) {
            this.logger.error('CRITICAL: RefreshTokenService no disponible en login!');
            return {
                accessToken,
                refreshToken: '',
                user: {
                    id: user.id.toString(),
                    email: user.email,
                    name: user.username,
                    role: user.role,
                    officeId: officeIdToUseInToken,
                }
            };
        }

        this.logger.log(`INICIO del proceso de generación de refresh token para usuario ${user.id}`);
        try {
            // Creamos y almacenamos un refresh token (para larga duración)
            this.logger.debug(`Intentando crear refresh token para userId: ${user.id} (tipo: ${typeof user.id})`);

            // Verificación manual de las propiedades del refreshTokenService
            const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(this.refreshTokenService));
            this.logger.debug(`Métodos disponibles en refreshTokenService: ${methods.join(', ')}`);

            if (!this.refreshTokenService.createRefreshToken) {
                this.logger.error('CRITICAL: Método createRefreshToken no encontrado!');
                throw new Error('Método createRefreshToken no disponible');
            }

            const refreshTokenDoc = await this.refreshTokenService.createRefreshToken(user.id.toString());
            this.logger.debug(`Refresh token creado exitosamente: ${refreshTokenDoc.id}`);

            // Devuelve la estructura para NextAuth con ambos tokens
            this.logger.log(`FIN del proceso de generación de refresh token para usuario ${user.id}`);
            return {
                accessToken: accessToken,
                refreshToken: refreshTokenDoc.token,
                user: {
                    id: user.id.toString(),
                    email: user.email,
                    name: user.username,
                    role: user.role,
                    officeId: officeIdToUseInToken,
                },
            };
        } catch (error) {
            this.logger.error(`Error al crear refresh token: ${error.message}`, error.stack);
            // En caso de error con el refresh token, aún devuelve el access token
            return {
                accessToken: accessToken,
                refreshToken: "", // Token vacío en caso de error
                user: {
                    id: user.id.toString(),
                    email: user.email,
                    name: user.username,
                    role: user.role,
                    officeId: officeIdToUseInToken,
                },
            };
        }
    }

    /**
     * Refresca un token de acceso usando un refresh token
     */
    async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
        try {
            // Valida el refresh token y obtiene el userId
            const userId = await this.refreshTokenService.validateRefreshToken(refreshToken);

            // Obtiene el usuario por su ID
            const user = await this.userService.findById(userId);
            if (!user) {
                throw new UnauthorizedException('User not found');
            }

            // Genera un nuevo accessToken
            const payload: TokenPayload = {
                sub: user.id,
                email: user.email,
                role: user.role,
                officeId: user.office,
                username: user.username,
            };

            const accessToken = this.jwtService.sign(payload, { expiresIn: '60m' });

            return { accessToken };
        } catch (error) {
            this.logger.error(`Error al refrescar token: ${error.message}`);
            throw new UnauthorizedException('Failed to refresh token');
        }
    }

    /**
     * Cierra sesión revocando el refresh token
     */
    async logout(refreshToken: string): Promise<void> {
        await this.refreshTokenService.revokeToken(refreshToken);
    }
}