import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateConversationDto {
  @IsIn(['DIRECT', 'GROUP'])
  type!: 'DIRECT' | 'GROUP';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  memberIds!: string[];

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  temporary?: boolean;

  /**
   * One wrapped copy of the conversation key per member (keyed by userId).
   * Opaque ciphertext — the server just stores it.
   */
  @IsOptional()
  @IsObject()
  wrappedKeys?: Record<string, string>;
}
