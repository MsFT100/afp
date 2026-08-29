import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Query,
  ValidationPipe,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { WalletsService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TransactionType } from '../transactions/transaction.entity';
import {
  InitiateWithdrawalDto,
  SaveBankDetailsDto,
  SaveMobileMoneyDetailsDto,
  VerifyBankDetailsDto,
} from './dto/withdrawal.dto';

@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get('balance')
  async getBalance(@Req() req: any) {
    const wallet = await this.walletsService.getOrCreateWallet(req.user.id);
    return { balance: wallet.balance };
  }

  @Post('add-balance')
  async addBalance(@Req() req: any, @Body('amount') amount: number) {
    return this.walletsService.addBalance(req.user.id, amount);
  }

  @Post('deduct-balance')
  async removeBalance(@Req() req: any, @Body('amount') amount: number) {
    return this.walletsService.deductBalance(
      req.user.id,
      amount,
      TransactionType.MANUAL_ADJUSTMENT,
      'unknown',
    );
  }

  @Post('paystack/initialize')
  async initializePaystack(
    @Req() req: any,
    @Body('amount') amount: number,
    @Body('currency') currency?: string,
    @Body('method') method?: string,
    @Body('phone') phone?: string,
  ) {
    return this.walletsService.initializePayment(
      req.user.id,
      amount,
      currency,
      method,
      phone,
    );
  }

  /**
   * This is called by the frontend after a successful Paystack redirect
   */
  @Get('paystack/verify')
  async verify(@Req() req: any, @Query('reference') reference: string) {
    return this.walletsService.verifyPayment(req.user.id, reference);
  }

  @Post('paypal/initiate')
  async initiatePayPal(@Req() req: any, @Body('amount') amount: number) {
    return this.walletsService.initiatePayPalPayment(req.user.id, amount);
  }

  @Post('paypal/verify')
  async verifyPayPal(@Req() req: any, @Body('orderId') orderId: string) {
    // The frontend will send the orderId obtained from PayPal's redirect
    return this.walletsService.verifyPayPalPayment(req.user.id, orderId);
  }

  @Post('transfer')
  async transfer(
    @Req() req: any,
    @Body('recipientEmail') recipientEmail: string,
    @Body('amount') amount: number,
  ) {
    return this.walletsService.transfer(req.user.id, recipientEmail, amount);
  }

  @Post('deduct-table-fee')
  async deductTableFee(
    @Req() req: any,
    @Body('amount') amount: number,
    @Body('matchId') matchId: string,
  ) {
    return this.walletsService.deductTableFee(req.user.id, amount, matchId);
  }

  // ==================== WITHDRAWAL ENDPOINTS ====================

  @Post('bank-details/save')
  async saveBankDetails(
    @Req() req: any,
    @Body(ValidationPipe) dto: SaveBankDetailsDto,
  ) {
    return this.walletsService.saveBankDetails(req.user.id, dto);
  }

  @Post('mobile-money/save')
  async saveMobileMoneyDetails(
    @Req() req: any,
    @Body(ValidationPipe) dto: SaveMobileMoneyDetailsDto,
  ) {
    return this.walletsService.saveMobileMoneyDetails(req.user.id, dto);
  }

  @Get('withdrawal-details')
  async getWithdrawalDetails(@Req() req: any) {
    return this.walletsService.getUserWithdrawalDetails(req.user.id);
  }

  @Get('banks')
  async getBanks(@Query('country') country?: string) {
    return this.walletsService.listBanks(country);
  }

  @Get('withdrawal-limits')
  async getWithdrawalLimits(@Req() req: any) {
    return this.walletsService.getWithdrawalLimits(req.user.id);
  }

  @Post('withdraw')
  async initiateWithdrawal(
    @Req() req: any,
    @Body(ValidationPipe) dto: InitiateWithdrawalDto,
  ) {
    return this.walletsService.initiateWithdrawal(req.user.id, dto);
  }

  @Get('withdrawal-history')
  async getWithdrawalHistory(
    @Req() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.walletsService.getWithdrawalHistory(
      req.user.id,
      page,
      limit,
      status,
    );
  }

  @Get('withdrawal-stats')
  async getWithdrawalStats(@Req() req: any) {
    return this.walletsService.getWithdrawalStats(req.user.id);
  }

  @Post('verify-bank-details')
  async verifyBankDetails(@Body(ValidationPipe) dto: VerifyBankDetailsDto) {
    return this.walletsService.verifyBankDetails(
      dto.bankCode,
      dto.accountNumber,
    );
  }
}
