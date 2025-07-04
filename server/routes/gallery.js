const express = require('express');
const Gallery = require('../models/Gallery');
const { auth } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const { validateGallery } = require('../middleware/validation');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');

const router = express.Router();

// @route   GET /api/gallery
// @desc    Get all gallery images (public)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 12, category, featured } = req.query;
    const query = { isActive: true };
    
    if (category && category !== 'all') {
      query.category = category;
    }

    if (featured === 'true') {
      query.featured = true;
    }

    const images = await Gallery.find(query)
      .sort({ featured: -1, order: 1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Gallery.countDocuments(query);

    res.json({
      images,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get gallery error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/gallery/categories
// @desc    Get all categories
// @access  Public
router.get('/categories', async (req, res) => {
  try {
    const categories = await Gallery.distinct('category', { isActive: true });
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/gallery/admin
// @desc    Get all gallery images for admin
// @access  Private
router.get('/admin', auth, async (req, res) => {
  try {
    const { page = 1, limit = 12, search, category, status } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    if (category && category !== 'all') {
      query.category = category;
    }

    if (status) {
      query.isActive = status === 'active';
    }

    const images = await Gallery.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Gallery.countDocuments(query);

    res.json({
      images,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get admin gallery error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/gallery
// @desc    Create new gallery image
// @access  Private
router.post('/', auth, upload.single('image'), handleUploadError, validateGallery, async (req, res) => {
  try {
    const { title, description, category, tags, featured, order } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'Image is required' });
    }

    // Upload image to Cloudinary
    const imageResult = await uploadToCloudinary(req.file.path, 'gallery');

    const galleryImage = new Gallery({
      title,
      description,
      category: category || 'other',
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      image: {
        url: imageResult.url,
        publicId: imageResult.publicId
      },
      featured: featured === 'true',
      order: parseInt(order) || 0
    });

    await galleryImage.save();

    res.status(201).json({
      message: 'Gallery image created successfully',
      image: galleryImage
    });
  } catch (error) {
    console.error('Create gallery image error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/gallery/:id
// @desc    Update gallery image
// @access  Private
router.put('/:id', auth, upload.single('image'), handleUploadError, async (req, res) => {
  try {
    const { title, description, category, tags, featured, order, isActive } = req.body;

    const galleryImage = await Gallery.findById(req.params.id);
    if (!galleryImage) {
      return res.status(404).json({ message: 'Gallery image not found' });
    }

    // Update fields
    if (title) galleryImage.title = title;
    if (description !== undefined) galleryImage.description = description;
    if (category) galleryImage.category = category;
    if (tags !== undefined) galleryImage.tags = tags ? tags.split(',').map(tag => tag.trim()) : [];
    if (featured !== undefined) galleryImage.featured = featured === 'true';
    if (order !== undefined) galleryImage.order = parseInt(order);
    if (isActive !== undefined) galleryImage.isActive = isActive === 'true';

    // Handle image update
    if (req.file) {
      // Delete old image from Cloudinary
      if (galleryImage.image.publicId) {
        await deleteFromCloudinary(galleryImage.image.publicId);
      }

      // Upload new image
      const imageResult = await uploadToCloudinary(req.file.path, 'gallery');
      galleryImage.image = {
        url: imageResult.url,
        publicId: imageResult.publicId
      };
    }

    await galleryImage.save();

    res.json({
      message: 'Gallery image updated successfully',
      image: galleryImage
    });
  } catch (error) {
    console.error('Update gallery image error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/gallery/:id
// @desc    Delete gallery image
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const galleryImage = await Gallery.findById(req.params.id);
    if (!galleryImage) {
      return res.status(404).json({ message: 'Gallery image not found' });
    }

    // Delete image from Cloudinary
    if (galleryImage.image.publicId) {
      await deleteFromCloudinary(galleryImage.image.publicId);
    }

    await Gallery.findByIdAndDelete(req.params.id);

    res.json({ message: 'Gallery image deleted successfully' });
  } catch (error) {
    console.error('Delete gallery image error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/gallery/:id/view
// @desc    Increment view count
// @access  Public
router.put('/:id/view', async (req, res) => {
  try {
    const galleryImage = await Gallery.findById(req.params.id);
    if (!galleryImage) {
      return res.status(404).json({ message: 'Gallery image not found' });
    }

    galleryImage.views += 1;
    await galleryImage.save();

    res.json({ message: 'View count updated' });
  } catch (error) {
    console.error('Update view count error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/gallery/:id
// @desc    Get gallery image by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const galleryImage = await Gallery.findById(req.params.id);
    if (!galleryImage) {
      return res.status(404).json({ message: 'Gallery image not found' });
    }

    res.json(galleryImage);
  } catch (error) {
    console.error('Get gallery image error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;