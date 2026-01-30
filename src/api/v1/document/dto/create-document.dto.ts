import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";
import { Currency, Department, DocumentType } from "@common/constants";

export class CreateDocumentDto {
    @ApiProperty({ example: "DOC-2026-0001" })
    @IsString()
    @IsNotEmpty()
    serialNumber: string;

    @ApiProperty({ enum: DocumentType, example: DocumentType.EXPENSE })
    @IsEnum(DocumentType)
    type: DocumentType;

    @ApiPropertyOptional({ example: 'Tezroq tekshirib bering!' })
    @IsOptional()
    @IsString()
    comment?: string

    @ApiProperty({
        example: {
            amount: 15000,
            currensy: Currency.UZS,
            reason: 'asdasd',
            department: Department.IT
        }
    })
    @IsObject()
    payload: any
}