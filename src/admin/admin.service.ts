import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like } from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import { Transaction, TransactionStatus, TransactionType } from '../transactions/transaction.entity';
import { Avatar } from '../avatars/avatar.entity';
import { WalletsService } from '../wallet/wallet.service';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(Avatar)
    private avatarRepository: Repository<Avatar>,
    private walletsService: WalletsService, // Inject WalletsService
    private authService: AuthService,
  ) {}

  async getGlobalStats() {
    const totalDeposits = await this.transactionRepository.sum('amount', {
      status: TransactionStatus.SUCCESS,
      type: In([TransactionType.DEPOSIT, TransactionType.PAYPAL_DEPOSIT]), // Include PayPal deposits
    });

    const totalWithdrawals = await this.transactionRepository.sum('amount', {
      status: TransactionStatus.SUCCESS,
      type: TransactionType.WITHDRAWAL,
    });

    const totalPurchases = await this.transactionRepository.sum('amount', {
      status: TransactionStatus.SUCCESS,
      type: TransactionType.PURCHASE,
    });

    const promoterCount = await this.userRepository.count({
      where: { role: UserRole.PROMOTER },
    });

    // Include both Players and Promoters in the total player count 
    // if Promoters are allowed to play games.
    const playerCount = await this.userRepository.count({
      where: { role: In([UserRole.PLAYER, UserRole.PROMOTER]) },
    });

    return {
      totalDeposits: parseFloat(String(totalDeposits || '0')),
      totalWithdrawals: parseFloat(String(totalWithdrawals || '0')),
      totalPurchaseValue: parseFloat(String(totalPurchases || '0')),
      totalPromoters: promoterCount,
      totalPlayers: playerCount,
    };
  }

  async getPeriodicStats(period: 'day' | 'month') {
    const format = period === 'day' ? '%Y-%m-%d' : '%Y-%m';
    
    // Note: This uses MySQL specific DATE_FORMAT
    return this.transactionRepository
      .createQueryBuilder('transaction')
      .select(`DATE_FORMAT(transaction.createdAt, '${format}')`, 'date')
      .addSelect('COUNT(transaction.id)', 'count')
      .addSelect('SUM(transaction.amount)', 'totalAmount')
      .where('transaction.status = :status', { status: TransactionStatus.SUCCESS })
      .groupBy('date')
      .orderBy('date', 'DESC')
      .getRawMany();
  }

  async listUsersByRole(role: UserRole, page: number = 1, limit: number = 20) {
    const [data, total] = await this.userRepository.findAndCount({
      where: { role },
      order: { email: 'ASC' },
      take: limit,
      skip: (page - 1) * limit,
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async listAllUsers(page: number = 1, limit: number = 20, search?: string) {
    const whereCondition = search
      ? [
          { email: Like(`%${search}%`) },
          { displayName: Like(`%${search}%`) },
          { phoneNumber: Like(`%${search}%`) },
        ]
      : {};

    const [data, total] = await this.userRepository.findAndCount({
      where: whereCondition,
      order: { email: 'ASC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getPlayerDetailsWithBalance(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['wallet'],
      select: {
        id: true,
        email: true,
        displayName: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        deactivationReason: true,
        promoCode: true,
        playfabId: true,
        countryCode: true,
        region: true,
        gamesWon: true,
        gamesLost: true,
        gamesPlayed: true,
        ownedCues: true,
        ownedChats: true,
        ownedAvatars: true,
        activeAvatarId: true,
        activeCueId: true,
        usedCue: true,
        ownEmojiPack: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        wallet: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      ...user,
      balance: user.wallet ? Number(user.wallet.balance) : 0,
      wallet: undefined,
    };
  }

  async listAllTransactions(page: number = 1, limit: number = 20, userId?: string) {
    const where = userId ? { user: { id: userId } } : {};
    const [data, total] = await this.transactionRepository.findAndCount({
      where,
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async toggleUserStatus(userId: string, isActive: boolean, reason?: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    
    user.isActive = isActive;
    user.deactivationReason = isActive ? null : reason; // Clear reason if reactivating
    
    return this.userRepository.save(user);
  }

  async manualRegister(registerData: any) {
    return this.authService.register(
      registerData.email,
      registerData.password,
      registerData.displayName,
      registerData.phoneNumber,
      registerData.role || UserRole.PLAYER,
      registerData.promoCode,
    );
  }

  async addCoinsToUser(userId: string, amount: number) {
    return this.walletsService.addBalance(userId, amount);
  }

  async removeCoinsFromUser(userId: string, amount: number) {
    const reference = `manual_deduction_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    return this.walletsService.deductBalance(userId, amount, TransactionType.MANUAL_ADJUSTMENT, reference);
  }
}