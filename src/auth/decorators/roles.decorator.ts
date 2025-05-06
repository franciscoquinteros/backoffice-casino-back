// src/auth/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';

// Esta constante la usaremos como clave para guardar y leer los roles
export const ROLES_KEY = 'roles';

/**
 * Decorador personalizado para asignar roles requeridos a un endpoint.
 * Uso: @Roles('admin', 'superadmin')
 * @param roles Los roles permitidos para acceder al recurso.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);