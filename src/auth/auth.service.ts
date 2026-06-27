import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import { MailService } from '../mail/mail.service';
import { WalletsService } from '../wallet/wallet.service';

const WELCOME_BONUS = 30;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private mailService: MailService,
    private walletsService: WalletsService,
  ) {}

  async register(
    email: string,
    password: string,
    displayName: string,
    phoneNumber: string,
    role?: UserRole,
    promoCode?: string,
    giveWelcomeBonus: boolean = true,
  ): Promise<User> {
    const normalizedEmail = email.toLowerCase();
    const existingUser = await this.userRepository.findOne({ where: { email: normalizedEmail } });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    if (promoCode) {
      const existingPromo = await this.userRepository.findOne({
        where: { promoCode },
      });
      if (existingPromo) {
        throw new ConflictException('Promo code is already in use');
      }
    }

    const hash = await bcrypt.hash(password, 10);

    const userEntity = this.userRepository.create({
      email: normalizedEmail,
      password: hash,
      displayName,
      phoneNumber,
      role: role || UserRole.PLAYER,
      promoCode,
    });

    const saved = await this.userRepository.save(userEntity);

    this.mailService.sendWelcomeEmail(saved.email, saved.displayName).catch(() => {});

    if (giveWelcomeBonus) {
      await this.walletsService.addBalance(saved.id, WELCOME_BONUS);
    }

    return saved;
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ token: string; user: Partial<User> }> {
    // Use QueryBuilder to explicitly select the hidden password field
    const user = await this.userRepository.createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid password');
    }

    await this.userRepository.update(user.id, { lastLoginAt: new Date() });

    const payload = { userId: user.id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email: email.toLowerCase() } });
    if (!user) return;

    const token = randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 3600000);

    await this.userRepository.update(user.id, { resetToken: token, resetTokenExpiry: expiry });

    this.mailService.sendPasswordResetEmail(user.email, token).catch(() => {});
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { resetToken: token },
    });

    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await this.userRepository.update(user.id, {
      password: hash,
      resetToken: null,
      resetTokenExpiry: null,
    });
  }

  async loginWithPromoCode(promoCode: string, password: string): Promise<{ token: string; user: Partial<User> }> {
    const user = await this.userRepository.createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.promoCode = :promoCode', { promoCode })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Invalid promo code');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid password');
    }

    await this.userRepository.update(user.id, { lastLoginAt: new Date() });

    const payload = { userId: user.id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        promoCode: user.promoCode,
      },
    };
  }
}
