const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  parentName: {
    type: String,
    trim: true,
    maxlength: 100
  },
  parentPhone: {
    type: String,
    trim: true
  },
  dateOfBirth: {
    type: Date
  },
  age: {
    type: Number,
    min: 4,
    max: 100
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String
  },
  experience: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  preferredSchedule: {
    type: String,
    enum: ['morning', 'afternoon', 'evening', 'weekend'],
    default: 'evening'
  },
  courseType: {
    type: String,
    enum: ['individual', 'group', 'online', 'hybrid', 'tournament'],
    default: 'individual'
  },
  goals: {
    type: String,
    trim: true
  },
  medicalConditions: {
    type: String,
    trim: true
  },
  emergencyContact: {
    name: String,
    relation: String,
    phone: String
  },
  status: {
    type: String,
    enum: ['inquiry', 'trial', 'enrolled', 'active', 'inactive', 'completed'],
    default: 'inquiry'
  },
  enrollmentDate: {
    type: Date
  },
  notes: {
    type: String,
    trim: true
  },
  source: {
    type: String,
    enum: ['website', 'referral', 'social-media', 'advertisement', 'walk-in', 'other'],
    default: 'website'
  }
}, {
  timestamps: true
});

// Index for better performance
studentSchema.index({ status: 1, createdAt: -1 });
studentSchema.index({ email: 1 });
studentSchema.index({ phone: 1 });

module.exports = mongoose.model('Student', studentSchema);