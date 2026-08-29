import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateCountryDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(2)
  country!: string;
}
