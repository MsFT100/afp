import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './settings.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting)
    private readonly settingsRepository: Repository<Setting>,
  ) {}

  async getNumber(key: string, defaultValue: number): Promise<number> {
    const setting = await this.settingsRepository.findOne({
      where: { key },
    });
    if (!setting) return defaultValue;
    const parsed = parseInt(setting.value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  async setNumber(key: string, value: number): Promise<number> {
    const existing = await this.settingsRepository.findOne({ where: { key } });
    if (existing) {
      existing.value = String(value);
      await this.settingsRepository.save(existing);
    } else {
      const setting = this.settingsRepository.create({
        key,
        value: String(value),
      });
      await this.settingsRepository.save(setting);
    }
    return value;
  }
}
