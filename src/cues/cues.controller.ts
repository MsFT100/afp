import 'multer';
import { Controller, Post, Get, Body, UseGuards, Req, UseInterceptors, UploadedFile, Param, Delete } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CuesService } from './cues.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Cue, Rarity } from './cue.entity';
import { UserRole } from '../users/user.entity';
import { CloudinaryService } from '../cloudinary/cloudinary.service';


@Controller('cues')
export class CuesController {
  constructor(
    private readonly cuesService: CuesService,
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
    @Body('power') power: number,
    @Body('aim') aim: number,
    @Body('time') time: number,
    @Body('rarity') rarity: Rarity,
  ) { // upload.public_id will be available here
    const upload = await this.cloudinaryService.uploadImage(file, 'cues'); 
    const cue = await this.cuesService.create(name, upload.secure_url, upload.public_id, price, Number(power), Number(aim), Number(time), rarity);
    return this.cuesService.publish(cue.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/list')
  async adminList() {
    return this.cuesService.findAll(true);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list() {
    return this.cuesService.findAll(false);
  }

  @UseGuards(JwtAuthGuard)
  @Post('purchase/:id')
  async purchase(@Req() req, @Param('id') id: string) {
    return this.cuesService.purchase(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.cuesService.remove(id);
  }
}