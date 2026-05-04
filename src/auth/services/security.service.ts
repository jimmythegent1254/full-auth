import { Injectable } from '@nestjs/common';
import { hashPassword, verifyPassword } from '../../utils/crypto/password';
import { PASSWORD_DELAY } from '../constants';

@Injectable()
export class SecurityService {
  async hashPassword(password: string): Promise<string> {
    return hashPassword(password);
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    return verifyPassword(hash, password);
  }

  async fakeDelay(): Promise<void> {
    await new Promise((res) => setTimeout(res, PASSWORD_DELAY));
  }
}