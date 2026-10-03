import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { emptyStringToUndefined } from '../../../common/dto/transforms';
import { ORDER_STATUSES, type OrderStatus } from '../../../common/mappers/proto.mapper';

// Status/userId both get coerced in the controller to the proto enum / string
// after validation. Keeping validation here (whitelist, type, enum membership)
// gives us a crisp 400 before the gateway touches gRPC.

export class ListMyOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ORDER_STATUSES as readonly string[] })
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsIn(ORDER_STATUSES as readonly string[], {
    message: `status must be one of ${ORDER_STATUSES.join(', ')}`,
  })
  status?: OrderStatus;
}

export class ListAllOrdersQueryDto extends ListMyOrdersQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by owner (admin only).' })
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  userId?: string;
}
