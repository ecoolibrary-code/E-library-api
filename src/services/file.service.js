// src/services/file.service.js
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import r2Client from '../config/r2.js';
import { env } from '../config/env.js';
import File from '../models/File.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const pushToR2 = async (buffer, key, mimeType) => {
  console.log(`📡 [R2 DEBUG] Uploading to: ${key} (${mimeType})`);
  await r2Client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );
};

const buildPresignedUrl = (key, filename, expiresIn) => {
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ...(filename && { ResponseContentDisposition: `attachment; filename="${filename}"` }),
  });
  return getSignedUrl(r2Client, command, { expiresIn });
};

const removeFromR2 = async (key) => {
  if (!key) return;
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    })
  );
};

/**
 * Format a file document for API responses.
 * Ensures prices are converted from cents to units and cover URLs are resolved.
 */
export const formatFileResponse = async (file) => {
  if (!file) return null;
  
  // If it's a Mongoose document, we might want to populate it if not already
  // But usually, it's already populated before calling this.
  
  let coverUrl = null;
  if (file.coverImageKey) {
    const result = await getCoverImageUrl(file);
    coverUrl = result.url;
  }

  return {
    id: file._id,
    title: file.title,
    description: file.description,
    price: file.price / 100,
    discountPrice: file.discountPrice !== null ? file.discountPrice / 100 : null,
    isOnSale: file.isOnSale,
    coverUrl,
    category: file.category,
    productType: file.productType,
    language: file.language,
    release_date: file.release_date,
    size: file.size,
    mimeType: file.mimeType,
    isHidden: file.isHidden || false,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Upload the main file + optional cover image to R2, save metadata to MongoDB.
 *
 * @param {{ buffer, originalname, mimetype, size }} fileObj    - multer file (main content)
 * @param {{ buffer, originalname, mimetype } | null} coverObj  - multer file (cover image, optional)
 * @param {{ description?: string, price?: number }} meta       - extra metadata
 * @param {string} ownerId
 */
export const uploadFile = async (fileObj, coverObj, meta, user) => {
  const ownerId = user.id || user._id;
  console.log(`📡 [R2 DEBUG] Using bucket: [${env.R2_BUCKET_NAME}]`);

  // ── Main file ──
  const ext = fileObj.originalname.split('.').pop();
  const r2Key = `uploads/${ownerId}/${randomUUID()}.${ext}`;
  await pushToR2(fileObj.buffer, r2Key, fileObj.mimetype);

  // ── Cover image (optional) ──
  let coverImageKey = null;
  if (coverObj) {
    const imgExt = coverObj.originalname.split('.').pop();
    coverImageKey = `covers/${ownerId}/${randomUUID()}.${imgExt}`;
    await pushToR2(coverObj.buffer, coverImageKey, coverObj.mimetype);
  }

  const file = await File.create({
    owner: ownerId,
    title: meta.title,
    originalName: fileObj.originalname,
    description: meta.description || '',
    price: (meta.price ? Number(meta.price) * 100 : 0),
    discountPrice: (meta.discountPrice ? Number(meta.discountPrice) * 100 : null),
    isOnSale: meta.isOnSale === 'true' || meta.isOnSale === true,
    category: meta.category,
    productType: meta.productType,
    release_date: meta.release_date || null,
    r2Key,
    coverImageKey,
    mimeType: fileObj.mimetype,
    size: fileObj.size,
  });

  const populatedFile = await file.populate(['category', 'productType']);
  return await formatFileResponse(populatedFile);
};

/**
 * Update file metadata and/or actual files.
 * If a new main file or cover is provided, we upload new and delete old from R2.
 */
export const updateFile = async (fileId, user, updates, fileObj = null, coverObj = null) => {
  const file = await File.findById(fileId);
  const requesterId = user.id || user._id;

  if (!file) {
    const err = new Error('File not found.');
    err.statusCode = 404;
    throw err;
  }

  // Ownership Check
  if (file.owner.toString() !== requesterId && user.role !== 'admin') {
    const err = new Error('Forbidden: you do not own this file.');
    err.statusCode = 403;
    throw err;
  }

  // 1. New Main File
  if (fileObj) {
    const ext = fileObj.originalname.split('.').pop();
    const newR2Key = `uploads/${requesterId}/${randomUUID()}.${ext}`;
    await pushToR2(fileObj.buffer, newR2Key, fileObj.mimetype);
    await removeFromR2(file.r2Key); // Clean up old
    file.r2Key = newR2Key;
    file.originalName = fileObj.originalname;
  }

  // 2. New Cover
  if (coverObj) {
    const ext = coverObj.originalname.split('.').pop();
    const newCoverKey = `covers/${requesterId}/${randomUUID()}.${ext}`;
    await pushToR2(coverObj.buffer, newCoverKey, coverObj.mimetype);
    if (file.coverImageKey) {
      await removeFromR2(file.coverImageKey); // Clean up old
    }
    file.coverImageKey = newCoverKey;
  }

  // 3. Metadata
  if (updates.title !== undefined) file.title = updates.title;
  if (updates.description !== undefined) file.description = updates.description;
  if (updates.price !== undefined) file.price = Math.round(Number(updates.price) * 100);
  if (updates.discountPrice !== undefined) file.discountPrice = updates.discountPrice ? Math.round(Number(updates.discountPrice) * 100) : null;
  if (updates.isOnSale !== undefined) file.isOnSale = updates.isOnSale === 'true' || updates.isOnSale === true;
  if (updates.category !== undefined) file.category = updates.category;
  if (updates.productType !== undefined) file.productType = updates.productType;
  if (updates.language !== undefined) file.language = updates.language;
  if (updates.release_date !== undefined) file.release_date = updates.release_date || null;
  if (updates.isHidden !== undefined) file.isHidden = updates.isHidden === 'true' || updates.isHidden === true;

  await file.save();
  const populatedFile = await file.populate(['category', 'productType']);
  return await formatFileResponse(populatedFile);
};

/**
 * Generate a temporary pre-signed download URL for a file.
 */
export const getDownloadLink = async (fileId, user) => {
  const requesterId = user.id || user._id;
  const file = await File.findById(fileId);
  if (!file) {
    const err = new Error('File not found.');
    err.statusCode = 404;
    throw err;
  }

  // Check if user is the owner OR has a successful payment for this file
  const payment = await Payment.findOne({
    user: requesterId,
    book: fileId,
    status: 'succeeded'
  });

  if (file.owner.toString() !== requesterId && user.role !== 'admin' && !payment) {
    const err = new Error('Forbidden: you do not have access to download this file. Please purchase it first.');
    err.statusCode = 403;
    throw err;
  }

  // One-time download enforcement for normal users
  if (user.role !== 'admin' && file.owner.toString() !== requesterId) {
    if (payment.isDownloaded && payment.downloadExpiry && new Date() > payment.downloadExpiry) {
      const err = new Error('This book has already been downloaded and the temporary access window has expired.');
      err.statusCode = 403;
      throw err;
    }

    // Mark as downloaded if it's the first time
    if (!payment.isDownloaded) {
      console.log(`📝 [DOWNLOAD TRACKER] Marking book ${fileId} as downloaded for user ${requesterId}`);
      payment.isDownloaded = true;
      payment.downloadExpiry = new Date(Date.now() + env.DOWNLOAD_LINK_EXPIRY_SECONDS * 1000);
      await payment.save();
      console.log(`✅ [DOWNLOAD TRACKER] Payment status persistent in DB.`);
    } else {
      console.log(`ℹ️ [DOWNLOAD TRACKER] User ${requesterId} re-requested link for book ${fileId}. Expiry: ${payment.downloadExpiry}`);
    }
  }

  const url = await buildPresignedUrl(file.r2Key, file.originalName, env.DOWNLOAD_LINK_EXPIRY_SECONDS);

  return {
    url,
    expiresIn: env.DOWNLOAD_LINK_EXPIRY_SECONDS,
    expiresAt: payment?.downloadExpiry || new Date(Date.now() + env.DOWNLOAD_LINK_EXPIRY_SECONDS * 1000),
    serverTime: new Date(),
    isDownloaded: payment?.isDownloaded || false
  };
};

/**
 * Returns the URL for a cover image. 
 * If R2_PUBLIC_URL is set, it returns a permanent public link.
 * Otherwise, it falls back to a long-lived signed URL (24 hours).
 *
 * Optimization: Pass the full file document/object to avoid extra DB query (N+1 fix).
 */
export const getCoverImageUrl = async (fileOrId) => {
  let file;
  if (fileOrId && typeof fileOrId === 'object' && fileOrId.coverImageKey !== undefined) {
    file = fileOrId;
  } else {
    file = await File.findById(fileOrId);
  }

  if (!file || !file.coverImageKey) {
    return { url: null };
  }

  // If we have a public domain, use it for a permanent link
  if (env.R2_PUBLIC_URL) {
    const publicBase = env.R2_PUBLIC_URL.endsWith('/') ? env.R2_PUBLIC_URL : `${env.R2_PUBLIC_URL}/`;
    return { url: `${publicBase}${file.coverImageKey}` };
  }

  // Fallback: 7-day signed URL (604,800 seconds)
  const SECONDS_IN_WEEK = 7 * 24 * 60 * 60;
  const url = await buildPresignedUrl(file.coverImageKey, null, SECONDS_IN_WEEK);
  return { url, expiresIn: SECONDS_IN_WEEK };
};

/**
 * Fetch a single file by ID (fully populated).
 */
export const getFileById = async (fileId, user = null) => {
  const file = await File.findById(fileId).populate(['category', 'productType']);
  if (!file) {
    const err = new Error('File not found.');
    err.statusCode = 404;
    throw err;
  }

  if (file.isHidden && (!user || user.role !== 'admin')) {
    const err = new Error('File not found.');
    err.statusCode = 404;
    throw err;
  }

  return await formatFileResponse(file);
};

/**
 * Delete a file record from MongoDB and its objects from R2.
 *
 * @param {string} fileId
 * @param {string} requesterId
 */
export const deleteFile = async (fileId, user) => {
  const requesterId = user.id || user._id;
  const file = await File.findById(fileId);

  if (!file) {
    const err = new Error('File not found.');
    err.statusCode = 404;
    throw err;
  }

  // Ownership check
  if (file.owner.toString() !== requesterId && user.role !== 'admin') {
    const err = new Error('Forbidden: you do not own this file.');
    err.statusCode = 403;
    throw err;
  }

  // 1. Delete from R2
  await removeFromR2(file.r2Key);
  await removeFromR2(file.coverImageKey);

  // 2. Delete from MongoDB
  await file.deleteOne();

  return { message: 'File deleted successfully' };
};

/**
 * List all files (with pagination and optional filters).
 */
export const getFiles = async (query = {}, page = 1, limit = 12) => {
  const skip = (page - 1) * limit;

  // 1. Get total results count for metadata
  const totalResults = await File.countDocuments(query);
  const totalPages = Math.ceil(totalResults / limit);

  // 2. Fetch the paginated files
  const files = await File.find(query)
    .populate(['category', 'productType'])
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // 3. Resolve cover URLs and build response objects
  const resolvedFiles = await Promise.all(
    files.map(async (f) => {
      return await formatFileResponse(f);
    })
  );

  return {
    files: resolvedFiles,
    pagination: {
      totalResults,
      totalPages,
      currentPage: page,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    }
  };
};

/**
 * Get latest releases (Sorted by release_date DESC, excluding future dates)
 */
export const getLatestReleases = async (page = 1, limit = 12, language = null) => {
  const skip = (page - 1) * limit;
  const now = new Date();

  const query = {
    release_date: { $ne: null, $lte: now },
    isHidden: { $ne: true }
  };
  if (language) {
    if (language === 'ar') {
      query.$and = [{
        $or: [
          { language: 'ar' },
          { language: { $exists: false } },
          { language: null }
        ]
      }];
    } else {
      query.language = language;
    }
  }

  const totalResults = await File.countDocuments(query);
  const totalPages = Math.ceil(totalResults / limit);

  const files = await File.find(query)
    .populate(['category', 'productType'])
    .sort({ release_date: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const resolvedFiles = await Promise.all(
    files.map(async (f) => {
      return await formatFileResponse(f);
    })
  );

  return {
    files: resolvedFiles,
    pagination: {
      totalResults,
      totalPages,
      currentPage: page,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    }
  };
};

/**
 * Get most sold books (Trending)
 */
export const getTrendingFiles = async (limit = 10, language = null) => {
  const trending = await Payment.aggregate([
    { $match: { status: 'succeeded' } },
    { $group: { _id: '$book', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit * 2 } // Get more to allow for language filtering if needed
  ]);

  const fileIds = trending.map(t => t._id);
  const query = { _id: { $in: fileIds }, isHidden: { $ne: true } };
  if (language) {
    if (language === 'ar') {
      query.$or = [
        { language: 'ar' },
        { language: { $exists: false } },
        { language: null }
      ];
    } else {
      query.language = language;
    }
  }

  const files = await File.find(query)
    .populate(['category', 'productType'])
    .limit(limit)
    .lean();

  // Maintain order as much as possible, but filtered by language
  const orderedFiles = fileIds
    .map(id => files.find(f => f._id.toString() === id.toString()))
    .filter(Boolean)
    .slice(0, limit);

  return await Promise.all(orderedFiles.map(async (f) => {
    return await formatFileResponse(f);
  }));
};

/**
 * Get most favorited books (Popular)
 */
export const getPopularFiles = async (limit = 10, language = null) => {
  const popular = await User.aggregate([
    { $unwind: '$favorites' },
    { $group: { _id: '$favorites', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit * 2 } // Get more to allow for language filtering if needed
  ]);

  const fileIds = popular.map(p => p._id);
  const query = { _id: { $in: fileIds }, isHidden: { $ne: true } };
  if (language) {
    if (language === 'ar') {
      query.$or = [
        { language: 'ar' },
        { language: { $exists: false } },
        { language: null }
      ];
    } else {
      query.language = language;
    }
  }

  const files = await File.find(query)
    .populate(['category', 'productType'])
    .limit(limit)
    .lean();

  const orderedFiles = fileIds
    .map(id => files.find(f => f._id.toString() === id.toString()))
    .filter(Boolean)
    .slice(0, limit);

  return await Promise.all(orderedFiles.map(async (f) => {
    return await formatFileResponse(f);
  }));
};

/**
 * Toggle or set file visibility (Admin only)
 */
export const updateFileVisibility = async (fileId, isHidden) => {
  const file = await File.findById(fileId);
  if (!file) {
    const err = new Error('File not found.');
    err.statusCode = 404;
    throw err;
  }

  file.isHidden = isHidden;
  await file.save();

  const populatedFile = await file.populate(['category', 'productType']);
  return await formatFileResponse(populatedFile);
};
