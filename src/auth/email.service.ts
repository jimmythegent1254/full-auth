import { Resend } from 'resend';
import { logger } from '../common/logger/logger';

function getResendClient() {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    throw new Error('RESEND_API_KEY is not defined');
  }

  return new Resend(key);
}

export async function sendVerificationEmail(email: string, token: string) {
  logger.info({
    type: 'VERIFICATION_EMAIL_SENT',
    email,
  });
  const resend = getResendClient();

  const verificationLink = `http://localhost:3000/auth/verify?token=${token}`;

  return resend.emails.send({
    from: 'onboarding@resend.dev',
    to: email,
    subject: 'Verify your email',
    html: `
      <h2>Verify your account</h2>
      <a href="${verificationLink}">Click to verify</a>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  logger.info({
    type: 'PASSWORD_RESET_EMAIL_SENT',
    email,
  });
  const resetLink = `https://your-frontend.com/reset-password?token=${token}`;
  const resend = getResendClient();

  return resend.emails.send({
    from: 'onboarding@resend.dev',
    to: email,
    subject: 'Reset your password',
    html: `
      <h2>Reset your password</h2>
      <a href="${resetLink}">Click to reset your password</a>
    `,
  });
}
