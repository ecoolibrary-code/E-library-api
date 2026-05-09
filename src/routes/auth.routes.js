// src/routes/auth.routes.js
import { Router } from 'express';
import { authLimiter } from '../middleware/rateLimiter.js';
import validate from '../middleware/validate.js';
import { registerSchema, loginSchema, registerAdminSchema } from '../validations/auth.validation.js';
import * as authController from '../controllers/auth.controller.js';
import passport from '../config/passport.js';
import verifyToken from '../middleware/auth.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const router = Router();

// --- Local Auth ---
router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/register-admin', authLimiter, validate(registerAdminSchema), authController.registerAdmin);

// --- Google OAuth ---
// Trigger: GET /api/v1/auth/google
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Callback: GET /api/v1/auth/google/callback
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  authController.googleCallback
);

// --- Authenticated User ---
router.get('/me', verifyToken, authController.getMe);

export default router;

