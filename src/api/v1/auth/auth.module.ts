import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { config } from '@config/index';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: config.JWT_SECRET || 'jwtsecret',
      signOptions: { expiresIn: '1d' }
    }),
    UserModule
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule { }
