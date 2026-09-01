import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromotersController } from './promoters.controller';
import { PromotersService } from './promoters.service';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [PromotersController],
  providers: [PromotersService],
})
export class PromotersModule {}