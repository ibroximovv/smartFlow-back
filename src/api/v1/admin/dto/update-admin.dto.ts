import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateAdminDto } from './create-admin.dto';
import { IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAdminDto extends PartialType(CreateAdminDto) {
    @ApiPropertyOptional({ example: 10})
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    availableLeaveDays?: number
}
