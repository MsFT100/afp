import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async register(
    email: string,
    password: string,
    displayName: string,
    phoneNumber: string,
    role?: UserRole,
    promoCode?: string,
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

    return this.userRepository.save(userEntity);
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
}
