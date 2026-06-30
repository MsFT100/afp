import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateDisplayNameDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  displayName!: string;
}
