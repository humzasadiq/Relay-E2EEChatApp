import { IsString, Length } from 'class-validator';

export class SaveKeyBundleDto {
  @IsString()
  @Length(1, 512)
  identityPubKey!: string;

  @IsString()
  @Length(1, 512)
  exchangePubKey!: string;

  @IsString()
  @Length(1, 4096)
  wrappedPrivateKeys!: string;
}
