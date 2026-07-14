// src/middleware/auth.js
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Middleware: verify Bearer JWT token.
 * Attaches decoded payload to `req.user`.
 */
const verifyToken = (req, res, next) => {
  // ─── Skip auth for Public Hooks/Callbacks ───
  // BROAD CHECK: If URL contains paymob or webhook, it's public.
  const isPublic = req.originalUrl.toLowerCase().includes('paymob') || 
                   req.originalUrl.toLowerCase().includes('webhook');
  
  if (isPublic) {
    console.log(`🔓 [Auth Skip] Public access granted to: ${req.originalUrl}`);
    return next();
  }

  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = decoded; // { id, email, role, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired token.' });
  }
};

export const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ status: 'error', message: 'Forbidden: Admin access required.' });
  }
};

export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = decoded;
  } catch (err) {
    // Ignore invalid/expired tokens for optional authentication
  }
  next();
};

export default verifyToken;
