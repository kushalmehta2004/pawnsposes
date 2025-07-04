const express = require('express');
const Admin = require('../models/Admin');
const Contact = require('../models/Contact');
const Student = require('../models/Student');
const Testimonial = require('../models/Testimonial');
const Gallery = require('../models/Gallery');
const { auth, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/admin/dashboard
// @desc    Get dashboard statistics
// @access  Private
router.get('/dashboard', auth, async (req, res) => {
  try {
    // Get counts
    const totalContacts = await Contact.countDocuments();
    const newContacts = await Contact.countDocuments({ status: 'new' });
    const totalStudents = await Student.countDocuments();
    const activeStudents = await Student.countDocuments({ status: 'active' });
    const totalTestimonials = await Testimonial.countDocuments();
    const totalGalleryImages = await Gallery.countDocuments();

    // Get recent activity
    const recentContacts = await Contact.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email subject createdAt status');

    const recentStudents = await Student.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email phone status createdAt');

    // Get monthly stats
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);

    const monthlyContacts = await Contact.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfYear }
        }
      },
      {
        $group: {
          _id: { $month: '$createdAt' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const monthlyStudents = await Student.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfYear }
        }
      },
      {
        $group: {
          _id: { $month: '$createdAt' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    res.json({
      stats: {
        totalContacts,
        newContacts,
        totalStudents,
        activeStudents,
        totalTestimonials,
        totalGalleryImages
      },
      recentActivity: {
        contacts: recentContacts,
        students: recentStudents
      },
      monthlyStats: {
        contacts: monthlyContacts,
        students: monthlyStudents
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/admin/admins
// @desc    Get all admins
// @access  Private (Super Admin only)
router.get('/admins', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) {
      query.isActive = status === 'active';
    }

    const admins = await Admin.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Admin.countDocuments(query);

    res.json({
      admins,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get admins error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/admin/admins
// @desc    Create new admin
// @access  Private (Super Admin only)
router.post('/admins', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Admin with this email already exists' });
    }

    const admin = new Admin({
      name,
      email,
      password,
      role: role || 'admin'
    });

    await admin.save();

    res.status(201).json({
      message: 'Admin created successfully',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive,
        createdAt: admin.createdAt
      }
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/admin/admins/:id
// @desc    Update admin
// @access  Private (Super Admin only)
router.put('/admins/:id', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { name, email, role, isActive } = req.body;

    const admin = await Admin.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Don't allow super admin to deactivate themselves
    if (admin._id.toString() === req.admin.id && isActive === false) {
      return res.status(400).json({ message: 'Cannot deactivate yourself' });
    }

    // Check if email is already taken
    if (email && email !== admin.email) {
      const existingAdmin = await Admin.findOne({ email, _id: { $ne: admin._id } });
      if (existingAdmin) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    // Update fields
    if (name) admin.name = name;
    if (email) admin.email = email;
    if (role) admin.role = role;
    if (isActive !== undefined) admin.isActive = isActive;

    await admin.save();

    res.json({
      message: 'Admin updated successfully',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive,
        lastLogin: admin.lastLogin,
        createdAt: admin.createdAt
      }
    });
  } catch (error) {
    console.error('Update admin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/admin/admins/:id
// @desc    Delete admin
// @access  Private (Super Admin only)
router.delete('/admins/:id', auth, requireSuperAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Don't allow super admin to delete themselves
    if (admin._id.toString() === req.admin.id) {
      return res.status(400).json({ message: 'Cannot delete yourself' });
    }

    await Admin.findByIdAndDelete(req.params.id);

    res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/admin/activity
// @desc    Get recent system activity
// @access  Private
router.get('/activity', auth, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    // Get recent contacts
    const recentContacts = await Contact.find()
      .sort({ createdAt: -1 })
      .limit(limit / 2)
      .select('name email subject createdAt status')
      .lean();

    // Get recent students
    const recentStudents = await Student.find()
      .sort({ createdAt: -1 })
      .limit(limit / 2)
      .select('name email phone status createdAt')
      .lean();

    // Combine and format activity
    const activities = [
      ...recentContacts.map(contact => ({
        type: 'contact',
        title: `New contact from ${contact.name}`,
        description: contact.subject,
        timestamp: contact.createdAt,
        status: contact.status,
        link: `/admin/contacts/${contact._id}`
      })),
      ...recentStudents.map(student => ({
        type: 'student',
        title: `New student registration: ${student.name}`,
        description: `Phone: ${student.phone}`,
        timestamp: student.createdAt,
        status: student.status,
        link: `/admin/students/${student._id}`
      }))
    ];

    // Sort by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      activities: activities.slice(0, limit)
    });
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;