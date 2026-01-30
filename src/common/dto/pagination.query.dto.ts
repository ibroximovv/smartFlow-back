import { UserRole } from "@common/constants";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsOptional, IsString } from "class-validator";

export class PaginationQueryDto {
    @ApiPropertyOptional({ example: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    page?: number = 1

    @ApiPropertyOptional({ example: 10 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    limit?: number = 10

    @ApiPropertyOptional({ description: 'Search keyword', required: false })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({
        description: 'Comma separated searchable fields, e.g. fullName, email',
        required: false
    })
    @IsOptional()
    @IsString()
    searchFields?: string;

    @ApiPropertyOptional({ example: 'createdAt', description: 'Sort by field' })
    @IsOptional()
    @IsString()
    sortBy?: string;

    @ApiPropertyOptional({ example: 'asc', description: 'Sort order, asc or desc' })
    @IsOptional()
    @IsIn(['asc', 'desc'])
    sortOrder?: 'asc' | 'desc' = 'desc';

    @ApiPropertyOptional({ enum: UserRole, description: 'Filter by user role', required: false })
    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;
}