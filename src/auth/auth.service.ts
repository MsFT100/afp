import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import { MailService } from '../mail/mail.service';
import { WalletsService } from '../wallet/wallet.service';
import { SettingsService } from '../settings/settings.service';

export const WELCOME_BONUS_KEY = 'welcome_bonus';
export const DEFAULT_WELCOME_BONUS = 50;
export const REFERRAL_BONUS_KEY = 'referral_bonus';
export const DEFAULT_REFERRAL_BONUS = 20;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private mailService: MailService,
    private walletsService: WalletsService,
    private settingsService: SettingsService,
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
    const existingUser = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    let referredBy: User | undefined;
    let ownedPromoCode: string | undefined;
    const normalizedPromo = promoCode?.trim();

    if (normalizedPromo) {
      const promoOwner = await this.userRepository.findOne({
        where: { promoCode: normalizedPromo },
      });

      if (promoOwner) {
        if (promoOwner.role === UserRole.PROMOTER) {
          referredBy = promoOwner;
          ownedPromoCode = undefined;
        } else {
          throw new ConflictException('Promo code is already in use');
        }
      }
    }

    const hash = await bcrypt.hash(password, 10);

    const userEntity = this.userRepository.create({
      email: normalizedEmail,
      password: hash,
      displayName,
      phoneNumber,
      role: role || UserRole.PLAYER,
      promoCode: ownedPromoCode,
      referredBy,
    });

    const saved = await this.userRepository.save(userEntity);

    this.mailService
      .sendWelcomeEmail(saved.email, saved.displayName)
      .catch((error) => {
        this.logger.error(
          `Failed to send welcome email to ${saved.email}`,
          error,
        );
      });

    if (giveWelcomeBonus) {
      const welcomeBonus = await this.settingsService.getNumber(
        WELCOME_BONUS_KEY,
        DEFAULT_WELCOME_BONUS,
      );
      await this.walletsService.addBalance(saved.id, welcomeBonus);
    }

    return saved;
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ token: string; user: Partial<User> }> {
    // Use QueryBuilder to explicitly select the hidden password field
    const user = await this.userRepository
      .createQueryBuilder('user')
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
    const user = await this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });
    if (!user) return;

    const token = randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 3600000);

    await this.userRepository.update(user.id, {
      resetToken: token,
      resetTokenExpiry: expiry,
    });

    this.mailService
      .sendPasswordResetEmail(user.email, token)
      .catch((error) => {
        this.logger.error(
          `Failed to send password reset email to ${user.email}`,
          error,
        );
      });
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

  async loginWithPromoCode(
    promoCode: string,
    password: string,
  ): Promise<{ token: string; user: Partial<User> }> {
    const user = await this.userRepository
      .createQueryBuilder('user')
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
