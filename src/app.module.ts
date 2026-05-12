import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { User } from './users/user.entity';
import { UsersService } from './users/users.service';
import { UsersController } from './users/users.controller';

import { Wallet } from './wallet/wallet.entity';
import { WalletsService } from './wallet/wallet.service';
import { WalletsController } from './wallet/wallet.controller';
import { Transaction } from './transactions/transaction.entity';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        // Support multiple naming conventions from Vercel/Neon
        url: configService.get<string>('DATABASE_URL') || configService.get<string>('POSTGRES_URL' ),
        host: configService.get<string>('PGHOST') || configService.get<string>('POSTGRES_HOST'),
        port: configService.get<number>('PGPORT') || configService.get<number>('POSTGRES_PORT') || 5432,
        username: configService.get<string>('PGUSER') || configService.get<string>('POSTGRES_USER'),
        password: configService.get<string>('PGPASSWORD') || configService.get<string>('POSTGRES_PASSWORD'),
        database: configService.get<string>('PGDATABASE') || configService.get<string>('POSTGRES_DATABASE'),
        entities: [User, Wallet, Transaction],
        synchronize: configService.get<string>('NODE_ENV') !== 'production',
        ssl: true,
        extra: {
          ssl: {
            rejectUnauthorized: false,
          },
        },
      }),
    }),
    // Feature entities should ideally be moved to their respective modules
    TypeOrmModule.forFeature([User, Wallet]), 
    AuthModule,
    TransactionsModule,
  ],
  controllers: [UsersController, WalletsController], // Suggestion: Move these to UsersModule and WalletsModule
  providers: [UsersService, WalletsService],     // Suggestion: Move these to UsersModule and WalletsModule
})
export class AppModule {}
