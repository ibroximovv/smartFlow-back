import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AssetType, Currency, LeaveType } from "@common/constants";
import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsOptional, IsString, IsDate } from "class-validator";

export class ExpensePayloadDto {
    @ApiProperty({ example: 150000 })
    @Type(() => Number)
    @IsNumber()
    amount: number;

    @ApiProperty({ enum: Currency, example: Currency.UZS })
    @IsEnum(Currency)
    currency: Currency;

    @ApiProperty({ example: "Office supplies" })
    @IsString()
    reason: string;

    @ApiPropertyOptional({ example: "IT Department" })
    @IsOptional()
    @IsString()
    department?: string;
}

export class LeavePayloadDto {
    @ApiProperty({ enum: LeaveType, example: LeaveType.ANNUAL })
    @IsEnum(LeaveType)
    leaveType: LeaveType;

    @ApiProperty({ example: "2026-02-01" })
    @Type(() => Date)
    @IsDate()
    startDate: Date;

    @ApiProperty({ example: "2026-02-10" })
    @Type(() => Date)
    @IsDate()
    endDate: Date;

    @ApiProperty({ example: 10 })
    @Type(() => Number)
    @IsNumber()
    totalDays: number;

    @ApiPropertyOptional({ example: "Family reasons" })
    @IsOptional()
    @IsString()
    reason?: string;

    @ApiPropertyOptional({ example: "John Doe" })
    @IsOptional()
    @IsString()
    coveringPerson?: string;
}

export class AssetPayloadDto {
    @ApiProperty({ enum: AssetType, example: AssetType.LAPTOP })
    @IsEnum(AssetType)
    assetType: AssetType;

    @ApiProperty({ example: "MacBook Pro M3" })
    @IsString()
    assetName: string;

    @ApiPropertyOptional({ example: 2500 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    estimatedCost?: number;

    @ApiProperty({ example: "Needed for development tasks" })
    @IsString()
    justification: string;

    @ApiPropertyOptional({ example: 2 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    quantity?: number;
}