import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Match } from './match.entity';
import { User } from '../users/user.entity';
import { RecordMatchDto } from './dto/record-match.dto';

@Injectable()
export class MatchmakingService {
  constructor(
    @InjectRepository(Match)
    private matchRepository: Repository<Match>,
    @InjectRepository(User)
    private playerRepository: Repository<User>,
  ) {}

  async findAll(): Promise<Match[]> {
    return this.matchRepository.find({
      relations: ['winner', 'loser'],
      order: { timestamp: 'DESC' },
    });
  }

  async recordMatch(dto: RecordMatchDto): Promise<Match> {
    const players = await this.playerRepository.findBy({
      id: In(dto.playerIds),
    });

    if (players.length !== dto.playerIds.length) {
      throw new NotFoundException('One or more players not found');
    }

    const match = this.matchRepository.create({
      tableName: dto.tableName,
      entryCoins: dto.entryCoins,
      winAmount: dto.winAmount,
      duration: dto.duration,
      metadata: dto.metadata,
      players: players,
      winner: players.find(p => p.id === dto.winnerId),
      loser: players.find(p => p.id === dto.loserId),
    });

    return await this.matchRepository.save(match);
  }
}