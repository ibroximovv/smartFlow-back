import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class ChangePasswordDto {
    @ApiProperty({ example: 'oldPassword'})
    @IsString()
    @Length(4, 32)
    oldPassword: string

    @ApiProperty({ example: 'newPassword'})
    @IsString()
    @Length(4, 32)
    newPassword: string
}