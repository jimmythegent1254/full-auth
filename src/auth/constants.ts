export const TOKEN_EXPIRY = {
  VERIFICATION: 24 * 60 * 60 * 1000, // 24 hours
  PASSWORD_RESET: 15 * 60 * 1000, // 15 minutes
} as const;

export const SESSION_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days

export const PASSWORD_DELAY = 80; // ms