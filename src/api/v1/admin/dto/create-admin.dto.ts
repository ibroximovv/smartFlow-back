import { UserRole } from "@common/constants";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsEnum, IsOptional, IsPhoneNumber, IsString, Length } from "class-validator";

export class CreateAdminDto {
    @ApiProperty({ example: 'example@gmail.com' })
    @IsEmail()
    @IsString()
    email: string

    @ApiProperty({ example: 'password' })
    @IsString()
    @Length(4, 32)
    password: string

    @ApiProperty({ example: 'fullName' })
    @IsString()
    @Length(4, 64)
    fullName: string

    @ApiProperty({ enum: UserRole, example: UserRole.REQUESTER })
    @IsEnum(UserRole)
    role: UserRole

    @ApiPropertyOptional({ example: '+998990004455' })
    @IsOptional()
    @IsPhoneNumber('UZ')
    phoneNumber?: string
}