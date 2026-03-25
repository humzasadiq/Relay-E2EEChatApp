import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  ciphertext!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  nonce!: string;
}
