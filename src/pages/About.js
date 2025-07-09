import React from 'react';
import { motion } from 'framer-motion';
import { Award, Users, Trophy, Target, Heart, BookOpen } from 'lucide-react';

const About = () => {
  const coaches = [
    {
      name: "GM Rajesh Sharma",
      title: "Head Coach & Founder",
      image: "/images/master.jpg",
      experience: "15+ years",
      achievements: ["International Master", "State Champion", "FIDE Certified"],
      bio: "With over 15 years of coaching experience, GM Rajesh has trained over 500 students and produced numerous state and national champions."
    },
    {
      name: "FM Meer Mehta",
      title: "Tournament Coach",
      image: "/images/master 2.jpg",
      experience: "8+ years",
      achievements: ["FIDE Master", "State Champion", "Tournament Director"],
      bio: "Expert in tournament preparation and strategy development, with a track record of preparing students for competitive play."
    }
  ];

  const stats = [
    { icon: Users, number: "500+", label: "Students Trained" },
    { icon: Trophy, number: "100+", label: "Tournament Winners" },
    { icon: Award, number: "50+", label: "State Champions" },
    { icon: Target, number: "15+", label: "Years Experience" }
  ];

  const values = [
    {
      icon: Heart,
      title: "Passion for Chess",
      description: "We believe chess is more than a game - it's a tool for developing critical thinking and character."
    },
    {
      icon: BookOpen,
      title: "Continuous Learning",
      description: "We stay updated with the latest chess theory and teaching methodologies to provide the best education."
    },
    {
      icon: Users,
      title: "Individual Attention",
      description: "Every student receives personalized coaching tailored to their unique learning style and goals."
    },
    {
      icon: Trophy,
      title: "Excellence in Results",
      description: "Our proven track record of producing champions speaks for our commitment to excellence."
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
              About <span className="text-yellow-400">PawnsPoses</span>
            </h1>
            <p className="text-xl md:text-2xl mb-8 max-w-3xl mx-auto opacity-90">
              We are Mumbai's premier chess coaching academy, dedicated to nurturing chess talent 
              and developing strategic thinking in students of all ages.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="section-padding bg-white">
        <div className="container-max">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="space-y-6"
            >
              <h2 className="text-3xl font-bold text-gray-800">Our Mission</h2>
              <p className="text-gray-600 leading-relaxed">
                To provide world-class chess education that develops not just skilled players, 
                but confident, strategic thinkers who can excel in all aspects of life. We believe 
                that chess is a powerful tool for cognitive development, character building, and 
                academic excellence.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Our structured approach combines traditional chess wisdom with modern teaching 
                methods, ensuring each student receives personalized attention and develops at 
                their own pace while being challenged to reach their full potential.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="space-y-6"
            >
              <h2 className="text-3xl font-bold text-gray-800">Our Vision</h2>
              <p className="text-gray-600 leading-relaxed">
                To become India's leading chess academy, recognized for producing champions 
                and contributing to the growth of chess in the country. We envision a future 
                where every student we teach becomes a lifelong chess enthusiast and strategic 
                thinker.
              </p>
              <p className="text-gray-600 leading-relaxed">
                We aim to make chess accessible to everyone, regardless of their background, 
                and to create a supportive community where students can learn, grow, and 
                achieve their chess dreams while developing valuable life skills.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="section-padding bg-gray-50">
        <div className="container-max">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-gray-800 mb-4">Our Achievements</h2>
            <p className="text-xl text-gray-600">Numbers that speak for our success</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="text-center"
                >
                  <div className="w-16 h-16 mx-auto mb-4 bg-primary-100 rounded-full flex items-center justify-center">
                    <Icon size={32} className="text-primary-600" />
                  </div>
                  <div className="text-3xl font-bold text-gray-800 mb-2">{stat.number}</div>
                  <div className="text-gray-600">{stat.label}</div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Our Coaches */}
      <section className="section-padding bg-white">
        <div className="container-max">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">
              Meet Our Expert <span className="text-gradient">Coaches</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Learn from the best! Our experienced coaches bring years of competitive experience 
              and proven teaching methods to help you excel.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {coaches.map((coach, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                viewport={{ once: true }}
                className="card p-6 text-center"
              >
                <img
                  src={coach.image}
                  alt={coach.name}
                  className="w-32 h-32 rounded-full mx-auto mb-4 object-cover"
                />
                <h3 className="text-xl font-bold text-gray-800 mb-2">{coach.name}</h3>
                <p className="text-primary-600 font-semibold mb-2">{coach.title}</p>
                <p className="text-gray-600 mb-4">{coach.experience} Experience</p>
                <div className="flex flex-wrap justify-center gap-2 mb-4">
                  {coach.achievements.map((achievement, i) => (
                    <span
                      key={i}
                      className="bg-primary-100 text-primary-800 text-xs px-2 py-1 rounded-full"
                    >
                      {achievement}
                    </span>
                  ))}
                </div>
                <p className="text-gray-600 text-sm">{coach.bio}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section className="section-padding bg-gray-50">
        <div className="container-max">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">
              Our Core <span className="text-gradient">Values</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              The principles that guide everything we do at PawnsPoses
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {values.map((value, index) => {
              const Icon = value.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.2 }}
                  viewport={{ once: true }}
                  className="card p-6 flex items-start space-x-4"
                >
                  <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon size={24} className="text-primary-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800 mb-2">{value.title}</h3>
                    <p className="text-gray-600">{value.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="section-padding bg-gradient-to-r from-primary-600 to-primary-700 text-white">
        <div className="container-max text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Ready to Begin Your Chess Journey?
            </h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto opacity-90">
              Join our community of chess enthusiasts and start your path to mastery today.
            </p>
            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setTimeout(() => {
                  window.location.href = '/';
                }, 300);
              }}
              className="bg-white text-primary-600 hover:bg-gray-100 px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Get Started Now
            </button>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default About;