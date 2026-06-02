import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppError } from '../middleware/error';
import User from '../models/User';
import { sendSuccess } from '../utils/response';

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_intellimeet_jwt_key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Zod Validation Schemas
const RegisterSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  name: z.string().min(1, 'Name is required'),
});

const LoginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Generate JWT token helper
 */
const generateToken = (userId: string, email: string, name: string): string => {
  return jwt.sign({ id: userId, email, name }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as any,
  });
};

/**
 * Register User Route Controller
 */
export const register = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // 1. Validate incoming JSON payload
    const parsedData = RegisterSchema.parse(req.body);

    // 2. Check if email already registered
    const existingUser = await User.findOne({ email: parsedData.email });
    if (existingUser) {
      throw new AppError('Email address is already in use', 'EMAIL_ALREADY_EXISTS', 400);
    }

    // 3. Create user
    const newUser = await User.create({
      email: parsedData.email,
      password: parsedData.password,
      name: parsedData.name,
    });

    // 4. Generate JWT
    const token = generateToken(newUser.id, newUser.email, newUser.name);

    // 5. Send standardized response
    return sendSuccess(res, {
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
      },
    }, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Login User Route Controller
 */
export const login = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // 1. Validate payload
    const parsedData = LoginSchema.parse(req.body);

    // 2. Find user including password
    const user = await User.findOne({ email: parsedData.email }).select('+password');
    if (!user) {
      throw new AppError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
    }

    // 3. Compare password
    const isPasswordMatch = await user.comparePassword(parsedData.password);
    if (!isPasswordMatch) {
      throw new AppError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
    }

    // 4. Generate JWT
    const token = generateToken(user.id, user.email, user.name);

    // 5. Send standardized response
    return sendSuccess(res, {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Current User profile Route Controller
 */
export const getMe = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not authenticated', 'UNAUTHORIZED', 401);
    }
    
    // Fetch fresh user data from DB (excluding password)
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      throw new AppError('User not found', 'USER_NOT_FOUND', 404);
    }

    return sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
};
