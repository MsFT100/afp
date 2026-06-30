import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingController } from './matchmaking.controller';
import { Match } from './match.entity';
import { User } from '../users/user.entity';
import { WalletModule } from '../wallet/wallet.module';


@Module({
  imports: [TypeOrmModule.forFeature([Match, User]), WalletModule],
  providers: [MatchmakingService],
  controllers: [MatchmakingController],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}