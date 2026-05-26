import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Match } from './match.entity';
import { User } from '../users/user.entity';
import { RecordMatchDto } from './dto/record-match.dto';

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

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
    country?: string,
    region?: string,
    metric: 'wins' | 'coins' | 'winRate' = 'wins',
    page: number = 1,
    limit: number = 20,
  ) {
    const offset = (page - 1) * limit;
    const query = this.matchRepository
      .createQueryBuilder('match')
      .innerJoin('match.players', 'player')
      .leftJoin('match.winner', 'winner')
      .select([
        'player.displayName AS name',
        'player.countryCode AS country',
        'player.region AS region',
        'COUNT(CASE WHEN winner.id = player.id THEN 1 END) AS wins',
        'SUM(CASE WHEN winner.id = player.id THEN match.winAmount ELSE 0 END) AS coins',
        'COUNT(match.id) AS "totalGames"',
        'CAST(COUNT(CASE WHEN winner.id = player.id THEN 1 END) AS DECIMAL(10,2)) / NULLIF(COUNT(match.id), 0) * 100 AS "winRate"',
      ])
      .groupBy('player.id, player.displayName, player.countryCode, player.region')
      .offset(offset)
      .limit(limit);

    if (country && country !== 'All') {
      query.andWhere('player.countryCode = :country', { country });
    }

    if (region && region !== 'All') {
      query.andWhere('player.region = :region', { region });
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
    const leaderboardData = results.map((row, index) => ({
      name: row.name,
      country: row.country,
      region: row.region,
      wins: parseInt(row.wins, 10),
      coins: parseFloat(row.coins || '0'),
      totalGames: parseInt(row.totalGames, 10),
      winRate: parseFloat(row.winRate || '0').toFixed(2) + '%',
      position: offset + index + 1,
    }));
    return {
      leaderboard: leaderboardData,
      lastUpdated: new Date().toISOString(),
    };
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
      countryCode: dto.countryCode,
      players: players,
      winner: players.find(p => p.id === dto.winnerId),
      loser: players.find(p => p.id === dto.loserId),
    });

    const savedMatch = await this.matchRepository.save(match);

    // Prepare promises for atomic updates to player statistics and countryCode
    const updatePromises: Promise<any>[] = [
      this.playerRepository.increment({ id: dto.winnerId }, 'gamesPlayed', 1),
      this.playerRepository.increment({ id: dto.winnerId }, 'gamesWon', 1),
      this.playerRepository.increment({ id: dto.loserId }, 'gamesPlayed', 1),
      this.playerRepository.increment({ id: dto.loserId }, 'gamesLost', 1),
    ];

    // Update player's countryCode if provided in DTO and not already set on the user
    if (dto.countryCode) {
      const winner = players.find(p => p.id === dto.winnerId);
      if (winner && !winner.countryCode) {
        updatePromises.push(this.playerRepository.update({ id: dto.winnerId }, { countryCode: dto.countryCode }));
      }
      const loser = players.find(p => p.id === dto.loserId);
      if (loser && !loser.countryCode) {
        updatePromises.push(this.playerRepository.update({ id: dto.loserId }, { countryCode: dto.countryCode }));
      }
    }

    await Promise.all(updatePromises);

    // Update the objects in memory so the returned response reflects the new stats
    if (match.winner) {
      match.winner.gamesPlayed = (match.winner.gamesPlayed || 0) + 1;
      match.winner.gamesWon = (match.winner.gamesWon || 0) + 1;
      if (dto.countryCode && !match.winner.countryCode) { // Reflect countryCode update in memory
        match.winner.countryCode = dto.countryCode;
      }
    }
    if (match.loser) {
      match.loser.gamesPlayed = (match.loser.gamesPlayed || 0) + 1;
      match.loser.gamesLost = (match.loser.gamesLost || 0) + 1;
      if (dto.countryCode && !match.loser.countryCode) { // Reflect countryCode update in memory
        match.loser.countryCode = dto.countryCode;
      }
    }

    return savedMatch;
  }

  /**
   * Periodically removes match records that were saved with an empty string ID
   * due to previous entity initialization errors.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanUpInvalidMatches() {
    this.logger.log('Starting cleanup of matches with empty IDs...');
    const result = await this.matchRepository.delete({ id: '' as any });
    this.logger.log(`Cleanup complete. Deleted ${result.affected || 0} invalid records.`);
  }
}