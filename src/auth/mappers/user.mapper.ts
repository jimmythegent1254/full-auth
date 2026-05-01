import { User } from '../../database/schema';
import type { PublicUser } from '../../types/auth/public-user';

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}
