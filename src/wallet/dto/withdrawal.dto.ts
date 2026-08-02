import {
  IsNumber,
  IsString,
  IsEnum,
  IsOptional,
  Min,
  IsBoolean,
} from 'class-validator';

export enum WithdrawalMethod {
  BANK_TRANSFER = 'bank_transfer',
  MOBILE_MONEY = 'mobile_money',
}

export enum MobileMoneyProvider {
  MPESA = 'mpesa',
  AIRTEL = 'airtel',
  MTN = 'mtn',
  VODAFONE = 'vodafone',
}

// ==================== SAVE DETAILS DTOs ====================

export class SaveBankDetailsDto {
  @IsString()
  bankCode!: string;

  @IsString()
  accountNumber!: string;

  @IsString()
  accountHolderName!: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsBoolean()
  setAsDefault?: boolean;
}

export class SaveMobileMoneyDetailsDto {
  @IsEnum(MobileMoneyProvider)
  provider!: MobileMoneyProvider;

  @IsString()
  phoneNumber!: string;

  @IsString()
  accountHolderName!: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsBoolean()
  setAsDefault?: boolean;
}

// ==================== WITHDRAWAL REQUEST DTOs ====================

export class InitiateWithdrawalDto {
  @IsNumber()
  @Min(1)
  coins!: number;

  @IsEnum(WithdrawalMethod)
  withdrawalMethod!: WithdrawalMethod;

  @IsOptional()
  @IsString()
  bankCode?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  accountHolderName?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsEnum(MobileMoneyProvider)
  mobileMoneyProvider?: MobileMoneyProvider;

  @IsOptional()
  @IsString()
  reason?: string;
}

// ==================== RESPONSE DTOs ====================

export class WithdrawalResponseDto {
  success!: boolean;
  message!: string;
  reference!: string;
  coins!: number;
  amountInFiat?: number;
  currency?: string;
  fee?: number;
  status!: 'pending' | 'success' | 'failed';
  estimatedArrival?: string;
}

export class WithdrawalHistoryDto {
  reference!: string;
  coins!: number;
  status!: 'pending' | 'success' | 'failed' | 'reversed';
  createdAt!: Date;
}

export class WithdrawalLimitsDto {
  dailyLimit!: number;
  dailyWithdrawn!: number;
  remainingDaily!: number;
  monthlyLimit!: number;
  monthlyWithdrawn!: number;
  remainingMonthly!: number;
}

export class WithdrawalStatsDto {
  totalWithdrawn!: number;
  totalPending!: number;
  totalFailed!: number;
  averageWithdrawal!: number;
  lastWithdrawalDate?: Date | null;
  consecutiveFailures!: number;
  allowWithdrawals!: boolean;
}

export class VerifyBankDetailsDto {
  @IsString()
  bankCode!: string;

  @IsString()
  accountNumber!: string;
}
