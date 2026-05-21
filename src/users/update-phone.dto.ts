import { IsNotEmpty, IsString, IsPhoneNumber } from 'class-validator';

export class UpdatePhoneDto {
  @IsNotEmpty()
  @IsString()
  @IsPhoneNumber(undefined, { message: 'Please provide a valid phone number in international format (e.g., +254...)' })
  phoneNumber!: string;
}
