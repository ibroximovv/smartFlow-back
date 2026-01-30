import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UseInterceptors, BadRequestException, HttpCode, HttpStatus, UploadedFile, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { AuthGuard } from '@common/guards/auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { RolesDecorator } from '@common/decorators/roles.decorator';
import { UserRole } from '@common/constants';
import { FileInterceptor } from '@nestjs/platform-express';
import { GetAdminDto } from './dto/get-admin.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) { }

  @RolesDecorator(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseGuards(AuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Post('/user')
  create(@Body() createAdminDto: CreateAdminDto) {
    return this.adminService.createUser(createAdminDto);
  }

  @RolesDecorator(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseGuards(AuthGuard, RolesGuard)
  @Post('with-excel')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
        ];

        if (!allowedMimes.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              'Faqat Excel (.xlsx, .xls) yoki CSV fayllarini yuklash mumkin!',
            ),
            false,
          );
        }

        cb(null, true);
      },
      limits: {
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Excel fayl (.xlsx yoki .xls)',
        },
      },
    },
  })
  async createUsersWithExcel(@UploadedFile() file: Express.Multer.File): Promise<any> {
    try {
      if (!file) {
        throw new BadRequestException('Fayl yuborilmadi');
      }

      const result = await this.adminService.createUsersFromExcel(file);

      return {
        success: result.success,
        message: `${result.createdCount} ta user muvaffaqiyatli yaratildi`,
        statistics: {
          total: result.totalRows,
          created: result.createdCount,
          skipped: result.skippedCount,
          failed: result.failedCount,
        },
        data: {
          createdUsers: result.createdUsers.map((u) => ({
            email: u.email,
            fullName: u.fullName,
            role: u.role,
            phoneNumber: u.phoneNumber,
          })),
          skippedUsers: result.skippedUsers.map((u) => ({
            email: u.email,
            fullName: u.fullName,
            reason: 'Allaqachon mavjud',
          })),
          failedUsers: result.failedUsers,
        },
      };
    } catch (error) {
      throw new BadRequestException(
        error.message || 'Excel faylni qayta ishlashda xato',
      );
    }
  }

  @Get()
  findAll(@Query() query: GetAdminDto) {
    return this.adminService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.adminService.findById(id);
  }

  @Patch('/user/:id')
  update(@Param('id') id: string, @Body() updateAdminDto: UpdateAdminDto) {
    return this.adminService.update(id, updateAdminDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.adminService.delete(id);
  }
}