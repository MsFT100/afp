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
      // This list includes USD and the primary currencies for most African countries.
      // The API's default base is EUR, so these will be stored as EUR/XXX pairs.
      const currenciesToUpdate = [
        'USD', // US Dollar
        'DZD', // Algerian Dinar
        'AOA', // Angolan Kwanza
        'XOF', // West African CFA franc (used by Benin, Burkina Faso, Côte d'Ivoire, Guinea-Bissau, Mali, Niger, Senegal, Togo)
        'BWP', // Botswanan Pula
        'BIF', // Burundian Franc
        'CVE', // Cape Verdean Escudo
        'XAF', // Central African CFA franc (used by Cameroon, Central African Republic, Chad, Congo (Rep.), Equatorial Guinea, Gabon)
        'KMF', // Comorian Franc
        'CDF', // Congolese Franc (DRC)
        'DJF', // Djiboutian Franc
        'EGP', // Egyptian Pound
        'ERN', // Eritrean Nakfa
        'SZL', // Eswatini Lilangeni
        'ETB', // Ethiopian Birr
        'GMD', // Gambian Dalasi
        'GHS', // Ghanaian Cedi
        'GNF', // Guinean Franc
        'KES', // Kenyan Shilling
        'LSL', // Lesotho Loti
        'LRD', // Liberian Dollar
        'LYD', // Libyan Dinar
        'MGA', // Malagasy Ariary
        'MWK', // Malawian Kwacha
        'MRU', // Mauritanian Ouguiya
        'MUR', // Mauritian Rupee
        'MAD', // Moroccan Dirham
        'MZN', // Mozambican Metical
        'NAD', // Namibian Dollar
        'NGN', // Nigerian Naira
        'RWF', // Rwandan Franc
        'STN', // São Tomé and Príncipe Dobra
        'SCR', // Seychellois Rupee
        'SLL', // Sierra Leonean Leone
        'SOS', // Somali Shilling
        'ZAR', // South African Rand
        'SSP', // South Sudanese Pound
        'SDG', // Sudanese Pound
        'TZS', // Tanzanian Shilling
        'TND', // Tunisian Dinar
        'UGX', // Ugandan Shilling
        'ZMW', // Zambian Kwacha
        'ZWL', // Zimbabwean Dollar
      ];

      const usdToEurRate = rates['USD'];

      for (const quote of currenciesToUpdate) {
        if (rates[quote]) {
          // 1. Update EUR -> Quote (Directly from API)
          await this.currencyRepository.upsert(
            {
              baseCurrency: base,
              quoteCurrency: quote,
              rate: rates[quote],
              name: `${base} / ${quote}`,
            },
            ['baseCurrency', 'quoteCurrency'],
          );

          // 2. Update USD -> Quote (Derived Cross Rate)
          if (usdToEurRate && quote !== 'USD') {
            const derivedRate = rates[quote] / usdToEurRate;
            await this.currencyRepository.upsert(
              {
                baseCurrency: 'USD',
                quoteCurrency: quote,
                rate: derivedRate,
                name: `USD / ${quote}`,
              },
              ['baseCurrency', 'quoteCurrency'],
            );
          }
        }
      }

      // 3. Add USD -> EUR pair specifically
      if (usdToEurRate) {
        await this.currencyRepository.upsert(
          {
            baseCurrency: 'USD',
            quoteCurrency: 'EUR',
            rate: 1 / usdToEurRate,
            name: `USD / EUR`,
          },
          ['baseCurrency', 'quoteCurrency'],
        );
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