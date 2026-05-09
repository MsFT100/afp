import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User, UserRole } from '../users/user.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

async function bootstrap() {
  // Create a context without starting the HTTP server
  const app = await NestFactory.createApplicationContext(AppModule);
  const userRepository = app.get<Repository<User>>(getRepositoryToken(User));

  // Accept arguments from command line or use defaults
  const adminEmail = process.argv[2] || 'admin@afp.com';
  const adminPassword = process.argv[3] || 'Admin_1234!';
  const adminName = 'System Administrator';

  console.log(`Checking for existing admin: ${adminEmail}...`);

  const existingAdmin = await userRepository.findOne({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.error('Error: A user with this email already exists.');
    await app.close();
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  const admin = userRepository.create({
    email: adminEmail,
    password: hashedPassword,
    displayName: adminName,
    role: UserRole.ADMIN,
    isActive: true,
  });

  await userRepository.save(admin);
  console.log(
    `\x1b[32mSuccess:\x1b[0m Admin user created with email: ${adminEmail}`,
  );

  await app.close();
}

bootstrap().catch((err) => {
  console.error('Failed to create admin:', err);
  process.exit(1);
});
