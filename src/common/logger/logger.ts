export const logger = {
  error: (data: any) => {
    console.error(JSON.stringify({ level: 'error', ...data }));
  },
  info: (data: any) => {
    console.log(JSON.stringify({ level: 'info', ...data }));
  },
};
