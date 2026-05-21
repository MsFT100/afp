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

  async getLeaderboard(
    countryCode?: string,
    metric: 'wins' | 'coins' | 'winRate' = 'wins',
    page: number = 1,
    limit: number = 100,
  ) {
    const offset = (page - 1) * limit;
    const query = this.matchRepository
      .createQueryBuilder('match')
      .innerJoin('match.players', 'player')
      .leftJoin('match.winner', 'winner')
      .select([
        'player.displayName AS name',
        'player.countryCode AS country',
        'COUNT(CASE WHEN winner.id = player.id THEN 1 END) AS wins',
        'SUM(CASE WHEN winner.id = player.id THEN match.winAmount ELSE 0 END) AS coins',
        'COUNT(match.id) AS "totalGames"',
        'CAST(COUNT(CASE WHEN winner.id = player.id THEN 1 END) AS DECIMAL(10,2)) / NULLIF(COUNT(match.id), 0) * 100 AS "winRate"',
      ])
      .groupBy('player.id, player.displayName, player.countryCode')
      .offset(offset)
      .limit(limit);

    if (countryCode) {
      query.where('player.countryCode = :countryCode', { countryCode });
    }

    // Apply ordering based on the requested metric
    if (metric === 'coins') {
      query.orderBy('coins', 'DESC');
    } else if (metric === 'winRate') {
      query.orderBy('"winRate"', 'DESC');
    } else {
      query.orderBy('wins', 'DESC');
    }

    const results = await query.getRawMany();
    return results.map((row, index) => ({
      name: row.name,
      country: row.country,
      wins: parseInt(row.wins, 10),
      coins: parseFloat(row.coins || '0'),
      totalGames: parseInt(row.totalGames, 10),
      winRate: parseFloat(row.winRate || '0').toFixed(2) + '%',
      position: offset + index + 1,
    }));
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

    const savedMatch = await this.matchRepository.save(match);

    // Atomically update player statistics to maintain data integrity between match records and user profiles
    await Promise.all([
      this.playerRepository.increment({ id: dto.winnerId }, 'gamesPlayed', 1),
      this.playerRepository.increment({ id: dto.winnerId }, 'gamesWon', 1),
      this.playerRepository.increment({ id: dto.loserId }, 'gamesPlayed', 1),
      this.playerRepository.increment({ id: dto.loserId }, 'gamesLost', 1),
    ]);

    return savedMatch;
  }
}