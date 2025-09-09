import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { User, Mail, Phone, Calendar, Users, MessageCircle, Send, CheckCircle } from 'lucide-react';
import emailService from '../../services/emailService';

const Registration = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    getValues
  } = useForm();

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    
    try {
      console.log('=== FORM SUBMISSION DEBUG ===');
      console.log('Raw form data received:', data);
      console.log('studentName value:', data.studentName);
      console.log('ageGroup value:', data.ageGroup);
      console.log('classType value:', data.classType);
      console.log('All form keys:', Object.keys(data));
      console.log('=== END DEBUG ===');
      
      // Validate that we have the required data
      if (!data.studentName || data.studentName.trim() === '') {
        console.error('Student name validation failed:', data.studentName);
        toast.error('Student name is required');
        setIsSubmitting(false);
        return;
      }
      
      if (!data.email || data.email.trim() === '') {
        console.error('Email validation failed:', data.email);
        toast.error('Email is required');
        setIsSubmitting(false);
        return;
      }
      
      if (!data.phone || data.phone.trim() === '') {
        console.error('Phone validation failed:', data.phone);
        toast.error('Phone number is required');
        setIsSubmitting(false);
        return;
      }
      
      // Prepare form data for email
      const formData = {
        studentName: data.studentName.trim(),
        email: data.email.trim(),
        phone: data.phone.trim(),
        parentName: data.parentName ? data.parentName.trim() : '',
        ageGroup: data.ageGroup,
        classType: data.classType || 'individual',
        experience: data.experience ? data.experience.trim() : ''
      };

      console.log('Final formData being sent via email:', formData);

      // Send email using EmailJS
      await emailService.sendRegistrationEmail(formData);
      
      console.log('Registration email sent successfully');
      
      // Show success message
      toast.success('Registration successful! We will contact you soon.');
      setIsSubmitted(true);
      reset();
      
      // Reset success state after 3 seconds
      setTimeout(() => {
        setIsSubmitted(false);
      }, 3000);
      
    } catch (error) {
      console.error('Registration error:', error);
      toast.error(error.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWhatsApp = () => {
    window.open('https://wa.me/917895108392?text=Hi! I would like to register for chess classes and book a free demo session.', '_blank');
  };

  const ageGroups = [
    { value: '5-8', label: '5-8 years (Beginner)' },
    { value: '9-12', label: '9-12 years (Intermediate)' },
    { value: '13-16', label: '13-16 years (Advanced)' },
    { value: '17+', label: '17+ years (Adult)' }
  ];

  const classTypes = [
    { value: 'individual', label: 'Individual Coaching' },
    { value: 'group', label: 'Group Classes' },
    { value: 'online', label: 'Online Sessions' },
    { value: 'tournament', label: 'Tournament Preparation' }
  ];

  return (
    <section id="registration-form" className="section-padding bg-gradient-to-b from-gray-50 to-white">
      <div className="container-max">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">
            Register for <span className="text-gradient">Chess Classes</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Join our chess academy and start your journey to becoming a chess master. 
            Fill out the form below or contact us directly via WhatsApp.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Registration Form */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
            className="space-y-8"
          >
            <div className="card p-8">
              <h3 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
                <User className="mr-3 text-primary-600" size={24} />
                Registration Form
              </h3>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Debug info */}
                {/* <div className="bg-yellow-100 p-2 text-xs">
                  <strong>Debug:</strong> Form errors: {JSON.stringify(errors)}
                  <br />
                  <button 
                    type="button" 
                    onClick={() => console.log('Current form values:', getValues())}
                    className="mt-1 px-2 py-1 bg-blue-500 text-white text-xs rounded"
                  >
                    Log Form Values
                  </button>
                </div> */}
                {/* Student Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Student Name *
                  </label>
                  <input
                    type="text"
                    {...register('studentName', { required: 'Student name is required' })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                    placeholder="Enter student's full name"
                  />
                  {errors.studentName && (
                    <p className="mt-1 text-sm text-red-600">{errors.studentName.message}</p>
                  )}
                </div>

                {/* Age Group */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Age Group *
                  </label>
                  <select
                    {...register('ageGroup', { required: 'Please select an age group' })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                  >
                    <option value="">Select Age Group</option>
                    {ageGroups.map(group => (
                      <option key={group.value} value={group.value}>
                        {group.label}
                      </option>
                    ))}
                  </select>
                  {errors.ageGroup && (
                    <p className="mt-1 text-sm text-red-600">{errors.ageGroup.message}</p>
                  )}
                </div>

                {/* Parent/Guardian Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Parent/Guardian Name *
                  </label>
                  <input
                    type="text"
                    {...register('parentName', { required: 'Parent/Guardian name is required' })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                    placeholder="Enter parent/guardian name"
                  />
                  {errors.parentName && (
                    <p className="mt-1 text-sm text-red-600">{errors.parentName.message}</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    {...register('email', { 
                      required: 'Email is required',
                      pattern: {
                        value: /^\S+@\S+$/i,
                        message: 'Please enter a valid email'
                      }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                    placeholder="Enter email address"
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    {...register('phone', { 
                      required: 'Phone number is required',
                      pattern: {
                        value: /^[0-9]{10}$/,
                        message: 'Please enter a valid 10-digit phone number'
                      }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                    placeholder="Enter 10-digit phone number"
                  />
                  {errors.phone && (
                    <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
                  )}
                </div>

                {/* Class Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preferred Class Type *
                  </label>
                  <select
                    {...register('classType', { required: 'Please select a class type' })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                  >
                    <option value="">Select Class Type</option>
                    {classTypes.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  {errors.classType && (
                    <p className="mt-1 text-sm text-red-600">{errors.classType.message}</p>
                  )}
                </div>

                {/* Chess Experience */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Chess Experience
                  </label>
                  <textarea
                    {...register('experience')}
                    rows="3"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                    placeholder="Tell us about your chess experience (optional)"
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full btn-primary flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <div className="loading"></div>
                      <span>Submitting...</span>
                    </>
                  ) : isSubmitted ? (
                    <>
                      <CheckCircle size={20} />
                      <span>Submitted Successfully!</span>
                    </>
                  ) : (
                    <>
                      <Send size={20} />
                      <span>Register Now</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </motion.div>

          {/* Info & WhatsApp */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            viewport={{ once: true }}
            className="space-y-8"
          >
            {/* Quick Contact */}
            <div className="card p-8 bg-gradient-to-r from-secondary-500 to-secondary-600 text-white">
              <h3 className="text-2xl font-bold mb-4 flex items-center">
                <MessageCircle className="mr-3" size={24} />
                Quick Registration
              </h3>
              <p className="mb-6 opacity-90">
                Want to register quickly? Contact us directly via WhatsApp for instant assistance and to book your free demo session.
              </p>
              <button
                onClick={handleWhatsApp}
                className="w-full bg-white text-secondary-600 hover:bg-gray-100 px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
              >
                <MessageCircle size={20} />
                <span>WhatsApp Registration</span>
              </button>
            </div>

            {/* Contact Info */}
            <div className="card p-8">
              <h3 className="text-2xl font-bold text-gray-800 mb-6">Contact Information</h3>
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Phone className="text-primary-600" size={20} />
                  <div>
                    <p className="font-semibold">Phone Number</p>
                    <p className="text-gray-600">+91 7895108392</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Mail className="text-primary-600" size={20} />
                  <div>
                    <p className="font-semibold">Email</p>
                    <p className="text-gray-600">contact@pawnsposes.com</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Calendar className="text-primary-600" size={20} />
                  <div>
                    <p className="font-semibold">Class Timings</p>
                    <p className="text-gray-600">Mon-Fri: 4:00 PM - 8:00 PM</p>
                    <p className="text-gray-600">Sat-Sun: 9:00 AM - 6:00 PM</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Benefits */}
            <div className="card p-8 bg-gradient-to-r from-primary-600 to-primary-700 text-white">
              <h3 className="text-2xl font-bold mb-4">What You Get</h3>
              <ul className="space-y-3">
                <li className="flex items-center space-x-2">
                  <CheckCircle size={16} />
                  <span>Free demo session</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle size={16} />
                  <span>Personalized learning plan</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle size={16} />
                  <span>Expert coaching</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle size={16} />
                  <span>Tournament preparation</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle size={16} />
                  <span>Progress tracking</span>
                </li>
              </ul>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Registration;