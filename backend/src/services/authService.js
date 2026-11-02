import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

const BCRYPT_SALT_ROUNDS = 12;
const JWT_EXPIRES_IN = '7d';

/**
 * Generate a signed JWT for the authenticated user.
 */
const signToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
};

/**
 * Register a new user account.
 * - Validates uniqueness of email
 * - Hashes password with bcrypt cost 12
 * - Saves user and issues JWT
 */
export const register = async ({ name, email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();

  // Check if email already registered
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new AppError('Email is already registered', 409, [
      { field: 'email', message: 'Email is already registered' }
    ]);
  }

  // Hash password using cost factor 12
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: 'user'
  });

  const token = signToken(user._id, user.role);

  return { user, token };
};

/**
 * Authenticate existing user with email and password.
 * Uses identical 401 error message for wrong email and wrong password to prevent user enumeration.
 */
export const login = async ({ email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();

  // Explicitly select passwordHash as it is excluded by default in schema
  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new AppError('Invalid email or password', 401);
  }

  const token = signToken(user._id, user.role);

  return { user, token };
};

