import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/user.entity';

@Injectable()
export class PromotersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
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
}
