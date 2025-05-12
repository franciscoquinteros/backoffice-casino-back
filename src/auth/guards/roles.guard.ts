// src/auth/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator'; // Importa la clave del decorador

// Interfaz para el usuario que esperamos en request.user (del JwtStrategy)
interface AuthenticatedUser {
  id: string | number;
  office: string;
  role: string; // <-- El campo de rol es crucial aquí
}

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) { } // Inyecta Reflector

  canActivate(context: ExecutionContext): boolean {
    // 1. Obtener los roles requeridos para esta ruta (definidos con @Roles)
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(), // Revisa metadata del método
      context.getClass(),   // Revisa metadata de la clase
    ]);

    // Si no se definieron roles con @Roles, se permite el acceso (JwtAuthGuard ya validó el login)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // 2. Obtener el usuario de la petición (adjuntado por JwtAuthGuard)
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser; // Castea al tipo esperado

    // Si no hay usuario o no tiene rol, denegar acceso
    if (!user || !user.role) {
      this.logger.warn(`RolesGuard blocked access: User object or user role missing in request.`);
      throw new ForbiddenException('Access denied: User role information is missing.');
    }

    // Acceso universal para superadmin
    if (user.role === 'superadmin') {
      return true;
    }

    this.logger.debug(`RolesGuard: User Role='${user.role}', Required Roles='${requiredRoles.join(',')}'`);

    // 3. Verificar si el rol del usuario está incluido en los roles requeridos
    const hasRequiredRole = requiredRoles.some((role) => user.role === role);

    if (hasRequiredRole) {
      this.logger.debug(`RolesGuard: Access granted.`);
      return true; // Permitir acceso
    } else {
      this.logger.warn(`RolesGuard blocked access: User role '${user.role}' does not match required roles '${requiredRoles.join(',')}'.`);
      // Lanzar excepción Forbidden si el rol no coincide
      throw new ForbiddenException(`Access denied: Required role(s): ${requiredRoles.join(', ')}`);
    }
  }
}