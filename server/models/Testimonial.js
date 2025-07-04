const mongoose = require('mongoose');

const testimonialSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  designation: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    default: 5
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
  dateAdded: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for better performance
testimonialSchema.index({ isActive: 1, featured: -1, order: 1 });

module.exports = mongoose.model('Testimonial', testimonialSchema);