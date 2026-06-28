import winston from 'winston';

const { combine, timestamp, printf, colorize } = winston.format;

const customFormat = printf(({ level, message, timestamp, service, ...metadata }) => {
  let log = `${timestamp} [${level}]`;
  if (service) {
    log += ` [${service}]`;
  }
  log += `: ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    log += ` ${JSON.stringify(metadata)}`;
  }
  
  return log;
});

export const createLogger = (level: string = 'info') => {
  return winston.createLogger({
    level,
    format: combine(
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      customFormat
    ),
    transports: [
      new winston.transports.Console({
        format: combine(
          colorize(),
          timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          customFormat
        )
      }),
      new winston.transports.File({ 
        filename: 'logs/gateway.log',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5
      }),
      new winston.transports.File({ 
        filename: 'logs/error.log', 
        level: 'error',
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5
      })
    ]
  });
};

export type Logger = ReturnType<typeof createLogger>;