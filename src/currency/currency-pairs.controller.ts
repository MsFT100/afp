import { Controller, Get, Query, Post, UseGuards } from '@nestjs/common';
import { CurrencyPair } from './currency-pair.entity';
import { CurrencyPairsService } from './currency-pairs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user.entity';

@Controller('currency-pairs')
export class CurrencyPairsController {
  constructor(private readonly currencyPairsService: CurrencyPairsService) {}

  @Get()
  async findAll(
    @Query('base') base?: string,
    @Query('quote') quote?: string,
  ): Promise<CurrencyPair[]> {
    return this.currencyPairsService.getCurrencyPairs(base, quote);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('sync')
  async syncRates() {
    await this.currencyPairsService.handleDailyUpdate();
    return { message: 'Exchange rates update process completed successfully' };
  }

  

}