import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findReferralsByPromoter(promoterId: string): Promise<User[]> {
    // First, verify the promoter exists and actually has the PROMOTER role
    const promoter = await this.usersRepository.findOne({
      where: { id: promoterId, role: UserRole.PROMOTER },
    });

    if (!promoter) {
      throw new NotFoundException(`Promoter with ID ${promoterId} not found`);
    }

    // Return users referred by this promoter
    // We explicitly select fields to avoid returning sensitive data like the password hash
    return this.usersRepository.find({
      where: { referredBy: { id: promoterId } },
      select: ['id', 'email', 'displayName', 'role', 'isActive', 'promoCode'],
    });
  }

  async getTotalUsersCount(): Promise<number> {
    return this.usersRepository.count();
  }
}
