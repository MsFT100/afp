import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreatePromoterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  displayName!: string;

  @IsString()
  @MinLength(10)
  phoneNumber!: string;
}
