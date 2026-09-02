import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromotersController } from './promoters.controller';
import { PromotersService } from './promoters.service';
import { User } from '../users/user.entity';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), SettingsModule],
  controllers: [PromotersController],
  providers: [PromotersService],
})
export class PromotersModule {}