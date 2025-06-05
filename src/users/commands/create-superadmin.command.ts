import { Command, CommandRunner, Option } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { UserService } from '../user.service';
import { CreateUserDto } from '../dto/create-user.dto';
import * as bcrypt from 'bcrypt';

@Command({ name: 'create-superadmin', description: 'Create a superadmin user' })
@Injectable()
export class CreateSuperadminCommand extends CommandRunner {
    constructor(private readonly userService: UserService) {
        super();
    }

    async run(passedParams: string[], options?: Record<string, any>): Promise<void> {
        const { username, email, password, office } = options;

        // Validaciones básicas
        if (!username || !email || !password || !office) {
            console.error('❌ Todos los parámetros son requeridos: --username, --email, --password, --office');
            process.exit(1);
        }

        if (password.length < 6) {
            console.error('❌ La contraseña debe tener al menos 6 caracteres');
            process.exit(1);
        }

        // Verificar si el email ya existe
        const existingUser = await this.userService.findByEmail(email);
        if (existingUser) {
            console.error(`❌ Ya existe un usuario con el email: ${email}`);
            process.exit(1);
        }

        try {
            // Crear el superadmin
            const createUserDto: CreateUserDto = {
                username,
                email,
                password,
                role: 'superadmin',
                office
            };

            const superadmin = await this.userService.create(createUserDto);

            console.log('✅ Superadmin creado exitosamente:');
            console.log(`   ID: ${superadmin.id}`);
            console.log(`   Username: ${superadmin.username}`);
            console.log(`   Email: ${superadmin.email}`);
            console.log(`   Role: ${superadmin.role}`);
            console.log(`   Office: ${superadmin.office}`);
            console.log(`   Created at: ${superadmin.createdAt}`);
        } catch (error) {
            console.error('❌ Error creando superadmin:', error.message);
            process.exit(1);
        }
    }

    @Option({
        flags: '-u, --username <username>',
        description: 'Username del superadmin',
    })
    parseUsername(val: string): string {
        return val;
    }

    @Option({
        flags: '-e, --email <email>',
        description: 'Email del superadmin',
    })
    parseEmail(val: string): string {
        return val;
    }

    @Option({
        flags: '-p, --password <password>',
        description: 'Password del superadmin',
    })
    parsePassword(val: string): string {
        return val;
    }

    @Option({
        flags: '-o, --office <office>',
        description: 'Office del superadmin',
    })
    parseOffice(val: string): string {
        return val;
    }
} 