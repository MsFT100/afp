import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Request,
  ForbiddenException,
  Patch,
  Body,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { User, UserRole } from './user.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpdatePhoneDto } from './update-phone.dto';
import { UpdateDisplayNameDto } from './update-display-name.dto';
import { FriendUserIdDto } from './friend.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me/data')
  async getMyData(@Request() req) {
    return this.usersService.getUserData(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/used-cue')
  async updateUsedCue(
    @Request() req,
    @Body() body: { index: number; power: number; aim: number; time: number },
  ) {
    return this.usersService.setUsedCue(
      req.user.id,
      body.index,
      body.power,
      body.aim,
      body.time,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/active-avatar')
  async updateActiveAvatar(@Request() req, @Body('avatarId') avatarId: string) {
    return this.usersService.setActiveAvatar(req.user.id, avatarId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/active-cue')
  async updateActiveCue(@Request() req, @Body('cueId') cueId: string) {
    return this.usersService.setActiveCue(req.user.id, cueId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/buy-cue')
  async buyCue(@Request() req, @Body('index') index: number, @Body('cost') cost: number) {
    return this.usersService.addBoughtCue(req.user.id, index, cost);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/buy-chat')
  async buyChat(@Request() req, @Body('index') index: number, @Body('cost') cost: number) {
    return this.usersService.addBoughtChat(req.user.id, index, cost);
  }

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

  @UseGuards(JwtAuthGuard)
  @Patch('me/phone')
  async updatePhone(@Request() req, @Body() updatePhoneDto: UpdatePhoneDto) {
    return this.usersService.updatePhone(req.user.id, updatePhoneDto.phoneNumber);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/display-name')
  async updateDisplayName(@Request() req, @Body() updateDisplayNameDto: UpdateDisplayNameDto) {
    return this.usersService.updateDisplayName(req.user.id, updateDisplayNameDto.displayName);
  }

  @UseGuards(JwtAuthGuard)
  @Post('friends/add')
  async addFriend(@Request() req, @Body() dto: FriendUserIdDto) {
    return this.usersService.addFriend(req.user.id, dto.friendUserId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('friends/list')
  async getFriends(@Request() req) {
    return this.usersService.getFriends(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('friends/remove')
  async removeFriend(@Request() req, @Body() dto: FriendUserIdDto) {
    return this.usersService.removeFriend(req.user.id, dto.friendUserId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('friends/check/:friendUserId')
  async checkFriend(@Request() req, @Param('friendUserId', ParseUUIDPipe) friendUserId: string) {
    return this.usersService.checkFriend(req.user.id, friendUserId);
  }
}
