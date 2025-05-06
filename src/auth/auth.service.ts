// src/auth/auth.service.ts (NESTJS BACKEND)
import { Injectable, UnauthorizedException, Logger, NotFoundException } from '@nestjs/common'; // <-- Añade NotFoundException
import { UserService } from '../users/user.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { OfficeService } from 'src/office/office.service'; // <-- 1. Importa OfficeService (ajusta ruta)
import { User } from '../users/entities/user.entity'; // Importa la entidad User

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

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
    constructor(
        private readonly userService: UserService,
        private readonly jwtService: JwtService,
        private readonly officeService: OfficeService // <-- 2. Inyecta OfficeService
    ) {
         // Verifica logger en constructor
         if (!this.logger) { console.error("CRITICAL: Logger is UNDEFINED in AuthService constructor!"); }
         else { this.logger.log("AuthService Initialized - Logger OK."); }
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
     * @returns Objeto con accessToken y datos del usuario para NextAuth.
     */
    async login(
        user: ValidatedUser,
        requestedOfficeId?: string // <-- 3. Acepta el ID de oficina solicitado
    ): Promise<{ accessToken: string; user: any }> {

        let officeIdToUseInToken: string = user.office; // 4. Por defecto, usa la oficina REAL del usuario

        // --- Lógica de Super Admin ---
        if (user.role === 'superadmin' && requestedOfficeId && requestedOfficeId !== user.office) {
            // 5. Si es superadmin y pidió una oficina DIFERENTE a la suya
            try {
                // Valida que la oficina solicitada exista en la BD
                this.logger.debug(`Superadmin ${user.id} requested office ${requestedOfficeId}. Validating...`);
                const targetOffice = await this.officeService.findOne(+requestedOfficeId); // Busca por ID numérico
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
        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            officeId: officeIdToUseInToken, // <-- 6. USA LA OFICINA DETERMINADA
        };
        const accessToken = this.jwtService.sign(payload);
        this.logger.debug(`JWT generated for user: ${user.email}`);

        // Devuelve la estructura que NextAuth necesita
        return {
            accessToken: accessToken,
            user: { // Asegúrate que este objeto coincida con tu interfaz User de next-auth.d.ts
                id: user.id.toString(),
                email: user.email,
                name: user.username,   // O user.name
                role: user.role,
                officeId: officeIdToUseInToken, // <-- 7. DEVUELVE LA OFICINA USADA en el token
                // status: user.status, // Probablemente no necesario en sesión NextAuth
            },
        };
    }
}