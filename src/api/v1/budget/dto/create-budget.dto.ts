import { Currency, Department } from "@common/constants";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt } from "class-validator";

export class CreateBudgetDto {
    @ApiProperty({ enum: Department, example: Department.IT })
    @IsEnum(Department)
    department: Department

    @ApiProperty({ example: 12002 })
    @IsInt()
    @Type(() => Number)
    totalBudget: number

    @ApiProperty({ enum: Currency, example: Currency.UZS })
    @IsEnum(Currency)
    currency: Currency

    @ApiProperty({ example: 2026 })
    @IsInt()
    @Type(() => Number)
    fiscalYear: number
}
