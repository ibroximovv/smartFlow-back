import { DocumentAction } from "@common/constants";
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class ActionPayloadDto {
    @ApiProperty({ enum: DocumentAction, example: DocumentAction.SUBMIT })
    @IsEnum(DocumentAction)
    @IsString()
    action: DocumentAction

    @ApiProperty({ required: false, example: 'Please approve this document.' })
    @IsOptional()
    @IsString()
    comment?: string
}