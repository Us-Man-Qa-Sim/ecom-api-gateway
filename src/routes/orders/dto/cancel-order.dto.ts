import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { emptyStringToUndefined } from '../../../common/dto/transforms';

const REASON_MAX = 500;

export class CancelOrderDto {
  @ApiPropertyOptional({
    maxLength: REASON_MAX,
    example: 'Changed my mind',
    description: 'Free-text reason persisted on the order status history.',
  })
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(REASON_MAX, { message: `reason must be at most ${REASON_MAX} characters` })
  reason?: string;
}
