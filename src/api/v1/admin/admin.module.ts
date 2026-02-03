import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '@common/schema/user.schema';
import { MailService } from 'src/services/mail.service';
import { BullModule } from '@nestjs/bullmq';
import { MailProcessor } from 'src/services/mail.processor';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]), BullModule.registerQueue({
    name: 'mail-queue',
  }),],
  controllers: [AdminController],
  providers: [AdminService, MailService, MailProcessor],
  exports: [AdminService],
})
export class AdminModule { }
