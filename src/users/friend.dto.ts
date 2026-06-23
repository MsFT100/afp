import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class FriendUserIdDto {
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  friendUserId!: string;
}
