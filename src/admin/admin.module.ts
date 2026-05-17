import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Avatar } from '../avatars/avatar.entity';
import { WalletsService } from '../wallet/wallet.service';
import { Wallet } from '../wallet/wallet.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { AuthModule } from '../auth/auth.module'; // Ensure AuthModule is imported
import { AvatarsService } from '../avatars/avatars.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { PayPalModule } from '../paypal/paypal.module';
import { PaystackModule } from '../paystack/paystack.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';


@Module({
  imports: [
    TypeOrmModule.forFeature([User, Transaction, Avatar, Wallet]),
    CloudinaryModule,
    AuthModule,
    PayPalModule,
    PaystackModule,
    MatchmakingModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AvatarsService, WalletsService, TransactionsService],
})
export class AdminModule {}