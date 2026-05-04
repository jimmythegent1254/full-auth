import { Injectable } from '@nestjs/common';
import { generateResetToken, hashToken } from '../../utils/crypto/reset-token';
import { generateVerificationToken } from '../../utils/crypto/token';
import { TOKEN_EXPIRY } from '../constants';

@Injectable()
export class TokenService {
  generateVerificationToken(): string {
    return generateVerificationToken();
  }

  generatePasswordResetToken(): string {
    return generateResetToken();
  }

  hashToken(token: string): string {
    return hashToken(token);
  }

  getVerificationTokenExpiry(): Date {
    return new Date(Date.now() + TOKEN_EXPIRY.VERIFICATION);
  }

  getPasswordResetTokenExpiry(): Date {
    return new Date(Date.now() + TOKEN_EXPIRY.PASSWORD_RESET);
  }
}