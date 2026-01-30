import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from '@common/schema/user.schema';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { BcryptEncryption } from '@common/infrastructure/bcrypt';
import { LoginAuthDto } from './dto/login-auth.dto';

@Injectable()
export class AuthService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwt: JwtService
  ) { }

  async login(loginAuthDto: LoginAuthDto) {
    try {
      const findone = await this.userModel.findOne({ email: loginAuthDto.email })
      if (!findone) throw new BadRequestException('User not registred!')
      const matchedPassword = BcryptEncryption.compare(loginAuthDto.password, findone.password)
      if (!matchedPassword) throw new BadRequestException('Email or password not valid!')

      const token = this.jwt.sign({ id: findone.id, role: findone.role })

      return {
        statusCode: 200,
        message: 'Successfully login!',
        token
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error
      throw new InternalServerErrorException(error.message || 'Internal server error!')
    }
  }
}
