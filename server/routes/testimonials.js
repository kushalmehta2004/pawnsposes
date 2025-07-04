const express = require('express');
const Testimonial = require('../models/Testimonial');
const { auth } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const { validateTestimonial } = require('../middleware/validation');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');

const router = express.Router();

// @route   GET /api/testimonials
// @desc    Get all testimonials (public)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, featured } = req.query;
    const query = { isActive: true };
    
    if (featured === 'true') {
      query.featured = true;
    }

    const testimonials = await Testimonial.find(query)
      .sort({ featured: -1, order: 1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Testimonial.countDocuments(query);

    res.json({
      testimonials,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get testimonials error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/testimonials/admin
// @desc    Get all testimonials for admin
// @access  Private
router.get('/admin', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { designation: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) {
      query.isActive = status === 'active';
    }

    const testimonials = await Testimonial.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Testimonial.countDocuments(query);

    res.json({
      testimonials,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get admin testimonials error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/testimonials
// @desc    Create new testimonial
// @access  Private
router.post('/', auth, upload.single('image'), handleUploadError, validateTestimonial, async (req, res) => {
  try {
    const { name, designation, content, rating, featured, order } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'Image is required' });
    }

    // Upload image to Cloudinary
    const imageResult = await uploadToCloudinary(req.file.path, 'testimonials');

    const testimonial = new Testimonial({
      name,
      designation,
      content,
      rating: parseInt(rating),
      image: {
        url: imageResult.url,
        publicId: imageResult.publicId
      },
      featured: featured === 'true',
      order: parseInt(order) || 0
    });

    await testimonial.save();

    res.status(201).json({
      message: 'Testimonial created successfully',
      testimonial
    });
  } catch (error) {
    console.error('Create testimonial error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/testimonials/:id
// @desc    Update testimonial
// @access  Private
router.put('/:id', auth, upload.single('image'), handleUploadError, async (req, res) => {
  try {
    const { name, designation, content, rating, featured, order, isActive } = req.body;

    const testimonial = await Testimonial.findById(req.params.id);
    if (!testimonial) {
      return res.status(404).json({ message: 'Testimonial not found' });
    }

    // Update fields
    if (name) testimonial.name = name;
    if (designation) testimonial.designation = designation;
    if (content) testimonial.content = content;
    if (rating) testimonial.rating = parseInt(rating);
    if (featured !== undefined) testimonial.featured = featured === 'true';
    if (order !== undefined) testimonial.order = parseInt(order);
    if (isActive !== undefined) testimonial.isActive = isActive === 'true';

    // Handle image update
    if (req.file) {
      // Delete old image from Cloudinary
      if (testimonial.image.publicId) {
        await deleteFromCloudinary(testimonial.image.publicId);
      }

      // Upload new image
      const imageResult = await uploadToCloudinary(req.file.path, 'testimonials');
      testimonial.image = {
        url: imageResult.url,
        publicId: imageResult.publicId
      };
    }

    await testimonial.save();

    res.json({
      message: 'Testimonial updated successfully',
      testimonial
    });
  } catch (error) {
    console.error('Update testimonial error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/testimonials/:id
// @desc    Delete testimonial
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const testimonial = await Testimonial.findById(req.params.id);
    if (!testimonial) {
      return res.status(404).json({ message: 'Testimonial not found' });
    }

    // Delete image from Cloudinary
    if (testimonial.image.publicId) {
      await deleteFromCloudinary(testimonial.image.publicId);
    }

    await Testimonial.findByIdAndDelete(req.params.id);

    res.json({ message: 'Testimonial deleted successfully' });
  } catch (error) {
    console.error('Delete testimonial error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/testimonials/:id
// @desc    Get testimonial by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const testimonial = await Testimonial.findById(req.params.id);
    if (!testimonial) {
      return res.status(404).json({ message: 'Testimonial not found' });
    }

    res.json(testimonial);
  } catch (error) {
    console.error('Get testimonial error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;