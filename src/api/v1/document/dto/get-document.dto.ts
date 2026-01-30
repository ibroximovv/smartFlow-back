import { PaginationQueryDto } from "@common/dto/pagination.query.dto";
import { OmitType } from "@nestjs/swagger";

export class GetDocumentDto extends OmitType(PaginationQueryDto, ['role']) {}