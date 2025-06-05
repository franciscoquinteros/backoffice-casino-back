// src/users/user.service.ts
import { Injectable, ConflictException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm'; // Importa FindOptionsWhere
import { User } from "./entities/user.entity";
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>
    ) { }

    // Método original para buscar todos (puede ser usado por admins)
    async findAll(): Promise<User[]> {
        return this.userRepository.find();
    }

    // --- NUEVO MÉTODO: Buscar por Oficina ---
    async findAllByOffice(officeId: string): Promise<User[]> {
        return this.userRepository.find({
            where: {
                office: officeId,
                status: 'active'
            }
        });
    }
    // --- FIN NUEVO MÉTODO ---

    // findByEmail debe devolver la propiedad 'office'
    async findByEmail(email: string): Promise<User | null> { // Devuelve null si no se encuentra
        // Asume que la entidad User tiene la columna 'office'
        return this.userRepository.findOne({ where: { email } });
    }

    // Método para buscar un usuario por su ID (string para soportar UUID y números convertidos a string)
    async findById(id: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { id: parseInt(id) } });
    }

    // findOne también debe devolver 'office'
    async findOne(id: number): Promise<User | null> { // Devuelve null si no se encuentra
        return this.userRepository.findOne({ where: { id } });
    }

    async findUsersByRoleAndOffice(role: string, officeId: string): Promise<User[]> {
        return this.userRepository.find({
            where: {
                role,
                office: officeId
            }
        });
    }

    // --- CREATE: Considera añadir la oficina del creador ---
    async create(createUserDto: CreateUserDto): Promise<User> {
        const existingUser = await this.userRepository.findOne({ where: { email: createUserDto.email } });
        if (existingUser) { throw new ConflictException('Email already exists'); }

        // --- Validación importante: Asegura que el DTO contenga una oficina ---
        if (!createUserDto.office) {
            console.error("UserService.create called without 'office' in DTO.");
            // Lanza BadRequest porque el dato falta en la entrada
            throw new BadRequestException("User must have an assigned office.");
        }
        // --- Fin Validación ---

        const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

        const user = this.userRepository.create({
            ...createUserDto, // Usa todos los datos del DTO, incluyendo 'office'
            password: hashedPassword,
        });
        return this.userRepository.save(user);
    }

    // Update User (la lógica interna puede quedarse, la autorización va en el controller)
    async updateUser(userId: number, updateUserDto: UpdateUserDto): Promise<User> {
        const user = await this.findOne(userId); // Usa findOne
        if (!user) { throw new NotFoundException('User not found'); }

        // Actualiza campos si vienen en el DTO
        // Object.assign(user, updateUserDto); // Forma más corta si los nombres coinciden
        if (updateUserDto.status !== undefined) { user.status = updateUserDto.status; }
        if (updateUserDto.withdrawal !== undefined) { user.withdrawal = updateUserDto.withdrawal; }
        if (updateUserDto.role !== undefined) { user.role = updateUserDto.role; }
        if (updateUserDto.office !== undefined) {
            // ¡Cuidado! Permitir cambiar oficina requiere lógica de autorización especial
            console.warn(`Updating office for user ${userId} to ${updateUserDto.office}. Ensure authorization.`);
            user.office = updateUserDto.office;
        }

        return this.userRepository.save(user);
    }

    // Update Password (la autorización va en el controller)
    async updatePassword(userId: number, updatePasswordDto: UpdatePasswordDto): Promise<User> {
        const user = await this.findOne(userId);
        if (!user) { throw new NotFoundException('Usuario no encontrado'); }
        const hashedPassword = await bcrypt.hash(updatePasswordDto.password, 10);
        user.password = hashedPassword;
        return this.userRepository.save(user);
    }

    // Remove (la autorización va en el controller)
    async remove(userId: number): Promise<void> {
        const user = await this.findOne(userId);
        if (!user) { throw new NotFoundException('Usuario no encontrado'); }
        await this.userRepository.remove(user);
    }

    // Remove with role validation - enhanced security method
    async removeWithRoleValidation(userId: number, requestingUserRole: string): Promise<void> {
        const targetUser = await this.findOne(userId);
        if (!targetUser) {
            throw new NotFoundException('Usuario no encontrado');
        }

        // CRITICAL BUSINESS RULE: An admin user can NEVER delete a superadmin user
        if (requestingUserRole === 'admin' && targetUser.role === 'superadmin') {
            throw new ForbiddenException("Admin users cannot delete superadmin users.");
        }

        await this.userRepository.remove(targetUser);
    }

    async findUsersByRole(role: string): Promise<User[]> {

        return this.userRepository.find({

            where: { role, status: 'active' }

        });

    }



    async updateLastLoginDate(userId: number): Promise<User> {

        const user = await this.userRepository.findOne({

            where: { id: userId }

        });



        if (!user) {

            throw new NotFoundException('User not found');

        }



        user.lastLoginDate = new Date();

        return this.userRepository.save(user);

    }
}