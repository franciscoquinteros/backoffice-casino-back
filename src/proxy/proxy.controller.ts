// proxy.controller.ts
import { Controller, Post, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { catchError, firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

@Controller('proxy')
export class ProxyController {
  constructor(private readonly httpService: HttpService) {}

  @Post(':type')
  async proxyRequest(@Param('type') type: string, @Body() body: any) {
    // Validar el tipo de operación
    if (type !== 'deposit' && type !== 'withdraw' && type !== 'withdrawal') {
      throw new HttpException(
        {
          error: 'Tipo de operación no válido',
          message: 'El tipo debe ser "deposit", "withdraw" o "withdrawal"',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    console.log(`Proxy recibió solicitud ${type}:`, body);

    try {
      // Reenviar la solicitud al proxy en AWS
      const { data } = await firstValueFrom(
        this.httpService
          .post(`http://18.216.231.42:8080/${type}`, body)
          .pipe(
            catchError((error: AxiosError) => {
              console.error('Error en el proxy AWS:', error.response?.data || error.message);
              throw new HttpException(
                {
                  error: `Error en el proxy para ${type}`,
                  message: error.message,
                  details: error.response?.data,
                },
                error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
              );
            }),
          ),
      );

      console.log(`Respuesta del proxy AWS (${type}):`, data);
      return data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Error inesperado en el proxy:', error);
      throw new HttpException(
        {
          error: 'Error en el proxy',
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('deposit')
  async proxyDeposit(@Body() body: any) {
    return this.proxyRequest('deposit', body);
  }

  @Post('withdraw')
  async proxyWithdraw(@Body() body: any) {
    return this.proxyRequest('withdraw', body);
  }
}