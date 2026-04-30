import { User } from '../../database/schema';
import { PublicUser } from '../types/public-user';

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}
