// src/routes/file.routes.js
import { Router } from 'express';
import multer from 'multer';
import auth, { isAdmin, optionalAuth } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { uploadMetaSchema, updateFileSchema, toggleVisibilitySchema } from '../validations/file.validation.js';
import * as fileController from '../controllers/file.controller.js';

// Memory storage — files stream directly to R2 without touching disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per file
});

const router = Router();

// ─── Public Routes ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/files
 * List all available books in the store.
 */
router.get('/', optionalAuth, fileController.getFiles);
router.get('/on-sale', optionalAuth, fileController.getOnSaleFiles);
router.get('/trending', optionalAuth, fileController.getTrending);
router.get('/popular', optionalAuth, fileController.getPopular);
router.get('/latest', optionalAuth, fileController.getLatestReleases);
router.get('/:id', optionalAuth, fileController.getFileById);

/**
 * GET /api/v1/files/:id/cover-url
 * Returns a presigned URL for the book's cover image.
 */
router.get('/:id/cover-url', optionalAuth, fileController.getCoverImageUrl);

// ─── Protected Routes (JWT Required) ─────────────────────────────────────────

router.use(auth);

/**
 * GET /api/v1/files/:id/download-link
 * Returns a secure, expiring presigned URL to download the main file.
 */
router.get('/:id/download-link', fileController.getDownloadLink);

// ─── Admin-Only Routes ──────────────────────────────────────────────────────

router.use(isAdmin);

/**
 * POST /api/v1/files/upload
 * Fields: 'file' (required), 'cover' (optional)
 * Body: title, description, price
 */
router.post(
  '/upload',
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ]),
  validate(uploadMetaSchema),
  fileController.upload
);

// PATCH /api/v1/files/:id — update file metadata and/or binary objects
router.patch(
  '/:id',
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ]),
  validate(updateFileSchema),
  fileController.updateFile
);

// PATCH /api/v1/files/:id/visibility — toggle book visibility (archive)
router.patch(
  '/:id/visibility',
  validate(toggleVisibilitySchema),
  fileController.updateVisibility
);

/**
 * DELETE /api/v1/files/:id
 * Removes file metadata from DB and objects from R2 storage.
 */
router.delete('/:id', fileController.deleteFile);

export default router;
