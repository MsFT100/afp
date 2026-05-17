import { Controller, Post, Body, UseGuards } from '@nestjs/common';
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
}