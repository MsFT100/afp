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
import {
  TransactionStatus,
  TransactionType,
} from '../transactions/transaction.entity';
import { UserRole } from '../users/user.entity';

import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get('balance')
  async getBalance(@Req() req: any) {
    const wallet = await this.walletsService.getOrCreateWallet(req.user.id);
    return { balance: wallet.balance };
  }

  @Post('initialize')
  async initialize(@Req() req: any, @Body('amount') amount: number) {
    return this.walletsService.initializePayment(req.user.id, amount);
  }

  /**
   * This is called by the frontend after a successful Paystack redirect
   */
  @Get('verify')
  async verify(@Req() req: any, @Query('reference') reference: string) {
    return this.walletsService.verifyPayment(req.user.id, reference);
  }

  /**
   * Admin endpoint: Get the last N transactions
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/transactions')
  async getAdminTransactions(@Query('limit') limit: string = '50') {
    const parsedLimit = parseInt(limit, 10);
    return this.walletsService.transactionsService.findRecentTransactions(
      parsedLimit,
    );
  }

  /**
   * Admin endpoint: Get total money made from successful deposits
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/revenue')
  async getAdminRevenue() {
    const totalRevenue =
      await this.walletsService.transactionsService.transactionsRepository.sum(
        'amount',
        { status: TransactionStatus.SUCCESS, type: TransactionType.DEPOSIT },
      );
    // TypeORM's sum returns string | null, convert to number
    return { totalRevenue: parseFloat(String(totalRevenue || '0')) };
  }

  /**
   * Admin endpoint: Get all users with their roles and balances
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/users')
  async getAdminUsers(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const p = parseInt(page, 10);
    const l = parseInt(limit, 10);
    return this.walletsService.getUsersBalances(p, l);
  }

  @Post('transfer')
  async transfer(
    @Req() req: any,
    @Body('recipientEmail') recipientEmail: string,
    @Body('amount') amount: number,
  ) {
    return this.walletsService.transfer(req.user.id, recipientEmail, amount);
  }
}
