import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { User, UserRole } from './user.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Fetch all users referred by a specific promoter ID
   */
  @UseGuards(JwtAuthGuard)
  @Get('promoter/:id/referrals')
  async getReferrals(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req,
  ): Promise<User[]> {
    const currentUser = req.user as User;

    // Check if the user is an admin or is requesting their own referrals
    if (currentUser.role !== UserRole.ADMIN && currentUser.id !== id) {
      throw new ForbiddenException(
        'You do not have permission to view these referrals.',
      );
    }

    return this.usersService.findReferralsByPromoter(id);
  }

  /**
   * Admin endpoint: Get the total number of registered users (players)
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/count')
  async getTotalPlayers(): Promise<{ count: number }> {
    const count = await this.usersService.getTotalUsersCount();
    return { count };
  }
}
