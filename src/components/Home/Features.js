import React from 'react';
import { motion } from 'framer-motion';
import { Brain, Users, Trophy, Target, Clock, Star } from 'lucide-react';

const Features = () => {
  const features = [
    {
      icon: Brain,
      title: "Strategic Thinking",
      description: "Develop critical thinking and problem-solving skills through chess",
      color: "from-primary-500 to-primary-600"
    },
    {
      icon: Users,
      title: "Expert Coaches",
      description: "Learn from certified chess masters with years of experience",
      color: "from-secondary-500 to-secondary-600"
    },
    {
      icon: Trophy,
      title: "Tournament Ready",
      description: "Prepare for competitions and achieve tournament success",
      color: "from-secondary-400 to-secondary-500"
    },
    {
      icon: Target,
      title: "Personalized Learning",
      description: "Tailored lessons based on your skill level and goals",
      color: "from-primary-600 to-primary-700"
    },
    {
      icon: Clock,
      title: "Flexible Schedule",
      description: "Choose class timings that fit your busy schedule",
      color: "from-secondary-600 to-secondary-700"
    },
    {
      icon: Star,
      title: "Proven Results",
      description: "Track record of students winning local and national tournaments",
      color: "from-primary-500 to-secondary-500"
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

  return (
    <section className="section-padding bg-gradient-to-b from-gray-50 to-white">
      <div className="container-max">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">
            Why Choose <span className="text-gradient">PawnsPoses</span>?
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            We provide comprehensive chess education that goes beyond just learning moves. 
            Our approach builds character, confidence, and critical thinking skills.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
        >
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={index}
                variants={itemVariants}
                whileHover={{ scale: 1.05 }}
                className="card card-hover p-6 text-center group"
              >
                <div className={`w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r ${feature.color} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                  <Icon size={32} className="text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Additional Benefits */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
          className="mt-16 bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-8 md:p-12 text-white text-center"
        >
          <h3 className="text-2xl md:text-3xl font-bold mb-4">
            More Than Just Chess Lessons
          </h3>
          <p className="text-lg mb-6 opacity-90">
            Our students develop life skills that extend far beyond the chessboard
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="text-3xl mb-2">🧠</div>
              <h4 className="font-semibold">Cognitive Development</h4>
              <p className="text-sm opacity-80">Enhanced memory and concentration</p>
            </div>
            <div className="space-y-2">
              <div className="text-3xl mb-2">🎯</div>
              <h4 className="font-semibold">Decision Making</h4>
              <p className="text-sm opacity-80">Better analytical and strategic thinking</p>
            </div>
            <div className="space-y-2">
              <div className="text-3xl mb-2">💪</div>
              <h4 className="font-semibold">Confidence Building</h4>
              <p className="text-sm opacity-80">Increased self-esteem and resilience</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Features;