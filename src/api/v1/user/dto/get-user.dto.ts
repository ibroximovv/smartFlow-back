import { PaginationQueryDto } from "@common/dto/pagination.query.dto";
import { OmitType } from "@nestjs/swagger";

export class GetUserDto extends OmitType(PaginationQueryDto, ['role']) { }