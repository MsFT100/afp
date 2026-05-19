import 'multer';
import { Controller, Post, Get, Body, UseGuards, Req, UseInterceptors, UploadedFile, Param, Delete } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AvatarsService } from './avatars.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user.entity';
import { Rarity } from './avatar.entity';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Controller('avatars')
export class AvatarsController {
  constructor(
    private readonly avatarsService: AvatarsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('publish')
  @UseInterceptors(FileInterceptor('image'))
  async uploadAndPublish(
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @Body('price') price: number,
    @Body('rarity') rarity: Rarity,
  ) {
    const upload = await this.cloudinaryService.uploadImage(file, 'avatars'); // upload.public_id will be available here
    const avatar = await this.avatarsService.create(name, upload.secure_url, upload.public_id, price, rarity);
    return this.avatarsService.publish(avatar.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/list')
  async adminList() {
    return this.avatarsService.findAll(true);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  async getMyAvatars(@Req() req) {
    return this.avatarsService.findOwned(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list() {
    return this.avatarsService.findAll(false);
  }

  @UseGuards(JwtAuthGuard)
  @Post('purchase/:id')
  async purchase(@Req() req, @Param('id') id: string) {
    return this.avatarsService.purchase(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.avatarsService.remove(id);
  }
}
