import { Controller, Post, Body, UseGuards, Get, Query } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RecordMatchDto } from './dto/record-match.dto';


@Controller('matchmaking')
export class MatchmakingController {
  constructor(private readonly matchmakingService: MatchmakingService) {}

  @UseGuards(JwtAuthGuard)
  @Post('record')
  async record(@Body() recordMatchDto: RecordMatchDto) {
    return this.matchmakingService.recordMatch(recordMatchDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('leaderboard')
  async getLeaderboard(
    @Query('country') country?: string,
    @Query('region') region?: string,
    @Query('metric') metric: 'wins' | 'coins' | 'winRate' = 'wins',
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.matchmakingService.getLeaderboard(country, region, metric, Number(page), Number(limit));
  }

  @Get('leaderboard-world')
  async getLeaderboardWorld(
    @Query('country') country?: string,
    @Query('region') region?: string,
    @Query('metric') metric: 'wins' | 'coins' | 'winRate' = 'wins',
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.matchmakingService.getLeaderboard(country, region, metric, Number(page), Number(limit));
  }
}