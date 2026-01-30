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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(config.MONGODB_URI, {
      dbName: 'smartflow',
      serverSelectionTimeoutMS: 10000,
      autoIndex: true,
      family: 4,
    }),

    // MongooseModule.forRoot(config.DATABASE_URL),
    AuthModule,
    AdminModule,
    UserModule,
    DocumentModule,
    WorkflowModule,
    BudgetModule,
  ],
})
export class AppModule { }
