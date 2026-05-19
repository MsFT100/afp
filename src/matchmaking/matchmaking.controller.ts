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
    @Query('countryCode') countryCode?: string,
    @Query('metric') metric: 'wins' | 'coins' | 'winRate' = 'wins',
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 100,
  ) {
    return this.matchmakingService.getLeaderboard(countryCode, metric, Number(page), Number(limit));
  }
}