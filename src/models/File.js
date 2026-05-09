// src/models/File.js
import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Book title is required'],
      trim: true,
      maxlength: 300,
    },
    description: {
      type: String,
      default: '',
      maxlength: 3000,
    },
    r2Key: {
      type: String,
      required: true,
      unique: true,
    },
    // Cover image stored in R2 (optional)
    coverImageKey: {
      type: String,
      default: null,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number, // bytes
      required: true,
    },
    price: {
      type: Number,
      default: 0, // 0 = free
    },
    discountPrice: {
      type: Number,
      default: null,
    },
    isOnSale: {
      type: Boolean,
      default: false,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    productType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductType',
      required: true,
    },
    language: {
      type: String,
      enum: ['ar', 'en', 'es', 'fr'],
      default: 'ar',
    },
    release_date: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Virtual: build a public-facing object with resolved cover URL placeholder
fileSchema.virtual('coverImageUrl').get(function () {
  // Resolved to a real presigned URL in the service layer
  return this.coverImageKey ? `r2://${this.coverImageKey}` : null;
});

const File = mongoose.model('File', fileSchema);
export default File;
