import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Star, Quote } from 'lucide-react';

const Testimonials = () => {
  const [loading] = useState(false);

  const testimonials = [
    {
      _id: 1,
      name: "Rajesh Kumar",
      designation: "Parent of Arjun (Age 10)",
      rating: 5,
      content: "My son Arjun started chess as a complete beginner. Within 6 months of coaching at PawnsPoses, he won his first tournament! The coaches are incredibly patient and skilled.",
      achievement: "State Championship Winner"
    },
    {
      _id: 2,
      name: "Priya Sharma",
      designation: "Parent of Kavya (Age 12)",
      rating: 5,
      content: "The individual attention my daughter gets is amazing. Her coach noticed her strengths and helped her develop a unique playing style. She's now ranked among top 10 in her age group.",
      achievement: "District Level 2nd Place"
    },
    {
      _id: 3,
      name: "Dr. Amit Verma",
      designation: "Parent of Rohan (Age 8)",
      rating: 5,
      content: "Chess has improved my son's concentration and problem-solving skills dramatically. The coaches at PawnsPoses make learning fun and engaging for young minds.",
      achievement: "School Chess Champion"
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6
      }
    }
  };

  const renderStars = (rating) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        size={16}
        className={`${i < rating ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
      />
    ));
  };

  return (
    <section className="section-padding bg-gradient-to-b from-white to-gray-50">
      <div className="container-max">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">
            What Our <span className="text-gradient">Families</span> Say
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Read testimonials from parents and students who have experienced the transformative power of chess education with us.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
        >
          {loading ? (
            // Loading skeleton
            Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="card p-6 animate-pulse">
                <div className="flex items-center space-x-1 mb-4">
                  {Array.from({ length: 5 }, (_, j) => (
                    <div key={j} className="w-4 h-4 bg-gray-200 rounded"></div>
                  ))}
                </div>
                <div className="space-y-2 mb-6">
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
                <div className="pt-4 border-t border-gray-100">
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-24"></div>
                    <div className="h-3 bg-gray-200 rounded w-32"></div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            testimonials.map((testimonial) => (
              <motion.div
                key={testimonial._id}
                variants={itemVariants}
                whileHover={{ scale: 1.02 }}
                className="card p-6 relative group"
              >
                {/* Quote Icon */}
                <div className="absolute top-4 right-4 text-primary-100 group-hover:text-primary-200 transition-colors">
                  <Quote size={24} />
                </div>

                {/* Rating */}
                <div className="flex items-center space-x-1 mb-4">
                  {renderStars(testimonial.rating)}
                </div>

                {/* Testimonial Text */}
                <p className="text-gray-700 mb-6 leading-relaxed">
                  "{testimonial.content || testimonial.text}"
                </p>

                {/* Achievement Badge - only show if exists */}
                {testimonial.achievement && (
                  <div className="mb-4">
                    <span className="inline-block bg-green-100 text-green-800 text-xs font-semibold px-3 py-1 rounded-full">
                      🏆 {testimonial.achievement}
                    </span>
                  </div>
                )}

                {/* Author Info */}
                <div className="pt-4 border-t border-gray-100">
                  <div>
                    <h4 className="font-semibold text-gray-800">{testimonial.name}</h4>
                    <p className="text-sm text-gray-600">{testimonial.designation || testimonial.role}</p>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </motion.div>

        {/* Overall Rating */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
          className="mt-16 text-center"
        >
          <div className="inline-flex items-center space-x-2 bg-yellow-50 px-6 py-3 rounded-full">
            <div className="flex items-center space-x-1">
              {renderStars(5)}
            </div>
            <span className="text-lg font-semibold text-gray-800">4.9/5</span>
          </div>
        </motion.div>

        {/* Call to Action */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          viewport={{ once: true }}
          className="mt-12 text-center"
        >
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-8 text-white">
            <h3 className="text-2xl font-bold mb-4">Ready to Start Your Chess Journey?</h3>
            <p className="text-lg mb-6 opacity-90">
              Join hundreds of satisfied families and give your child the gift of chess mastery.
            </p>
            <button
              onClick={() => {
                const element = document.getElementById('registration-form');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="bg-white text-primary-600 hover:bg-gray-100 px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Register Now
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Testimonials;