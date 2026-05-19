import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Avatar, Rarity } from './avatar.entity';
import { User } from '../users/user.entity';
import { WalletsService } from '../wallet/wallet.service';
import { TransactionType } from '../transactions/transaction.entity';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class AvatarsService {
  constructor(
    @InjectRepository(Avatar)
    private avatarRepository: Repository<Avatar>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private walletsService: WalletsService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async create(name: string, imageUrl: string, publicId: string, price: number, rarity: Rarity): Promise<Avatar> {
    const avatar = this.avatarRepository.create({ name, imageUrl, publicId, price, rarity });
    return this.avatarRepository.save(avatar);
  }

  async publish(id: string): Promise<Avatar> {
    const avatar = await this.avatarRepository.findOne({ where: { id } });
    if (!avatar) throw new NotFoundException('Avatar not found');
    avatar.isPublished = true;
    return this.avatarRepository.save(avatar);
  }

  async findAll(isAdmin: boolean = false): Promise<Avatar[]> {
    if (isAdmin) return this.avatarRepository.find();
    return this.avatarRepository.find({ where: { isPublished: true } });
  }

  async findOwned(userId: string): Promise<Avatar[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.ownedAvatars) return [];

    const ids = user.ownedAvatars
      .split(';')
      .map((id) => id.replace(/'/g, ''))
      .filter((id) => id.length > 0);

    if (ids.length === 0) return [];
    return this.avatarRepository.find({ where: { id: In(ids) } });
  }

  async remove(id: string): Promise<void> {
    const avatar = await this.avatarRepository.findOne({ where: { id } });
    if (!avatar) throw new NotFoundException('Avatar not found');
    if (avatar.publicId) {
      await this.cloudinaryService.deleteImage(avatar.publicId);
    }

    await this.avatarRepository.remove(avatar);
  }

  async purchase(userId: string, avatarId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const avatar = await this.avatarRepository.findOne({ where: { id: avatarId } });

    if (!user || !avatar) throw new NotFoundException('User or Avatar not found');
    if (!avatar.isPublished) throw new BadRequestException('Avatar is not available for purchase');

    const avatarRef = `'${avatar.id}'`;
    if (user.ownedAvatars.includes(avatarRef)) {
      throw new BadRequestException('You already own this avatar');
    }

    const reference = `buy_avatar_${avatar.id.substring(0, 8)}_${Date.now()}`;
    await this.walletsService.deductBalance(
      userId,
      Number(avatar.price),
      TransactionType.PURCHASE,
      reference,
    );

    user.ownedAvatars = user.ownedAvatars ? `${user.ownedAvatars};${avatarRef}` : avatarRef;
    return this.userRepository.save(user);
  }
}