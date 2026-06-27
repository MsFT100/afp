import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Patch,
  Headers,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { AvatarsService } from '../avatars/avatars.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { Rarity } from '../avatars/avatar.entity';
import 'multer';
import { AdminService } from './admin.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { CreatePromoterDto } from './dto/create-promoter.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly avatarsService: AvatarsService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly matchmakingService: MatchmakingService,
  ) {}

  @Get('stats/global')
  async getGlobalStats() {
    return this.adminService.getGlobalStats();
  }

  @Get('stats/periodic')
  async getPeriodicStats(@Query('period') period: 'day' | 'month' = 'day') {
    return this.adminService.getPeriodicStats(period);
  }

  @Get('users/players')
  async listPlayers(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('search') search?: string,
  ) {
    // Corrected to call listAllUsers to fetch all users as requested previously
    return this.adminService.listAllUsers( 
      parseInt(page, 10),
      parseInt(limit, 10),
      search,
    );
  }

  @Get('users/:id')
  async getPlayerDetails(
    @Param('id') userId: string
  ) {
    // Fetch user details including their wallet balance
    return this.adminService.getPlayerDetailsWithBalance(userId);
  }

  @Get('users/promoters')
  async listPromoters(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.adminService.listUsersByRole(
      UserRole.PROMOTER,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get('transactions')
  async listTransactions(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('userId') userId?: string,
  ) {
    return this.adminService.listAllTransactions(
      parseInt(page, 10),
      parseInt(limit, 10),
      userId,
    );
  }

  // Avatar Management
  @Post('avatars/upload')
  @UseInterceptors(FileInterceptor('image'))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @Body('price') price: string,
    @Body('rarity') rarity: Rarity,
  ) {
    const upload = await this.cloudinaryService.uploadImage(file, 'avatars');
    const avatar = await this.avatarsService.create(
      name,
      upload.secure_url,
      upload.public_id,
      parseFloat(price),
      rarity,
    );
    return this.avatarsService.publish(avatar.id);
  }

  @Get('avatars')
  async listAvatars() {
    return this.avatarsService.findAll(true);
  }

  @Delete('avatars/:id')
  async deleteAvatar(@Param('id') id: string) {
    return this.avatarsService.remove(id);
  }

  @Patch('users/:id/status')
  async toggleUserStatus(
    @Param('id') id: string,
    @Body() body: { isActive: boolean; reason?: string },
  ) {
    return this.adminService.toggleUserStatus(id, body.isActive, body.reason);
  }

  @Post('users/register')
  async registerUser(@Body() body: any) {
    return this.adminService.manualRegister(body);
  }

  @Patch('users/:id')
  async updatePlayer(
    @Param('id') id: string,
    @Body() body: { displayName?: string; email?: string; phoneNumber?: string },
  ) {
    return this.adminService.updateUser(id, body);
  }

  @Post('users/:id/add-coins')
  async addCoins(@Param('id') id: string, @Body('amount') amount: number) {
    return this.adminService.addCoinsToUser(id, amount);
  }

  @Post('users/:id/remove-coins')
  async removeCoins(@Param('id') id: string, @Body('amount') amount: number) {
    return this.adminService.removeCoinsFromUser(id, amount);
  }

  @Get('matches')
  async listMatches(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Headers('if-modified-since') ifModifiedSince?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const latestTimestamp = await this.matchmakingService.getLatestMatchTimestamp();

    if (latestTimestamp && ifModifiedSince) {
      const ifModified = new Date(ifModifiedSince).getTime();
      const latest = new Date(latestTimestamp).getTime();
      if (latest <= ifModified) {
        (res as Response).status(304).send();
        return;
      }
    }

    const result = await this.matchmakingService.findAll(parseInt(page, 10), parseInt(limit, 10));
    (res as Response).set('Last-Modified', latestTimestamp || new Date().toUTCString());
    return result;
  }

  @Get('exchange-rate')
  async getExchangeRate(@Query('to') to: string = 'KES') {
    return this.adminService.getExchangeRate(to);
  }

  @Post('users/:id/convert-to-promoter')
  async convertToPromoter(
    @Param('id') userId: string,
    @Body('promoCode') promoCode?: string,
  ) {
    return this.adminService.convertToPromoter(userId, promoCode);
  }
}