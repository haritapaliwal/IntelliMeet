import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';
import logger from '../utils/logger';
import { ZodError } from 'zod';

/**
 * Custom Operational Error Class
 */
export class AppError extends Error {
  public statusCode: number;
  public errorCode: string;
  public details?: any;

  constructor(message: string, errorCode = 'INTERNAL_SERVER_ERROR', statusCode = 500, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Centralized Global Error Handler Middleware
 */
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const traceId = res.locals.traceId || 'unknown';
  
  // Log the complete error stack trace internally
  logger.error(`${err.message || 'Unhandled Error'}`, {
    traceId,
    method: req.method,
    path: req.originalUrl,
    stack: err.stack,
    details: err.details || null,
  });

  // 1. Handle Custom Operational AppError
  if (err instanceof AppError) {
    return sendError(res, err.message, err.errorCode, err.statusCode, err.details);
  }

  // 2. Handle Zod Validation Errors
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return sendError(res, 'Input validation failed', 'VALIDATION_ERROR', 400, details);
  }

  // 3. Handle JSON Body Parsing Errors
  if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
    return sendError(res, 'Malformed JSON payload', 'MALFORMED_REQUEST', 400);
  }

  // 4. Handle Mongoose Cast/Validation Errors
  if (err.name === 'ValidationError') {
    const details = Object.keys(err.errors).map((key) => ({
      field: key,
      message: err.errors[key].message,
    }));
    return sendError(res, 'Database validation failed', 'VALIDATION_ERROR', 400, details);
  }

  if (err.name === 'CastError') {
    return sendError(res, `Invalid ID format for ${err.path}`, 'INVALID_ID', 400);
  }

  // 5. Default Unhandled Error
  const message = process.env.NODE_ENV === 'production' 
    ? 'An unexpected internal server error occurred' 
    : err.message || 'Internal Server Error';
    
  return sendError(res, message, 'INTERNAL_SERVER_ERROR', 500);
};

export default errorHandler;
