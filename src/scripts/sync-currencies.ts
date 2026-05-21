import { NestFactory } from '@nestjs/core';
import { CurrencyPairsService } from '../currency/currency-pairs.service';
import { AppModule } from '../app.module';

async function run() {
  console.log('--- Manual Currency Sync Started ---');
  
  // Create application context without starting the full web server
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(CurrencyPairsService);

  try {
    await service.handleDailyUpdate();
    console.log('--- Sync Completed Successfully ---');
  } catch (error) {
    console.error('--- Sync Failed ---');
    console.error(error);
  } finally {
    await app.close();
  }
}

run();