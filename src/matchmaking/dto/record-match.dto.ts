import { IsString, IsNumber, IsArray, IsOptional, IsUUID, Min } from 'class-validator';

export class RecordMatchDto {
  @IsArray()
  @IsUUID('4', { each: true })
  playerIds: string[];

  @IsString()
  tableName: string;

  @IsNumber()
  @Min(0)
  entryCoins: number;

  @IsNumber()
  @Min(0)
  winAmount: number;

  @IsNumber()
  @Min(0)
  duration: number;

  @IsOptional()
  metadata?: any;

  @IsUUID()
  winnerId: string;

  @IsOptional()
  @IsUUID()
  loserId?: string;
}
