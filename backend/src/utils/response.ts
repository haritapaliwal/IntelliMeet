import { Response } from 'express';

export interface SuccessResponse<T = any> {
  traceId: string;
  success: true;
  data: T;
}

export interface ErrorResponseDetails {
  code: string;
  message: string;
  details?: any;
}

export interface ErrorResponse {
  traceId: string;
  success: false;
  error: ErrorResponseDetails;
}

/**
 * Sends a standardized success response.
 */
export const sendSuccess = <T>(res: Response, data: T, statusCode = 200) => {
  const traceId = (res.locals.traceId as string) || 'unknown';
  const responseBody: SuccessResponse<T> = {
    traceId,
    success: true,
    data,
  };
  return res.status(statusCode).json(responseBody);
};

/**
 * Sends a standardized error response.
 */
export const sendError = (
  res: Response,
  message: string,
  code = 'INTERNAL_SERVER_ERROR',
  statusCode = 500,
  details?: any
) => {
  const traceId = (res.locals.traceId as string) || 'unknown';
  const responseBody: ErrorResponse = {
    traceId,
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
  return res.status(statusCode).json(responseBody);
};
