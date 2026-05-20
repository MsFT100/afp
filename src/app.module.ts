import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './users/user.entity';
import { Wallet } from './wallet/wallet.entity';
import { Transaction } from './transactions/transaction.entity';
import { AuthModule } from './auth/auth.module';
import { TransactionsModule } from './transactions/transactions.module';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { WalletsController } from './wallet/wallet.controller';
import { WalletsService } from './wallet/wallet.service';
import { Avatar } from './avatars/avatar.entity';
import { AvatarsController } from './avatars/avatars.controller';
import { Cue } from './cues/cue.entity';
import { Match } from './matchmaking/match.entity';
import { CuesService } from './cues/cues.service';
import { AvatarsService } from './avatars/avatars.service';
import { AdminModule } from './admin/admin.module';
import { CuesController } from './cues/cues.controller';
import { PayPalModule } from './paypal/paypal.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { PaystackWebhookModule } from './paystack/paystack.webhook.module';
import { PaystackModule } from './paystack/paystack.module';
import { PayPalWebhookModule } from './paypal/paypal.webhook.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { CurrencyPairsModule } from './currency/currency-pairs.module';
import { CurrencyPair } from './currency/currency-pair.entity';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const username = configService.get<string>('MYSQL_USER') || 'root';
        const password = configService.get<string>('MYSQL_PASSWORD');
        const database = configService.get<string>('MYSQL_DATABASE') || 'app_db';
        const port = configService.get<number>('MYSQL_PORT') || 3306;

        const writerHost = 'bridge-database.c0rcmqc0kwek.us-east-1.rds.amazonaws.com';
        const readerHost = 'bridge-database.c0rcmqc0kwek.us-east-1.rds.amazonaws.com';

        const ssl = {
          rejectUnauthorized: false,
        };

        return {
          type: 'mysql',
          replication: {
            master: {
              host: writerHost,
              port,
              username,
              password,
              database,
              ssl,
            },
            slaves: [
              {
                host: readerHost,
                port,
                username,
                password,
                database,
                ssl,
              },
            ],
          },
          entities: [User, Wallet, Transaction, Avatar, Cue, Match, CurrencyPair],
          synchronize: configService.get<string>('NODE_ENV') !== 'production',
        };
      },
    }),
    // Feature entities should ideally be moved to their respective modules
    TypeOrmModule.forFeature([User, Wallet, Transaction, Avatar, Cue, Match, CurrencyPair]), 
    AuthModule,
    TransactionsModule,
    CloudinaryModule,
    AdminModule,
    PayPalModule, // Add PayPalModule here
    PaystackModule,
    PaystackWebhookModule,
    PayPalWebhookModule,
    MatchmakingModule,
    CurrencyPairsModule,
  ],
  controllers: [UsersController, WalletsController, AvatarsController, CuesController], 
  providers: [UsersService, WalletsService, AvatarsService, CuesService],
})
export class AppModule {}
