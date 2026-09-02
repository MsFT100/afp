import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import { SettingsService } from '../settings/settings.service';
import {
  REFERRAL_BONUS_KEY,
  DEFAULT_REFERRAL_BONUS,
} from '../auth/auth.service';

@Injectable()
export class PromotersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private settingsService: SettingsService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.referredBy', 'referredBy')
      .where('user.id = :userId', { userId })
      .getOne();

    if (!user) {
      throw new NotFoundException('Promoter not found');
    }

    if (user.role !== UserRole.PROMOTER) {
      throw new ForbiddenException('Access denied: not a promoter account');
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      promoCode: user.promoCode,
      countryCode: user.countryCode,
      referredBy: user.referredBy
        ? { id: user.referredBy.id, promoCode: user.referredBy.promoCode }
        : null,
    };
  }

  async getReferrals(promoterId: string) {
    const promoter = await this.userRepository.findOne({
      where: { id: promoterId, role: UserRole.PROMOTER },
    });
    if (!promoter) {
      throw new NotFoundException('Promoter not found');
    }

    const commission = await this.settingsService.getNumber(
      REFERRAL_BONUS_KEY,
      DEFAULT_REFERRAL_BONUS,
    );

    const referrals = await this.userRepository.find({
      where: { referredBy: { id: promoterId } },
      select: [
        'id',
        'email',
        'displayName',
        'role',
        'isActive',
        'promoCode',
        'lastLoginAt',
        'createdAt',
      ],
      order: { createdAt: 'DESC' },
    });

    return {
      commission,
      totalReferrals: referrals.length,
      totalEarnings: referrals.length * commission,
      referrals,
    };
  }
}
