import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { Cron } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';
import { CurrencyPair } from './currency-pair.entity';

@Injectable()
export class CurrencyPairsService {
  private readonly logger = new Logger(CurrencyPairsService.name);

  constructor(
    @InjectRepository(CurrencyPair)
    private currencyRepository: Repository<CurrencyPair>,
    private readonly httpService: HttpService,
  ) {}

  @Cron('0 2 * * *') // Runs every day at 2:00 AM
  async handleDailyUpdate() {
    this.logger.log('Starting daily exchange rate update...');
    const apiKey = process.env.EXCHANGE_RATE_API_KEY; // Use process.env.EXCHANGE_RATE_API_KEY
    const url = `http://api.exchangeratesapi.io/v1/latest?access_key=${apiKey}`;

    try {
      const response = await firstValueFrom(this.httpService.get(url));
      const { base, rates } = response.data;

      if (!rates) {
        throw new Error('Failed to fetch rates from API');
      }

      // Update or Create pairs in DB
      // For example, if we care about KES, USD, and GBP relative to EUR (default base)
      const currenciesToUpdate = ['KES', 'USD', 'GBP', 'JPY'];

      for (const quote of currenciesToUpdate) {
        if (rates[quote]) {
          await this.currencyRepository.upsert(
            {
              baseCurrency: base,
              quoteCurrency: quote,
              rate: rates[quote],
              name: `${base} / ${quote}`,
            },
            ['baseCurrency', 'quoteCurrency'],
          );
        }
      }
      this.logger.log('Exchange rates updated successfully.');
    } catch (error: any) {
      this.logger.error('Error updating exchange rates:', error?.message || error);
    }
  }

  async getCurrencyPairs(base?: string, quote?: string): Promise<CurrencyPair[]> {
    const query: any = {};
    if (base) query.baseCurrency = base.toUpperCase();
    if (quote) query.quoteCurrency = quote.toUpperCase();

    return this.currencyRepository.find({ where: query });
  }
}