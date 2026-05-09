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
import { Transaction } from 'typeorm';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        entities: [User, Wallet, Transaction],
        synchronize: configService.get<string>('NODE_ENV') !== 'production',
      }),
    }),
    TypeOrmModule.forFeature([User, Wallet, Transaction]),
    AuthModule,
    TransactionsModule, // Add the new TransactionsModule
  ],
  controllers: [UsersController, WalletsController],
  providers: [UsersService, WalletsService],
})
export class AppModule {}
