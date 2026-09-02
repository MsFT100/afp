import {
  Controller,
  Get,
  Request,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PromotersService } from './promoters.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User, UserRole } from '../users/user.entity';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('promoters')
export class PromotersController {
  constructor(private readonly promotersService: PromotersService) {}

  @Get('/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROMOTER)
  async me(@Request() req) {
    return this.promotersService.getProfile(req.user.id);
  }

  @Get('/me/referrals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROMOTER)
  async myReferrals(@Request() req) {
    return this.promotersService.getReferrals(req.user.id);
  }
}
