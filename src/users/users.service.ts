import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './user.entity';
import { WalletsService } from '../wallet/wallet.service';
import { TransactionType } from '../transactions/transaction.entity';
import { Avatar } from '../avatars/avatar.entity';
import { Cue } from '../cues/cue.entity';


@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Avatar)
    private avatarRepository: Repository<Avatar>,
    @InjectRepository(Cue)
    private cueRepository: Repository<Cue>,
    private walletsService: WalletsService,
  ) {}

  async getUserData(userId: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['activeAvatar', 'activeCue'],
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        ownedCues: true,
        ownedChats: true,
        ownedAvatars: true,
        activeAvatarId: true,
        activeCueId: true,
        usedCue: true,
        ownEmojiPack: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async setUsedCue(userId: string, index: number, power: number, aim: number, time: number) {
    const usedCueString = `'${index}';'${power}';'${aim}';'${time}'`;
    await this.usersRepository.update(userId, { usedCue: usedCueString });
    return { success: true, usedCue: usedCueString };
  }

  async setActiveAvatar(
    userId: string,
    avatarId: string,
  ): Promise<{ success: boolean; activeAvatar: Avatar }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Validate ownership: Check if the avatarId is in the semicolon-separated string
    // Following your pattern, IDs are wrapped in single quotes: 'id'
    const avatarRef = `'${avatarId}'`;
    if (!user.ownedAvatars.includes(avatarRef)) {
      throw new BadRequestException('You do not own this avatar');
    }

    // Fetch the full Avatar object to ensure it exists and to return it
    const avatarToSet = await this.avatarRepository.findOne({ where: { id: avatarId } });
    if (!avatarToSet) {
      throw new NotFoundException('Avatar not found in the database');
    }

    await this.usersRepository.update(userId, { activeAvatarId: avatarId });
    return { success: true, activeAvatar: avatarToSet };
  }

  async setActiveCue(
    userId: string,
    cueId: string,
  ): Promise<{ success: boolean; activeCue: Cue }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const cueRef = `'${cueId}'`;
    if (!user.ownedCues.includes(cueRef)) {
      throw new BadRequestException('You do not own this cue');
    }

    const cueToSet = await this.cueRepository.findOne({ where: { id: cueId } });
    if (!cueToSet) throw new NotFoundException('Cue not found');

    await this.usersRepository.update(userId, { activeCueId: cueId });
    return { success: true, activeCue: cueToSet };
  }

  async addBoughtCue(userId: string, index: number, cost: number) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const cueRef = `'${index}'`;
    if (user.ownedCues.includes(cueRef)) {
      throw new BadRequestException('You already own this cue');
    }

    const reference = `buy_cue_${index}_${Date.now()}`;
    await this.walletsService.deductBalance(userId, cost, TransactionType.PURCHASE, reference);

    // Mimicking PlayFab logic: appending to the semicolon-separated string
    const updatedCues = user.ownedCues ? `${user.ownedCues};${cueRef}` : cueRef;
    await this.usersRepository.update(userId, { ownedCues: updatedCues });
    return { success: true, ownedCues: updatedCues };
  }

  async addBoughtChat(userId: string, index: number, cost: number) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const chatRef = `'${index}'`;
    if (user.ownedChats.includes(chatRef)) {
      throw new BadRequestException('You already own this chat pack');
    }

    const reference = `buy_chat_${index}_${Date.now()}`;
    await this.walletsService.deductBalance(userId, cost, TransactionType.PURCHASE, reference);

    const updatedChats = user.ownedChats ? `${user.ownedChats};${chatRef}` : chatRef;
    await this.usersRepository.update(userId, { ownedChats: updatedChats });
    return { success: true, ownedChats: updatedChats };
  }

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

  async updatePhone(userId: string, phoneNumber: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.phoneNumber = phoneNumber;
    return this.usersRepository.save(user);
  }
}
