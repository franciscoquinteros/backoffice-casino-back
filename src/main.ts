import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io'; // Importa el adaptador de Socket.IO

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Habilita WebSockets con Socket.IO
  app.useWebSocketAdapter(new IoAdapter(app));

  // Configuración de CORS (ya existente, ajustado para WebSockets)
  app.enableCors({
    origin: true,/*  [
      'https://backoffice-casino-front-production.up.railway.app',
      'http://localhost:3000',
      'http://localhost:8000',
    ], */
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
    credentials: true,
  });

  // Configuración de Swagger (sin cambios)
  const config = new DocumentBuilder()
    .setTitle('Casino Backoffice API')
    .setDescription('API documentation for Casino Backoffice')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('doc', app, document);

  // Escucha en el puerto de Railway o 3000 localmente
  // En tu archivo main.ts
  const port = parseInt(process.env.PORT || '8000', 10);
  await app.listen(port);
  console.log(`Server running on port ${port}`);
}

bootstrap();