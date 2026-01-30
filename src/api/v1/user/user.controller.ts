import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, Req } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthGuard } from '@common/guards/auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { ApiBearerAuth } from '@nestjs/swagger';
import { RolesDecorator } from '@common/decorators/roles.decorator';
import { UserRole } from '@common/constants';
import { MongoIdValidationPipe } from '@common/pipes/validation.pipe';
import { GetUserDto } from './dto/get-user.dto';
import { RequestWithUser } from '@common/types';
import { ChangePasswordDto } from './dto/changePassword.dto';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) { }

  // @RolesDecorator(UserRole.ADMIN)
  // @UseGuards(AuthGuard, RolesGuard)
  // @ApiBearerAuth()
  // @Post()
  // create(@Body() createUserDto: CreateUserDto) {
  //   return this.userService.createUser(createUserDto);
  // }

  // @Get()
  // findAll(@Query() query: GetUserDto) {
  //   return this.userService.findAll(query);
  // }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Get('me')
  findOne(@Req() req: RequestWithUser) {
    return this.userService.getMeProfile(req);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Patch()
  update(@Req() req: RequestWithUser, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.updateUser(req, updateUserDto);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Patch('password')
  updatePassword(@Req() req: RequestWithUser, @Body() changePasswordDto: ChangePasswordDto) {
    return this.userService.changeProfilePassword(req, changePasswordDto)
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Delete()
  remove(@Req() req: RequestWithUser) {
    return this.userService.removeUser(req);
  }
}
