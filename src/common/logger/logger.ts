export const logger = {
  info: (data: Record<string, any>) => {
    console.log(JSON.stringify({ level: 'info', ...data }));
  },

  warn: (data: Record<string, any>) => {
    console.warn(JSON.stringify({ level: 'warn', ...data }));
  },

  error: (data: Record<string, any>) => {
    console.error(JSON.stringify({ level: 'error', ...data }));
  },
};
