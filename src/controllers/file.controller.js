// src/controllers/file.controller.js
import * as fileService from '../services/file.service.js';

export const upload = async (req, res, next) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ status: 'error', message: 'No main file attached.' });
    }

    const mainFile  = req.files.file[0];
    const coverFile = req.files.cover ? req.files.cover[0] : null;

    const meta = {
      title: req.body.title,
      description: req.body.description || '',
      price: req.body.price ? Number(req.body.price) : 0,
      discountPrice: req.body.discountPrice ? Number(req.body.discountPrice) : null,
      isOnSale: req.body.isOnSale === 'true' || req.body.isOnSale === true,
      category: req.body.category,
      productType: req.body.productType,
      language: req.body.language || 'ar',
      release_date: req.body.release_date,
    };

    const file = await fileService.uploadFile(mainFile, coverFile, meta, req.user);
    res.status(201).json({ status: 'success', data: file });
  } catch (err) {
    next(err);
  }
};

export const getDownloadLink = async (req, res, next) => {
  try {
    const result = await fileService.getDownloadLink(req.params.id, req.user);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const getCoverImageUrl = async (req, res, next) => {
  try {
    const result = await fileService.getCoverImageUrl(req.params.id);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const getFileById = async (req, res, next) => {
  try {
    const result = await fileService.getFileById(req.params.id, req.user);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const deleteFile = async (req, res, next) => {
  try {
    const result = await fileService.deleteFile(req.params.id, req.user);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const getFiles = async (req, res, next) => {
  try {
    const query = {};
    if (req.query.owner) query.owner = req.query.owner;
    if (req.query.category) query.category = req.query.category;
    if (req.query.productType) query.productType = req.query.productType;

    // Visibility filtering
    if (req.user && req.user.role === 'admin') {
      if (req.query.isHidden !== undefined) {
        query.isHidden = req.query.isHidden === 'true';
      }
    } else {
      query.isHidden = { $ne: true };
    }
    
    // Language filtering: 'ar' includes documents with no language set
    if (req.query.language) {
      if (req.query.language === 'ar') {
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { language: 'ar' },
            { language: { $exists: false } },
            { language: null }
          ]
        });
      } else {
        query.language = req.query.language;
      }
    }

    if (req.query.isOnSale !== undefined) query.isOnSale = req.query.isOnSale === 'true';
    
    if (req.query.q) {
      const searchQuery = {
        $or: [
          { title: { $regex: req.query.q, $options: 'i' } },
          { description: { $regex: req.query.q, $options: 'i' } }
        ]
      };
      if (query.$and) {
        query.$and.push(searchQuery);
      } else {
        query.$or = searchQuery.$or;
      }
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;

    const result = await fileService.getFiles(query, page, limit);
    res.status(200).json({ 
      status: 'success', 
      data: result.files,
      pagination: result.pagination
    });
  } catch (err) {
    next(err);
  }
};

export const getOnSaleFiles = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const query = { isOnSale: true };

    // Visibility filtering (same logic as getFiles)
    if (req.user && req.user.role === 'admin') {
      if (req.query.isHidden !== undefined) {
        query.isHidden = req.query.isHidden === 'true';
      }
    } else {
      query.isHidden = { $ne: true };
    }

    if (req.query.language) {
      if (req.query.language === 'ar') {
        query.$or = [
          { language: 'ar' },
          { language: { $exists: false } },
          { language: null }
        ];
      } else {
        query.language = req.query.language;
      }
    }

    const result = await fileService.getFiles(query, page, limit);
    res.status(200).json({ 
      status: 'success', 
      data: result.files,
      pagination: result.pagination
    });
  } catch (err) {
    next(err);
  }
};

export const getTrending = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const language = req.query.language;
    const files = await fileService.getTrendingFiles(limit, language);
    res.status(200).json({ status: 'success', data: files });
  } catch (err) {
    next(err);
  }
};

export const getPopular = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const language = req.query.language;
    const files = await fileService.getPopularFiles(limit, language);
    res.status(200).json({ status: 'success', data: files });
  } catch (err) {
    next(err);
  }
};

export const getLatestReleases = async (req, res, next) => {
  try {
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 12;
    const language = req.query.language;

    // Validation: page and limit must be positive numbers
    if (page < 1) page = 1;
    if (limit < 1) limit = 12;
    if (limit > 100) limit = 100;

    const result = await fileService.getLatestReleases(page, limit, language);
    res.status(200).json({
      status: 'success',
      data: result.files,
      pagination: {
        totalItems: result.pagination.totalResults,
        totalPages: result.pagination.totalPages,
        currentPage: result.pagination.currentPage,
        itemsPerPage: result.pagination.limit
      }
    });
  } catch (err) {
    console.error(`❌ [Database Error] Failed to fetch latest releases: ${err.message}`);
    next(err);
  }
};

export const updateFile = async (req, res, next) => {
  try {
    const mainFile  = req.files?.file ? req.files.file[0] : null;
    const coverFile = req.files?.cover ? req.files.cover[0] : null;

    const result = await fileService.updateFile(req.params.id, req.user, req.body, mainFile, coverFile);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const updateVisibility = async (req, res, next) => {
  try {
    const { isHidden } = req.body;
    const result = await fileService.updateFileVisibility(req.params.id, isHidden);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

