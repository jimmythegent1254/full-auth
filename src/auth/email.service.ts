import { Resend } from 'resend';

function getResendClient() {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    throw new Error('RESEND_API_KEY is not defined');
  }

  return new Resend(key);
}

export async function sendVerificationEmail(email: string, token: string) {
  console.log(`Sending verification email to ${email} with token ${token}`);
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
