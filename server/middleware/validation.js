const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Validation errors:', errors.array());
    console.log('Request body:', req.body);
    return res.status(400).json({
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

const validateLogin = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  handleValidationErrors
];

const validateTestimonial = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('designation')
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('Designation must be between 2 and 150 characters'),
  body('content')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Content must be between 10 and 1000 characters'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  handleValidationErrors
];

const validateGallery = [
  body('title')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Title must be between 2 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('category')
    .optional()
    .isIn(['tournaments', 'training', 'events', 'achievements', 'facilities', 'other'])
    .withMessage('Invalid category'),
  handleValidationErrors
];

const validateContact = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('subject')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Subject must be between 2 and 200 characters'),
  body('message')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Message must be between 10 and 2000 characters'),
  body('phone')
    .optional()
    .trim()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  handleValidationErrors
];

const validateStudent = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('phone')
    .trim()
    .isLength({ min: 10, max: 15 })
    .matches(/^[0-9+\-\s\(\)]+$/)
    .withMessage('Please provide a valid phone number (10-15 digits)')
    .custom((value) => {
      // Remove all non-digit characters and check if we have at least 10 digits
      const digitsOnly = value.replace(/\D/g, '');
      if (digitsOnly.length < 10) {
        throw new Error('Phone number must contain at least 10 digits');
      }
      return true;
    }),
  body('age')
    .optional({ nullable: true })
    .isInt({ min: 4, max: 100 })
    .withMessage('Age must be between 4 and 100'),
  body('experience')
    .optional({ checkFalsy: true })
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Invalid experience level'),
  body('courseType')
    .optional()
    .isIn(['individual', 'group', 'online', 'hybrid', 'tournament'])
    .withMessage('Invalid course type'),
  handleValidationErrors
];

module.exports = {
  validateLogin,
  validateTestimonial,
  validateGallery,
  validateContact,
  validateStudent,
  handleValidationErrors
};