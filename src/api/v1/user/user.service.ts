import { BadRequestException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { BaseService } from '@common/infrastructure/baseService';
import { HydratedDocument, Model } from 'mongoose';
import { User } from '@common/schema/user.schema';
import { InjectModel } from '@nestjs/mongoose';
import { BcryptEncryption } from '@common/infrastructure/bcrypt';
import { RequestWithUser } from '@common/types';
import { ChangePasswordDto } from './dto/changePassword.dto';

@Injectable()
export class UserService extends BaseService<HydratedDocument<User>, CreateUserDto, UpdateUserDto> {
  constructor(@InjectModel(User.name) userModel: Model<HydratedDocument<User>>) {
    super(userModel)
  }

  async updateUser(req: RequestWithUser, updateUserDto: UpdateUserDto) {
    try {
      const findOneById = await this.model.findById(req['user'].id)
      if (!findOneById) throw new BadRequestException('User not found!')
      if (updateUserDto.email) {
        const findOne = await this.model.findOne({ email: updateUserDto.email })
        if (findOne) throw new BadRequestException('Email already exists!')
      }
      const updated = await this.model.findByIdAndUpdate(req['user'].id, {
        ...updateUserDto,
      }, { new: true })

      return {
        statusCode: 200,
        message: 'Success!',
        data: updated
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error
      throw new InternalServerErrorException(error.message || 'Internal server error!')
    }
  }

  async changeProfilePassword(req: RequestWithUser, changePasswordDto: ChangePasswordDto) {
    try {
      const user = await this.model.findById(req['user'].id)
      if (!user) throw new BadRequestException('User not found!')
      const matchPassword = BcryptEncryption.compare(changePasswordDto.oldPassword, user.password)
      if (!matchPassword) throw new BadRequestException('Password not valid!')
      const updated = await this.model.findByIdAndUpdate(req['user'].id, {
        password: BcryptEncryption.encrypt(changePasswordDto.newPassword)
      })

      return {
        statusCode: 200,
        message: 'Success!',
        data: {
          ...updated?.toObject(),
          _id: updated?._id.toString()
        }
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error
      throw new InternalServerErrorException(error.message || 'Internal server error!')
    }
  }

  async getMeProfile(req: RequestWithUser) {
    try {
      const userId = req.user?.id;

      const user = await this.model
        .findById(userId)
        .exec();

      if (!user) throw new BadRequestException('User not found!')

      const obj = user.toObject({ versionKey: false });

      const { password, ...rest } = obj

      return {
        ...rest,
        _id: rest._id.toString(),
      }

    } catch (error) {
      if(error instanceof BadRequestException) throw error
      throw new InternalServerErrorException(error.message || 'Internal server error!');
    }
  }

  async removeUser(req: RequestWithUser) {
    try {
      const user = await this.model.findByIdAndDelete(req['user'].id)
      if (!user) throw new BadRequestException('User not found')
      return {
        ...user.toObject(),
        _id: user._id.toString()
      }
    } catch (error) {
      if(error instanceof BadRequestException) throw error
      throw new InternalServerErrorException(error.message || 'Internal server error!')
    }
  }

}
