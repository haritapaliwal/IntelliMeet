import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const { method, originalUrl } = req;

  // Wait for request to finish to log response status code
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const traceId = res.locals.traceId || 'unknown';

    const logPayload = {
      traceId,
      method,
      path: originalUrl,
      status,
      durationMs: duration,
    };

    const message = `${method} ${originalUrl} ${status} - ${duration}ms`;

    if (status >= 500) {
      logger.error(message, logPayload);
    } else if (status >= 400) {
      logger.warn(message, logPayload);
    } else {
      logger.info(message, logPayload);
    }
  });

  next();
};

export default requestLogger;
