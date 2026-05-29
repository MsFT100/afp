import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { WalletsService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

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

  @Post('paystack/initialize')
  async initializePaystack(@Req() req: any, @Body('amount') amount: number) {
    return this.walletsService.initializePayment(req.user.id, amount);
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
}
