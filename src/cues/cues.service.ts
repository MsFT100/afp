import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cue, Rarity } from './cue.entity';
import { User } from '../users/user.entity';
import { WalletsService } from '../wallet/wallet.service';
import { TransactionType } from '../transactions/transaction.entity';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class CuesService {
  constructor(
    @InjectRepository(Cue)
    private cueRepository: Repository<Cue>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private walletsService: WalletsService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async create(name: string, imageUrl: string, publicId: string, price: number, power: number, aim: number, time: number, rarity: Rarity): Promise<Cue> {
    const cue = this.cueRepository.create({ name, imageUrl, publicId, price, power, aim, time, rarity });
    return this.cueRepository.save(cue);
  }

  async publish(id: string): Promise<Cue> {
    const cue = await this.cueRepository.findOne({ where: { id } });
    if (!cue) throw new NotFoundException('Cue not found');
    cue.isPublished = true;
    return this.cueRepository.save(cue);
  }

  async findAll(isAdmin: boolean = false): Promise<Cue[]> {
    if (isAdmin) return this.cueRepository.find();
    return this.cueRepository.find({ where: { isPublished: true } });
  }

  async remove(id: string): Promise<void> {
    const cue = await this.cueRepository.findOne({ where: { id } });
    if (!cue) throw new NotFoundException('Cue not found');
    if (cue.publicId) {
      await this.cloudinaryService.deleteImage(cue.publicId);
    }

    await this.cueRepository.remove(cue);
  }

  async purchase(userId: string, cueId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const cue = await this.cueRepository.findOne({ where: { id: cueId } });

    if (!user || !cue) throw new NotFoundException('User or Cue not found');
    if (!cue.isPublished) throw new BadRequestException('Cue is not available for purchase');

    const cueRef = `'${cue.id}'`;
    if (user.ownedCues.includes(cueRef)) {
      throw new BadRequestException('You already own this cue');
    }

    const reference = `buy_cue_${cue.id.substring(0, 8)}_${Date.now()}`;
    await this.walletsService.deductBalance(userId, Number(cue.price), TransactionType.PURCHASE, reference);

    user.ownedCues = user.ownedCues ? `${user.ownedCues};${cueRef}` : cueRef;
    return this.userRepository.save(user);
  }
}