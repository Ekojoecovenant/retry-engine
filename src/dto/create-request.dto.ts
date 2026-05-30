import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class CreateRequestDto {
  @IsUrl({ require_tld: false, require_protocol: true })
  url!: string;

  @IsOptional()
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  method?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxRetries?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(60000)
  backoffMs?: number;
}