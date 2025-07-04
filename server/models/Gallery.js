const mongoose = require('mongoose');

const gallerySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  image: {
    url: {
      type: String,
      required: true
    },
    publicId: {
      type: String
    }
  },
  category: {
    type: String,
    enum: ['tournaments', 'training', 'events', 'achievements', 'facilities', 'other'],
    default: 'other'
  },
  tags: [{
    type: String,
    trim: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  featured: {
    type: Boolean,
    default: false
  },
  order: {
    type: Number,
    default: 0
  },
  views: {
    type: Number,
    default: 0
  },
  dateAdded: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for better performance
gallerySchema.index({ isActive: 1, category: 1, featured: -1, order: 1 });
gallerySchema.index({ tags: 1 });

module.exports = mongoose.model('Gallery', gallerySchema);