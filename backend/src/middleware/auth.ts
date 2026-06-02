import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './error';
import User from '../models/User';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

interface JwtPayload {
  id: string;
  email: string;
  name: string;
}

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // 1. Extract the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication token is missing', 'UNAUTHORIZED', 401);
    }

    // 2. Extract and verify token
    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET || 'supersecret_intellimeet_jwt_key';

    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, jwtSecret) as JwtPayload;
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        throw new AppError('Authentication token has expired', 'TOKEN_EXPIRED', 401);
      }
      throw new AppError('Authentication token is invalid', 'UNAUTHORIZED', 401);
    }

    // 3. Optional: Verify user still exists in DB
    const userExists = await User.findById(decoded.id).select('_id email name');
    if (!userExists) {
      throw new AppError('User belonging to this token no longer exists', 'USER_NOT_FOUND', 401);
    }

    // 4. Attach decoded token user payload to request object
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export default authMiddleware;
