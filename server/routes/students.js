const express = require('express');
const Student = require('../models/Student');
const { auth } = require('../middleware/auth');
const { validateStudent } = require('../middleware/validation');
const { sendWelcomeEmail } = require('../utils/email');

const router = express.Router();

// @route   POST /api/students
// @desc    Register new student
// @access  Public
router.post('/', async (req, res) => {
  console.log('=== STUDENT REGISTRATION REQUEST ===');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('Raw body type:', typeof req.body);
  console.log('Body keys:', Object.keys(req.body));
  console.log('=== END REQUEST DEBUG ===');
  
  try {
    console.log('Student registration request received:', req.body);
    const studentData = req.body;

    // Check if student already exists
    const existingStudent = await Student.findOne({
      $or: [
        { email: studentData.email },
        { phone: studentData.phone }
      ]
    });

    if (existingStudent) {
      return res.status(400).json({ 
        message: 'Student with this email or phone number already exists' 
      });
    }

    const student = new Student(studentData);
    await student.save();

    // Send welcome email
    try {
      await sendWelcomeEmail(student);
    } catch (emailError) {
      console.error('Welcome email sending failed:', emailError);
      // Continue with the response even if email fails
    }

    res.status(201).json({
      message: 'Registration successful! We will contact you soon.',
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        phone: student.phone,
        status: student.status,
        createdAt: student.createdAt
      }
    });
  } catch (error) {
    console.error('Student registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/students
// @desc    Get all students
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, experience, courseType } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { parentName: { $regex: search, $options: 'i' } }
      ];
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (experience && experience !== 'all') {
      query.experience = experience;
    }

    if (courseType && courseType !== 'all') {
      query.courseType = courseType;
    }

    const students = await Student.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Student.countDocuments(query);

    // Get statistics
    const stats = await Student.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      students,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
      stats: stats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/students/:id
// @desc    Get student by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json(student);
  } catch (error) {
    console.error('Get student error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/students/:id
// @desc    Update student
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const studentData = req.body;

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check if email/phone is already taken by another student
    if (studentData.email && studentData.email !== student.email) {
      const existingStudent = await Student.findOne({ 
        email: studentData.email, 
        _id: { $ne: student._id } 
      });
      if (existingStudent) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    if (studentData.phone && studentData.phone !== student.phone) {
      const existingStudent = await Student.findOne({ 
        phone: studentData.phone, 
        _id: { $ne: student._id } 
      });
      if (existingStudent) {
        return res.status(400).json({ message: 'Phone number already exists' });
      }
    }

    // Update enrollment date if status changes to enrolled
    if (studentData.status === 'enrolled' && student.status !== 'enrolled') {
      studentData.enrollmentDate = new Date();
    }

    const updatedStudent = await Student.findByIdAndUpdate(
      req.params.id,
      studentData,
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Student updated successfully',
      student: updatedStudent
    });
  } catch (error) {
    console.error('Update student error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/students/:id
// @desc    Delete student
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    await Student.findByIdAndDelete(req.params.id);

    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/students/stats/dashboard
// @desc    Get dashboard statistics
// @access  Private
router.get('/stats/dashboard', auth, async (req, res) => {
  try {
    const totalStudents = await Student.countDocuments();
    const activeStudents = await Student.countDocuments({ status: 'active' });
    const newInquiries = await Student.countDocuments({ status: 'inquiry' });
    const trialStudents = await Student.countDocuments({ status: 'trial' });

    // Get monthly registrations
    const monthlyRegistrations = await Student.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(new Date().getFullYear(), 0, 1) }
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

    // Get experience level distribution
    const experienceDistribution = await Student.aggregate([
      {
        $group: {
          _id: '$experience',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get course type distribution
    const courseTypeDistribution = await Student.aggregate([
      {
        $group: {
          _id: '$courseType',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      totalStudents,
      activeStudents,
      newInquiries,
      trialStudents,
      monthlyRegistrations,
      experienceDistribution,
      courseTypeDistribution
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;