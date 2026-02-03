import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { config } from '@config/index';
import { UserModule } from './v1/user/user.module';
import { DocumentModule } from './v1/document/document.module';
import { WorkflowModule } from './v1/workflow/workflow.module';
import { AuthModule } from './v1/auth/auth.module';
import { AdminModule } from './v1/admin/admin.module';
import { BudgetModule } from './v1/budget/budget.module';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { MailerModule } from '@nestjs-modules/mailer';
import { MailService } from 'src/services/mail.service';
import { MailProcessor } from 'src/services/mail.processor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(config.MONGODB_URI, {
      dbName: 'smartflow',
      serverSelectionTimeoutMS: 10000,
      autoIndex: true,
      family: 4,
    }),
    JwtModule.register({
      secret: config.JWT_SECRET,
      signOptions: { expiresIn: '1d' }
    }),

    MailerModule.forRoot({
      transport: {
        host: 'smtp.gmail.com', // smpt.outlook.com
        port: 465, // 587
        secure: true, // false
        auth: {
          user: 'islomaka2323@gmail.com', // process.env.OUTLOOK_EMAIL_USER
          pass: 'inrv akjo uwqu prdc', // process.env.OUTLOOK_EMAIL_PASSWORD
        },
      },
      defaults: {
        from: '"SmartFlow" <islomaka2323@gmail.com>',
      },
    }),

    // MongooseModule.forRoot(config.DATABASE_URL),
    AuthModule,
    AdminModule,
    UserModule,
    DocumentModule,
    WorkflowModule,
    BudgetModule,
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    BullModule.registerQueue({
      name: 'mail-queue',
    }),
  ],
  providers: [MailService, MailProcessor],
  exports: [MailService],
})
export class AppModule { }
