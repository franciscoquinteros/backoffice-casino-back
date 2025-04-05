// src/common/filters/http-exception.filter.ts (o donde prefieras)
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException) // Captura solo HttpException o puedes poner @Catch() para todo
export class CustomHttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // Extrae el mensaje de error
    const message = typeof exceptionResponse === 'string'
      ? exceptionResponse
      : (exceptionResponse as any).message || exception.message; // Intenta obtener el mensaje

    // Envía la respuesta con el formato deseado
    response
      .status(status)
      .json({
        status: 'error', // Tu campo 'status' deseado
        message: message, // El mensaje de error específico
        // Puedes añadir más campos si lo necesitas, como timestamp o path
        // timestamp: new Date().toISOString(),
        // path: request.url,
      });
  }
}