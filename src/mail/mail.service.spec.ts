import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  let configService: any;
  let sendMailMock: jest.Mock;

  beforeEach(async () => {
    sendMailMock = jest.fn().mockResolvedValue(undefined);

    configService = {
      get: jest.fn((key: string, defaultValue?: any) => defaultValue),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: ConfigService, useValue: configService },
      ],
    })
      .overrideProvider(MailService)
      .useFactory({
        factory: (cs: ConfigService) => {
          const s = new MailService(cs);
          (s as any).transporter = { sendMail: sendMailMock };
          return s;
        },
        inject: [ConfigService],
      })
      .compile();

    service = module.get<MailService>(MailService);
  });

  describe('sendWelcomeEmail', () => {
    it('should send a welcome email with the correct recipient and subject', async () => {
      configService.get.mockReturnValue(undefined);

      await service.sendWelcomeEmail('player@test.com', 'PlayerOne');

      expect(sendMailMock).toHaveBeenCalledTimes(1);
      const callArg = sendMailMock.mock.calls[0][0];
      expect(callArg.to).toBe('player@test.com');
      expect(callArg.subject).toBe('Welcome to African Pool Pros!');
      expect(callArg.from).toBe('"African Pool Pros" <no-reply@africanpoolpros.com>');
    });

    it('should include the display name in the email body', async () => {
      configService.get.mockReturnValue(undefined);

      await service.sendWelcomeEmail('player@test.com', 'PlayerOne');

      const html = sendMailMock.mock.calls[0][0].html;
      expect(html).toContain('PlayerOne');
      expect(html).toContain('Welcome to <strong>African Pool Pros</strong>');
    });

    it('should use BASE_URL if provided', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'BASE_URL') return 'https://myapp.com';
        return undefined;
      });

      await service.sendWelcomeEmail('player@test.com', 'PlayerOne');

      const html = sendMailMock.mock.calls[0][0].html;
      expect(html).toContain('https://myapp.com');
    });

    it('should use "#" as fallback when BASE_URL is not set', async () => {
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'BASE_URL') return defaultValue ?? undefined;
        return undefined;
      });

      await service.sendWelcomeEmail('player@test.com', 'PlayerOne');

      const html = sendMailMock.mock.calls[0][0].html;
      expect(html).toContain('href="#"');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send a password reset email with the correct recipient and subject', async () => {
      configService.get.mockReturnValue(undefined);

      await service.sendPasswordResetEmail('player@test.com', 'reset-token-123');

      expect(sendMailMock).toHaveBeenCalledTimes(1);
      const callArg = sendMailMock.mock.calls[0][0];
      expect(callArg.to).toBe('player@test.com');
      expect(callArg.subject).toBe('Reset Your Password - African Pool Pros');
    });

    it('should include the reset token in the link', async () => {
      configService.get.mockReturnValue(undefined);

      await service.sendPasswordResetEmail('player@test.com', 'reset-token-xyz');

      const html = sendMailMock.mock.calls[0][0].html;
      expect(html).toContain('reset-token-xyz');
      expect(html).toContain('/reset-password?token=');
    });

    it('should use default FRONTEND_URL of http://localhost:3000 when not configured', async () => {
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'FRONTEND_URL') return defaultValue ?? undefined;
        return undefined;
      });

      await service.sendPasswordResetEmail('test@test.com', 'tok');

      const html = sendMailMock.mock.calls[0][0].html;
      expect(html).toContain('http://localhost:3000/reset-password?token=');
    });

    it('should use custom FRONTEND_URL when configured', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'FRONTEND_URL') return 'https://africanpoolpros.com';
        return undefined;
      });

      await service.sendPasswordResetEmail('test@test.com', 'tok');

      const html = sendMailMock.mock.calls[0][0].html;
      expect(html).toContain('https://africanpoolpros.com/reset-password?token=');
    });

    it('should mention the 1-hour expiry in the body', async () => {
      configService.get.mockReturnValue(undefined);

      await service.sendPasswordResetEmail('test@test.com', 'tok');

      const html = sendMailMock.mock.calls[0][0].html;
      expect(html).toContain('1 hour');
    });
  });

  describe('error handling', () => {
    it('should propagate errors when nodemailer throws', async () => {
      configService.get.mockReturnValue(undefined);
      sendMailMock.mockRejectedValue(new Error('SMTP connection failed'));

      await expect(
        service.sendWelcomeEmail('test@test.com', 'Name'),
      ).rejects.toThrow('SMTP connection failed');
    });

    it('should propagate transporter sendMail errors for password reset', async () => {
      configService.get.mockReturnValue(undefined);
      sendMailMock.mockRejectedValue(new Error('Timeout'));

      await expect(
        service.sendPasswordResetEmail('test@test.com', 'tok'),
      ).rejects.toThrow('Timeout');
    });
  });

  describe('email HTML template', () => {
    it('should render a branded HTML template', async () => {
      configService.get.mockReturnValue(undefined);

      await service.sendWelcomeEmail('test@test.com', 'Name');

      const html = sendMailMock.mock.calls[0][0].html;
      expect(html).toContain('African Pool Pros');
      expect(html).toContain('#1a1a2e');
      expect(html).toContain('#e94560');
      expect(html).toContain('where champions are made');
    });
  });

  describe('SMTP configuration', () => {
    it('should read SMTP config values from ConfigService on construction', () => {
      expect(configService.get).toHaveBeenCalledWith('SMTP_HOST');
      expect(configService.get).toHaveBeenCalledWith('SMTP_PORT', '587');
      expect(configService.get).toHaveBeenCalledWith(
        'SMTP_FROM',
        '"African Pool Pros" <no-reply@africanpoolpros.com>',
      );
      expect(configService.get).toHaveBeenCalledWith('SMTP_USER');
      expect(configService.get).toHaveBeenCalledWith('SMTP_PASS');
    });
  });
});
