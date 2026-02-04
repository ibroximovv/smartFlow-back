import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { DocumentType, UserRole } from '@common/constants';
import { Type } from 'class-transformer';

export class WorkflowStepDto {
    @ApiProperty({ example: 0 })
    @IsInt()
    @Min(0)
    stepOrder: number;

    @ApiProperty({ enum: UserRole, example: UserRole.ADMIN })
    @IsEnum(UserRole)
    role: UserRole;

    @ApiProperty({ example: 'Manager approval', required: false })
    @IsOptional()
    @IsString()
    label?: string;
}

export class CreateWorkflowDto {
    @ApiProperty({ enum: DocumentType, example: DocumentType.EXPENSE })
    @IsEnum(DocumentType)
    documentType: DocumentType;

    @ApiProperty({ type: [WorkflowStepDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => WorkflowStepDto)
    steps: WorkflowStepDto[];

    @ApiProperty({ example: true, required: false })
    @IsBoolean()
    isActive?: boolean;
}