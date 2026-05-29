import { IsString, MinLength } from 'class-validator';

export class PromoterLoginDto {
  @IsString()
  promoCode!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
