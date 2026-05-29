import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT', 587),
      secure: this.configService.get<number>('SMTP_PORT', 587) === 465,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({
      from: `"African Pool Pros" <no-reply@africanpoolpros.com>`,
      to,
      subject,
      html,
    });
  }

  private template(body: string): string {
    return `
      <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f4;padding:20px">
        <div style="background:#1a1a2e;border-radius:12px 12px 0 0;padding:30px;text-align:center">
          <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700">🏆 African Pool Pros</h1>
        </div>
        <div style="background:#ffffff;padding:40px 30px;border-radius:0 0 12px 12px">
          ${body}
          <hr style="border:none;border-top:1px solid #e0e0e0;margin:30px 0" />
          <p style="color:#999;font-size:12px;text-align:center;margin:0">
            African Pool Pros — where champions are made.<br />
            If you didn't request this email, please ignore it.
          </p>
        </div>
      </div>
    `;
  }

  async sendWelcomeEmail(to: string, displayName: string): Promise<void> {
    await this.send(
      to,
      'Welcome to African Pool Pros!',
      this.template(`
        <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px">Hey <strong>${displayName}</strong>,</p>
        <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px">
          Welcome to <strong>African Pool Pros</strong>! Your account is ready to go.
        </p>
        <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 30px">
          Download the app, log in, and start playing against the best on the continent.
        </p>
        <div style="text-align:center">
          <a href="${this.configService.get<string>('BASE_URL', '#')}"
             style="display:inline-block;background:#e94560;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:16px;font-weight:600">
            Get Started
          </a>
        </div>
      `),
    );
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetUrl = `${this.configService.get<string>('BASE_URL', 'http://localhost:8000')}/auth/reset-password?token=${token}`;
    await this.send(
      to,
      'Reset Your Password - African Pool Pros',
      this.template(`
        <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px">Hello,</p>
        <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px">
          We received a request to reset your password. Click the button below to set a new one.
        </p>
        <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 10px;text-align:center">
          This link expires in <strong>1 hour</strong>.
        </p>
        <div style="text-align:center;margin:30px 0">
          <a href="${resetUrl}"
             style="display:inline-block;background:#e94560;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:16px;font-weight:600">
            Reset Password
          </a>
        </div>
        <p style="color:#888;font-size:14px;line-height:1.6;margin:0;text-align:center">
          If the button doesn't work, copy this link into your browser:<br />
          <a href="${resetUrl}" style="color:#e94560;word-break:break-all">${resetUrl}</a>
        </p>
      `),
    );
  }
}
