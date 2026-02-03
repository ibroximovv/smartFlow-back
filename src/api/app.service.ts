import { Injectable, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { NextFunction, Request, Response } from 'express';
import { config } from 'src/config';
import { join } from 'path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AllExceptionFilter } from 'src/common/filters/all.exception.filter';
import cookieParser from 'cookie-parser';
import { runSeeder } from 'src/database/runSeeders';
import { ServerOptions } from 'socket.io';

class SocketIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: config.NODE_ENV === 'production' 
          ? [config.FRONTEND_URL || 'http://localhost:5173'] 
          : '*',
        credentials: true, // Cookie lardan foydalanishga ruxsat beradi
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
      allowEIO3: true,
    });
    return server; // Socket.IO serverini yaratish va sozlash
  }
} // SocketIoAdapter - Socket.IO serverini sozlash uchun maxsus adapter

@Injectable()
export default class Application {
  private static readonly logger = new Logger(Application.name);

  public static async main(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: ['log', 'error', 'warn', 'debug', 'verbose']
    })

    app.use(cookieParser()) // Cookie parser middlewarening vazifasi cookie lardagi ma'lumotlarni o'qish va boshqarishdir. Misol uchun, foydalanuvchi sessiya ma'lumotlarini cookie larda saqlash va ularni so'rovlar davomida o'qish uchun ishlatiladi.

    runSeeder()

    app.use((req: Request, res: Response, next: NextFunction) => {
      const originalJson = res.json;
      res.json = function (data) {
        const serializeData = (obj: any): any => {
          if (obj === null || obj === undefined) return obj;
          if (obj instanceof Date) return obj.toISOString()
          if (Array.isArray(obj)) return obj.map(serializeData)
          if (typeof obj === 'object') {
            const result: any = {};
            for (const key in obj) {
              if (obj.hasOwnProperty(key)) {
                result[key] = serializeData(obj[key]);
              }
            }
            return result;
          }

          return obj;
        };

        return originalJson.call(this, serializeData(data));
      }
      next()
    }); // ushbu middleware barcha javoblardagi Date obyektlarini ISO string formatiga o'zgartiradi

    app.useGlobalFilters(new AllExceptionFilter())

    app.enableCors({
      origin: config.NODE_ENV === 'production' ? [config.FRONTEND_URL || 'http://localhost:5173'] : '*',
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true, // DTO larda ko'rsatilmagan maydonlarni avtomatik ravishda rad etadi
        forbidNonWhitelisted: false, // noma'lum maydonlar bo'lsa xatolik qaytarmaslik
        transform: true, // DTO lariga kelayotgan ma'lumotlarni avtomatik ravishda kerakli turlarga o'zgartirishni yoqadi
        transformOptions: {
          enableImplicitConversion: true, // DTO larida primitive turlarini avtomatik o'zgartirishga ruxsat beradi
          // misol uchun: string dan number ga yoki string dan boolean ga
          // shu bilan birga, faqat quyidagi primitive turlar uchun ishlaydi:
          // primitive turlar: string, number, boolean, bigint, symbol
        },
      }),
    );

    app.setGlobalPrefix('api', {
      exclude: ['/uploads/*path', '/health', '/']
    })

    app.useStaticAssets(join(process.cwd(), 'uploads'), {
      prefix: '/uploads'
    })

    const swaggerConfig = new DocumentBuilder()
      .setTitle('SmartFlow API')
      .setDescription('API Documentation for SmartFlow')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          description: 'Enter JWT token',
          name: 'Authorization',
          bearerFormat: 'bearer',
          in: 'header'
        }
      )
      .addSecurityRequirements('bearer')
      .addTag('Auth', 'Authentication endpoints')
      .build()

    const document = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup('api', app, document, {
      swaggerOptions: {
        persistAuthorization: true // refresh bo'lganda swagger authorization ni saqlab qolish
      }
    })

    app.useWebSocketAdapter(new SocketIoAdapter(app))

    const httpAdapter = app.getHttpAdapter() // Express application instance ni olish
    httpAdapter.get('/health', (req: any, res: any) => {
      res.status(200).send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      })
    })

    app.enableShutdownHooks()

    const port = config.API_PORT || 3000
    await app.listen(port)

    this.logger.log(`Server running on http://localhost:${port}`);
    this.logger.log(`Swagger Docs: http://localhost:${port}/api`);
    this.logger.log(`Health Check: http://localhost:${port}/health`);
    this.logger.log(`WebSocket: Active on ws://localhost:${port}`);
    this.logger.log(`Environment: ${config.NODE_ENV || 'development'}`);
  }
}