import nodemailer from "nodemailer";

type SmtpConfig = {
  service: string;
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export class SmtpClient {
  private config: SmtpConfig;

  constructor(config: SmtpConfig) {
    this.config = config;
  }

  async sendEmail(receiver: string, subject: string, textContent: string, htmlContent: string) {
    const transporter = nodemailer.createTransport({
      service: this.config.service,
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: this.config.auth,
    });

    const info = await transporter.sendMail({
      from: this.config.auth.user,
      to: receiver,
      subject,
      text: textContent,
      html: htmlContent,
    });

    return info;
  }
}