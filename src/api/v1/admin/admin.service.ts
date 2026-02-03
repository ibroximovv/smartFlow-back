import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { BaseService } from '@common/infrastructure/baseService';
import { HydratedDocument, Model } from 'mongoose';
import { User } from '@common/schema/user.schema';
import { InjectModel } from '@nestjs/mongoose';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { BcryptEncryption } from '@common/infrastructure/bcrypt';
import { UserRole } from '@common/constants';
import * as XLSX from 'xlsx';
import * as bcrypt from 'bcrypt';
import { MailService } from 'src/services/mail.service';

interface ExcelUser {
  email: string;
  fullName: string;
  password: string;
  role?: UserRole;
  phoneNumber?: string;
  availableLeaveDays?: number;
}

interface CreateUserResult {
  success: boolean;
  totalRows: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  createdUsers: ExcelUser[];
  skippedUsers: ExcelUser[];
  failedUsers: Array<{
    user: ExcelUser;
    reason: string;
  }>;
}

@Injectable()
export class AdminService extends BaseService<HydratedDocument<User>, CreateAdminDto, UpdateAdminDto> {
  constructor(@InjectModel(User.name) userModel: Model<HydratedDocument<User>>, private readonly mailService: MailService) {
    super(userModel)
  }

  async createUser(createUserDto: CreateUserDto) {
    try {
      const findone = await this.model.findOne({ email: createUserDto.email });
      if (findone) throw new BadRequestException('User already exists!');

      await this.mailService.addMailToQueue(
        createUserDto.email,
        'Welcome to SmartFlow',
        'Your account has been created successfully.',
        `<p>Hello ${createUserDto.fullName},
        <br/>
        Here are your login details:
        <br/>
        Your email: ${createUserDto.email}
        <br/>
        Your password: ${createUserDto.password}
        </p>...`
      );

      const user = await this.model.create({
        ...createUserDto,
        password: BcryptEncryption.encrypt(createUserDto.password)
      });

      user.save()

      const userObject = user.toJSON({ virtuals: true });

      const { password, id, __v, ...rest } = userObject

      return {
        statusCode: 201,
        message: 'Success!',
        data: {
          ...rest,
          _id: userObject._id.toString()
        }
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(error.message || 'Internal server error!');
    }
  }

  async createUsersFromExcel(file: Express.Multer.File): Promise<CreateUserResult> {
    if (!file) {
      throw new BadRequestException('Fayl yuborilmadi');
    }

    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data: any[] = XLSX.utils.sheet_to_json(worksheet);

      if (!data || data.length === 0) {
        throw new BadRequestException('Excel fayl bo\'sh yoki ma\'lumot yo\'q');
      }

      Logger.log(`Excel fayldagi jami qatorlar: ${data.length}`);

      const result: CreateUserResult = {
        success: true,
        totalRows: data.length,
        createdCount: 0,
        skippedCount: 0,
        failedCount: 0,
        createdUsers: [],
        skippedUsers: [],
        failedUsers: [],
      };

      const existingEmails = await this.model.distinct('email');
      const existingEmailSet = new Set(existingEmails);

      for (const row of data) {
        try {
          const email = this.toString(row.email).trim().toLowerCase();
          const fullName = this.toString(row.fullName).trim();
          const password = this.toString(row.password).trim();
          const phoneNumber = this.toString(row.phoneNumber).trim() || undefined;
          const availableLeaveDays = this.toNumber(row.availableLeaveDays) || 0;

          let role: UserRole = UserRole.REQUESTER;
          if (row.role) {
            const roleStr = this.toString(row.role).toUpperCase();
            if (Object.values(UserRole).includes(roleStr as UserRole)) {
              role = roleStr as UserRole;
            }
          }

          if (!email || !fullName || !password) {
            result.failedUsers.push({
              user: {
                email: email || 'null',
                fullName: fullName || 'null',
                password: '***',
                role,
              },
              reason: 'Email, fullName va password majburiy',
            });
            result.failedCount++;
            continue;
          }

          if (!this.isValidEmail(email)) {
            result.failedUsers.push({
              user: {
                email,
                fullName,
                password: '***',
                role,
              },
              reason: 'Email format noto\'g\'ri',
            });
            result.failedCount++;
            continue;
          }

          if (password.length < 6) {
            result.failedUsers.push({
              user: {
                email,
                fullName,
                password: '***',
                role,
              },
              reason: 'Parol kamida 6 belgidan iborat bo\'lishi kerak',
            });
            result.failedCount++;
            continue;
          }

          if (existingEmailSet.has(email)) {
            result.skippedUsers.push({
              email,
              fullName,
              password: '***',
              role,
            });
            result.skippedCount++;
            continue;
          }

          const hashedPassword = await bcrypt.hash(password, 10);

          const newUser = await this.model.create({
            email,
            fullName,
            password: hashedPassword,
            role,
            phoneNumber,
            availableLeaveDays,
            isActive: true,
          });

          newUser.save()

          existingEmailSet.add(email);

          result.createdUsers.push({
            email: newUser.email,
            fullName: newUser.fullName,
            password,
            role: newUser.role,
            phoneNumber: String(newUser.phoneNumber),
            availableLeaveDays: newUser.availableLeaveDays,
          });
          result.createdCount++;

          Logger.debug(`User yaratildi: ${email}`);
        } catch (error) {
          result.failedUsers.push({
            user: {
              email: this.toString(row.email),
              fullName: this.toString(row.fullName),
              password: '***',
              role: row.role ? (this.toString(row.role).toUpperCase() as UserRole) : UserRole.REQUESTER,
            },
            reason: error.message || 'Noma\'lum xato',
          });
          result.failedCount++;

          Logger.warn(`User yaratilmadi: ${this.toString(row.email)} - ${error.message}`);
        }
      }

      return result;
    } catch (error) {
      Logger.error(`Excel qayta ishlashda xato: ${error.message}`);
      throw error;
    }
  }

  async updateAdmin(id: string, updatedAdminDto: UpdateAdminDto) {
    try {
      const admin = await this.model.findById(id)
      if (!admin) {
        throw new BadRequestException('User not found!')
      }

      if (updatedAdminDto.email) {
        const emailExists = await this.model.findOne({
          email: updatedAdminDto.email,
        })

        if (emailExists) {
          throw new BadRequestException('Email already exists!')
        }
      }

      if (updatedAdminDto.password) {
        updatedAdminDto.password = BcryptEncryption.encrypt(
          updatedAdminDto.password,
        )
      }

      const updatedAdmin = await this.model.findByIdAndUpdate(
        id,
        { $set: updatedAdminDto },
        { new: true },
      ).select('-password')

      return {
        statusCode: 200,
        message: 'Success!',
        data: updatedAdmin,
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error
      throw new InternalServerErrorException(error.message || 'Internal server error!')
    }
  }

  private toString(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }

  private toNumber(value: any): number {
    if (value === null || value === undefined) {
      return 0;
    }
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}