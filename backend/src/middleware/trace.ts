import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const traceMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Check if trace ID exists in incoming headers, else generate one
  const traceId = (req.headers['x-trace-id'] as string) || uuidv4();
  
  // Expose on res.locals for internal route handlers/controllers
  res.locals.traceId = traceId;
  
  // Set in response header so clients receive it
  res.setHeader('X-Trace-ID', traceId);
  
  next();
};

export default traceMiddleware;
