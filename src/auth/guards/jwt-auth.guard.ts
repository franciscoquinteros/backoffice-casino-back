// src/auth/guards/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Normalmente no necesitas añadir nada más aquí.
  // AuthGuard('jwt') automáticamente usará la JwtStrategy que registraste
  // en tu AuthModule porque 'jwt' es el nombre por defecto de la estrategia.
  // Puedes sobrescribir métodos como handleRequest si necesitas personalizar
  // el manejo de errores o el retorno después de la autenticación.
}