import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  MessageCircle, 
  Send, 
  CheckCircle,
  Instagram,
  Facebook,
  Twitter
} from 'lucide-react';
import emailService from '../services/emailService';

const Contact = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm();

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    
    try {
      console.log('Contact form submitted:', data);
      
      // Send email using EmailJS
      await emailService.sendContactEmail(data);
      
      console.log('Contact email sent successfully');
      
      toast.success('Message sent successfully! We will get back to you soon.');
      setIsSubmitted(true);
      reset();
      
      setTimeout(() => {
        setIsSubmitted(false);
      }, 3000);
      
    } catch (error) {
      console.error('Contact form error:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWhatsApp = () => {
    window.open('https://wa.me/917895108392?text=Hi! I would like to know more about chess coaching.', '_blank');
  };

  const handleCall = (number) => {
    window.open(`tel:${number}`, '_self');
  };

  const contactInfo = [
    {
      icon: Phone,
      title: "Phone Numbers",
      details: ["+91 7895108392"],
      action: () => handleCall("+91 7895108392"),
      color: "text-blue-600"
    },
    {
      icon: Mail,
      title: "Email Address",
      details: ["contact@pawnsposes.com"],
      action: () => window.open("mailto:contact@pawnsposes.com", "_self"),
      color: "text-green-600"
    },
    {
      icon: MapPin,
      title: "Location",
      details: ["Mumbai, Maharashtra", "India"],
      action: () => window.open("https://maps.google.com/?q=Mumbai,Maharashtra,India", "_blank"),
      color: "text-red-600"
    },
    {
      icon: Clock,
      title: "Class Timings",
      details: ["Mon-Fri: 4:00 PM - 8:00 PM", "Sat-Sun: 9:00 AM - 6:00 PM"],
      action: null,
      color: "text-purple-600"
    }
  ];

  const socialLinks = [
    {
      icon: Instagram,
      name: "Instagram",
      url: "https://www.instagram.com/pawnsposes/",
      color: "text-pink-600"
    },
    {
      icon: Facebook,
      name: "Facebook",
      url: "#",
      color: "text-blue-600"
    },
    {
      icon: Twitter,
      name: "Twitter",
      url: "#",
      color: "text-blue-400"
    }
  ];

  const faqs = [
    {
      question: "What age groups do you teach?",
      answer: "We teach students from 5 years old to adults. We have specialized programs for different age groups: 5-8 years (Beginner), 9-12 years (Intermediate), 13-16 years (Advanced), and 17+ years (Adult)."
    },
    {
      question: "Do you offer online classes?",
      answer: "Yes, we offer both online and offline classes. Our online classes are conducted via video call with interactive teaching methods and digital chess boards."
    },
    {
      question: "What is the duration of each class?",
      answer: "Individual sessions are typically 60 minutes, while group classes are 90 minutes. We also offer intensive weekend workshops of 3-4 hours."
    },
    {
      question: "Do you provide tournament preparation?",
      answer: "Absolutely! We have specialized tournament preparation programs that include practice games, strategy sessions, and psychological preparation for competitive play."
    }
  ];

  return (
    <div className="pt-20">
      {/* Hero Section */}
      <section className="section-padding bg-gradient-to-b from-primary-600 to-primary-700 text-white">
        <div className="container-max">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Get in <span className="text-yellow-400">Touch</span>
            </h1>
            <p className="text-xl md:text-2xl mb-8 max-w-3xl mx-auto opacity-90">
              Ready to start your chess journey? Contact us today to learn more about our programs 
              or to schedule a free demo session.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Contact Info Cards */}
      <section className="section-padding bg-gray-50">
        <div className="container-max">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
            {contactInfo.map((info, index) => {
              const Icon = info.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  whileHover={{ scale: 1.05 }}
                  className={`card p-6 text-center cursor-pointer ${info.action ? 'hover:shadow-xl' : ''}`}
                  onClick={info.action}
                >
                  <div className={`w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center ${info.color}`}>
                    <Icon size={32} />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">{info.title}</h3>
                  {info.details.map((detail, i) => (
                    <p key={i} className="text-gray-600 text-sm mb-1">{detail}</p>
                  ))}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contact Form & Map */}
      <section className="section-padding bg-white">
        <div className="container-max">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="space-y-8"
            >
              <div>
                <h2 className="text-3xl font-bold text-gray-800 mb-4">Send us a Message</h2>
                <p className="text-gray-600">
                  Have questions about our chess programs? Fill out the form below and we'll get back to you within 24 hours.
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Name *
                    </label>
                    <input
                      type="text"
                      {...register('name', { required: 'Name is required' })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                      placeholder="Your full name"
                    />
                    {errors.name && (
                      <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone *
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
                      placeholder="Your phone number"
                    />
                    {errors.phone && (
                      <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email *
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
                    placeholder="Your email address"
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subject *
                  </label>
                  <select
                    {...register('subject', { required: 'Please select a subject' })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                  >
                    <option value="">Select a subject</option>
                    <option value="enrollment">Enrollment Inquiry</option>
                    <option value="demo">Free Demo Session</option>
                    <option value="pricing">Pricing Information</option>
                    <option value="schedule">Schedule Information</option>
                    <option value="other">Other</option>
                  </select>
                  {errors.subject && (
                    <p className="mt-1 text-sm text-red-600">{errors.subject.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message *
                  </label>
                  <textarea
                    {...register('message', { required: 'Message is required' })}
                    rows="5"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                    placeholder="Tell us about your chess goals, experience level, or any specific questions you have..."
                  />
                  {errors.message && (
                    <p className="mt-1 text-sm text-red-600">{errors.message.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full btn-primary flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <div className="loading"></div>
                      <span>Sending...</span>
                    </>
                  ) : isSubmitted ? (
                    <>
                      <CheckCircle size={20} />
                      <span>Message Sent!</span>
                    </>
                  ) : (
                    <>
                      <Send size={20} />
                      <span>Send Message</span>
                    </>
                  )}
                </button>
              </form>
            </motion.div>

            {/* Right Side - Quick Contact & FAQ */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="space-y-8"
            >
              {/* Quick Contact */}
              <div className="card p-8 bg-gradient-to-r from-green-500 to-green-600 text-white">
                <h3 className="text-2xl font-bold mb-4">Quick Contact</h3>
                <p className="mb-6 opacity-90">
                  Need immediate assistance? Contact us directly via WhatsApp for instant support.
                </p>
                <button
                  onClick={handleWhatsApp}
                  className="w-full bg-white text-green-600 hover:bg-gray-100 px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
                >
                  <MessageCircle size={20} />
                  <span>WhatsApp Now</span>
                </button>
              </div>

              {/* Social Links */}
              <div className="card p-8">
                <h3 className="text-2xl font-bold text-gray-800 mb-4">Follow Us</h3>
                <p className="text-gray-600 mb-6">
                  Stay connected with us on social media for chess tips, student achievements, and updates.
                </p>
                <div className="flex space-x-4">
                  {socialLinks.map((social, index) => {
                    const Icon = social.icon;
                    return (
                      <a
                        key={index}
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center ${social.color} hover:bg-gray-200 transition-colors`}
                      >
                        <Icon size={20} />
                      </a>
                    );
                  })}
                </div>
              </div>

              {/* FAQ */}
              <div className="card p-8">
                <h3 className="text-2xl font-bold text-gray-800 mb-4">Frequently Asked Questions</h3>
                <div className="space-y-4">
                  {faqs.map((faq, index) => (
                    <div key={index} className="border-b border-gray-200 pb-4">
                      <h4 className="font-semibold text-gray-800 mb-2">{faq.question}</h4>
                      <p className="text-gray-600 text-sm">{faq.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Map Section */}
      <section className="section-padding bg-gray-50">
        <div className="container-max">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-gray-800 mb-4">Find Us</h2>
            <p className="text-gray-600">
              We're located in Mumbai, Maharashtra. Contact us for exact location details.
            </p>
          </motion.div>

          <div className="card p-8 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-center">
            <h3 className="text-2xl font-bold mb-4">Visit Our Chess Academy</h3>
            <p className="mb-6 opacity-90">
              Located in the heart of Mumbai, our academy provides a perfect environment for learning chess.
            </p>
            <button
              onClick={() => window.open("https://maps.google.com/?q=Mumbai,Maharashtra,India", "_blank")}
              className="bg-white text-blue-600 hover:bg-gray-100 px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              Get Directions
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Contact;