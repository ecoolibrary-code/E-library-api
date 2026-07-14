// src/routes/admin.routes.js
import { Router } from 'express';
import verifyToken, { isAdmin } from '../middleware/auth.js';
import * as adminController from '../controllers/admin.controller.js';

const router = Router();

// 🔐 Admin Revenue Report
router.get('/revenue', verifyToken, isAdmin, adminController.getRevenueReport);

// 🔐 Dashboard Summary (KPIs)
router.get('/dashboard', verifyToken, isAdmin, adminController.getDashboardStats);

// 🔐 User Analytics & Growth
router.get('/stats/users', verifyToken, isAdmin, adminController.getUserStats);

// 🔐 Top Selling Products
router.get('/stats/books', verifyToken, isAdmin, adminController.getTopBooks);

// 🔐 Advanced BI Insights
router.get('/stats/advanced', verifyToken, isAdmin, adminController.getAdvancedStats);

export default router;
