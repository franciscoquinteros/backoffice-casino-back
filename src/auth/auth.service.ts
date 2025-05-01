// src/auth/auth.service.ts (NESTJS BACKEND)
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { UserService } from '../users/user.service'; // Ajusta la ruta
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt'; // <--- 1. Importa JwtService

// Asegúrate que este tipo (o tu UserEntity) incluya officeId y username/name
interface UserWithOffice {
    id: string | number;
    email: string;
    username: string; // O 'name' si así se llama en tu entidad
    password?: string;
    role: string;
    status: string;
    office: string; // <-- Campo clave
}

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
    constructor(
        private readonly userService: UserService,
        private readonly jwtService: JwtService, // <--- 2. Inyecta JwtService
    ) { }

    async validateUser(email: string, passwordInput: string): Promise<UserWithOffice> {
        this.logger.debug(`Validating user: ${email}`);
        const user = await this.userService.findByEmail(email); // Asume que devuelve UserWithOffice (¡CON officeId!)

        if (!user) {
            this.logger.warn(`Validation failed: User ${email} not found.`);
            throw new UnauthorizedException('Invalid credentials');
        }
        if (!user.password) {
            this.logger.error(`Validation error: User ${email} has no password hash.`);
            throw new UnauthorizedException('Authentication configuration error.');
        }

        const isPasswordValid = await bcrypt.compare(passwordInput, user.password);

        if (!isPasswordValid) {
            this.logger.warn(`Validation failed: Invalid password for user ${email}.`);
            throw new UnauthorizedException('Invalid credentials');
        }

        if (user.status === 'inactive') {
            this.logger.warn(`Validation failed: User ${email} is inactive.`);
            throw new UnauthorizedException('User account is inactive');
        }

        // Verifica que officeId exista ANTES de devolver el usuario validado
        if (!user.office) {
            this.logger.error(`Validation error: User ${email} is valid but has no officeId assigned.`);
            throw new UnauthorizedException('User account is missing office assignment.');
        }

        this.logger.debug(`User ${email} validated successfully.`);
        // Devolvemos el usuario validado (sin el password hash)
        const { password, ...result } = user;
        return result as UserWithOffice;
    }

    // --- 3. AÑADE EL MÉTODO LOGIN ---
    /**
     * Genera el token JWT y estructura la respuesta final para el login.
     * @param user - El objeto usuario YA VALIDADO por validateUser (debe incluir officeId)
     * @returns Objeto con accessToken y datos del usuario anidados.
     */
    async login(user: UserWithOffice) {
        this.logger.debug(`Generating JWT for user: ${user.email} in office ${user.office}`);
        const payload = {
            sub: user.id, // Subject (ID del usuario)
            email: user.email,
            role: user.role,
            officeId: user.office, // Incluye la oficina en el payload del token
        };

        const accessToken = this.jwtService.sign(payload); // Firma el token
        this.logger.debug(`JWT generated for user: ${user.email}`);

        // Estructura la respuesta EXACTAMENTE como la necesita NextAuth authorize
        return {
            accessToken: accessToken,
            user: {
                id: user.id.toString(),
                email: user.email,
                name: user.username,   // O user.name
                role: user.role,
                status: user.status,   // Status es opcional aquí, pero lo incluimos como estaba antes
                officeId: user.office, // Incluye officeId aquí también para el frontend
            },
        };
    }
    // --- FIN DEL MÉTODO LOGIN ---
}