import React from 'react';
import { motion } from 'framer-motion';
import { Play, Star, Award, Users, MessageCircle } from 'lucide-react';

const Hero = () => {
  const handleWhatsApp = () => {
    window.open('https://wa.me/917895108392?text=Hi! I would like to book a free chess demo session.', '_blank');
  };

  const handleScrollToForm = () => {
    const element = document.getElementById('registration-form');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 chess-gradient">
        <div className="absolute inset-0 bg-black/20"></div>
        {/* Chess pieces pattern */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-20 text-6xl text-secondary-400">♜</div>
          <div className="absolute top-40 right-32 text-4xl text-secondary-500">♞</div>
          <div className="absolute bottom-32 left-16 text-5xl text-secondary-400">♝</div>
          <div className="absolute bottom-20 right-20 text-6xl text-secondary-600">♛</div>
          <div className="absolute top-60 left-1/2 text-3xl text-secondary-500">♚</div>
          <div className="absolute top-32 left-1/3 text-4xl text-secondary-400">♟</div>
        </div>
      </div>

      <div className="relative z-10 container-max text-center text-white">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="space-y-8"
        >
          {/* Main Heading */}
          <div className="space-y-4">
            <motion.h1
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight"
            >
              Master Chess with
              <span className="block bg-gradient-to-r from-secondary-400 to-secondary-600 bg-clip-text text-transparent">
                Expert Coaching
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto"
            >
              Professional chess coaching for all ages and skill levels. 
              Learn strategic thinking, improve your game, and become a champion.
            </motion.p>
          </div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="flex flex-wrap justify-center gap-6 md:gap-12"
          >
            <div className="flex items-center space-x-2">
              <Star className="text-secondary-400" size={24} />
              <span className="text-lg font-semibold">4.9 Rating</span>
            </div>
            <div className="flex items-center space-x-2">
              <Users className="text-primary-400" size={24} />
              <span className="text-lg font-semibold">500+ Students</span>
            </div>
            <div className="flex items-center space-x-2">
              <Award className="text-secondary-500" size={24} />
              <span className="text-lg font-semibold">100+ Winners</span>
            </div>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="flex flex-col sm:flex-row justify-center gap-4 pt-8"
          >
            <button
              onClick={handleWhatsApp}
              className="flex items-center justify-center space-x-2 bg-gradient-to-r from-secondary-500 to-secondary-600 hover:from-secondary-600 hover:to-secondary-700 text-white px-8 py-4 rounded-lg text-lg font-semibold transform hover:scale-105 transition-all duration-200 shadow-lg"
            >
              <MessageCircle size={22} />
              <span>Book Free Demo</span>
            </button>
            <button
              onClick={handleScrollToForm}
              className="flex items-center justify-center space-x-2 bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white border border-white/20 px-8 py-4 rounded-lg text-lg font-semibold transform hover:scale-105 transition-all duration-200"
            >
              <Play size={22} />
              <span>Register Now</span>
            </button>
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1 }}
            className="pt-12"
          >
            <p className="text-gray-400 text-sm mb-6">Trusted by parents and students across Mumbai</p>
            <div className="flex justify-center items-center space-x-8 opacity-60">
              <div className="text-2xl">🏆</div>
              <div className="text-2xl">🎯</div>
              <div className="text-2xl">🧠</div>
              <div className="text-2xl">⭐</div>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Floating elements */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          animate={{ y: [0, -20, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-20 left-10 w-8 h-8 bg-secondary-400/20 rounded-full"
        />
        <motion.div
          animate={{ y: [0, -15, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          className="absolute top-40 right-20 w-6 h-6 bg-primary-400/20 rounded-full"
        />
        <motion.div
          animate={{ y: [0, -25, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-40 left-20 w-10 h-10 bg-secondary-500/20 rounded-full"
        />
      </div>
    </section>
  );
};

export default Hero;