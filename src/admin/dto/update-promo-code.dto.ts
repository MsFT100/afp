import { IsString, MinLength } from 'class-validator';

export class UpdatePromoCodeDto {
  @IsString()
  @MinLength(1)
  promoCode!: string;
}
