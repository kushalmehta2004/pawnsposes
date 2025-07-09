import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Filter, Trophy, Users, Star, Award } from 'lucide-react';

const Gallery = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  const categories = [
    { id: 'all', label: 'All', icon: Filter },
    { id: 'achievements', label: 'Achievements', icon: Trophy },
    { id: 'coaching', label: 'Coaching', icon: Users },
    { id: 'tournaments', label: 'Tournaments', icon: Award },
    { id: 'students', label: 'Students', icon: Star }
  ];

  const galleryImages = [
    {
      id: 1,
      src: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400&h=300&fit=crop&crop=center",
      alt: "State Championship Winner",
      title: "Arjun - State Champion",
      description: "12-year-old Arjun won the Maharashtra State Chess Championship after 8 months of intensive training with our coaches.",
      category: "achievements",
      date: "March 2024",
      achievement: "State Champion"
    },
    {
      id: 2,
      src: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400&h=300&fit=crop&crop=center",
      alt: "Individual coaching session",
      title: "One-on-One Coaching",
      description: "Personalized coaching sessions help students improve their game with focused attention and customized strategies.",
      category: "coaching",
      date: "February 2024",
      achievement: "Individual Attention"
    },
    {
      id: 3,
      src: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400&h=300&fit=crop&crop=center",
      alt: "Group chess class",
      title: "Group Learning Session",
      description: "Students learn from each other in our interactive group classes, building friendships and competitive spirit.",
      category: "students",
      date: "January 2024",
      achievement: "Team Learning"
    },
    {
      id: 4,
      src: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400&h=300&fit=crop&crop=center",
      alt: "Tournament participation",
      title: "District Tournament",
      description: "Our students actively participate in various tournaments, gaining valuable competitive experience.",
      category: "tournaments",
      date: "December 2023",
      achievement: "Tournament Ready"
    },
    {
      id: 5,
      src: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400&h=300&fit=crop&crop=center",
      alt: "National level winner",
      title: "Kavya - National Medal",
      description: "Kavya secured bronze medal at the National Junior Chess Championship, representing Maharashtra.",
      category: "achievements",
      date: "November 2023",
      achievement: "National Medalist"
    },
    {
      id: 6,
      src: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400&h=300&fit=crop&crop=center",
      alt: "Advanced strategy session",
      title: "Advanced Strategy Class",
      description: "Advanced students learning complex chess openings and endgame techniques from our expert coaches.",
      category: "coaching",
      date: "October 2023",
      achievement: "Advanced Training"
    },
    {
      id: 7,
      src: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400&h=300&fit=crop&crop=center",
      alt: "Young chess prodigy",
      title: "Youngest Student Success",
      description: "6-year-old Rohan showing exceptional talent and enthusiasm for chess in our beginner's program.",
      category: "students",
      date: "September 2023",
      achievement: "Young Talent"
    },
    {
      id: 8,
      src: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400&h=300&fit=crop&crop=center",
      alt: "Inter-school tournament",
      title: "Inter-School Championship",
      description: "Our students dominated the inter-school chess championship, winning 1st, 2nd, and 3rd positions.",
      category: "tournaments",
      date: "August 2023",
      achievement: "Team Victory"
    },
    {
      id: 9,
      src: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400&h=300&fit=crop&crop=center",
      alt: "Chess coaching certification",
      title: "Coaching Excellence",
      description: "Our coaches receiving advanced certification in chess coaching methodology and child psychology.",
      category: "coaching",
      date: "July 2023",
      achievement: "Certified Excellence"
    },
    {
      id: 10,
      src: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400&h=300&fit=crop&crop=center",
      alt: "Student achievement ceremony",
      title: "Monthly Achievement Ceremony",
      description: "Monthly recognition ceremony where we celebrate our students' progress and achievements.",
      category: "achievements",
      date: "June 2023",
      achievement: "Monthly Champions"
    },
    {
      id: 11,
      src: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400&h=300&fit=crop&crop=center",
      alt: "Online chess session",
      title: "Online Coaching Session",
      description: "During pandemic, we adapted to online coaching, ensuring uninterrupted learning for our students.",
      category: "coaching",
      date: "May 2023",
      achievement: "Adaptive Learning"
    },
    {
      id: 12,
      src: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400&h=300&fit=crop&crop=center",
      alt: "Happy students group photo",
      title: "Our Chess Family",
      description: "Group photo of our happy students after a successful coaching session, showcasing the joy of learning chess.",
      category: "students",
      date: "April 2023",
      achievement: "Chess Family"
    }
  ];

  const filteredImages = activeFilter === 'all' 
    ? galleryImages 
    : galleryImages.filter(img => img.category === activeFilter);

  const openModal = (image) => {
    setSelectedImage(image);
  };

  const closeModal = () => {
    setSelectedImage(null);
  };

  const nextImage = () => {
    const currentIndex = filteredImages.findIndex(img => img.id === selectedImage.id);
    const nextIndex = (currentIndex + 1) % filteredImages.length;
    setSelectedImage(filteredImages[nextIndex]);
  };

  const prevImage = () => {
    const currentIndex = filteredImages.findIndex(img => img.id === selectedImage.id);
    const prevIndex = (currentIndex - 1 + filteredImages.length) % filteredImages.length;
    setSelectedImage(filteredImages[prevIndex]);
  };

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
              Success <span className="text-yellow-400">Gallery</span>
            </h1>
            <p className="text-xl md:text-2xl mb-8 max-w-3xl mx-auto opacity-90">
              Witness the journey of our students from beginners to champions. 
              Every photo tells a story of dedication, learning, and success.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="section-padding bg-white">
        <div className="container-max">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-16">
            <div className="text-center">
              <div className="text-4xl font-bold text-primary-600 mb-2">500+</div>
              <div className="text-gray-600">Photos Captured</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-green-600 mb-2">100+</div>
              <div className="text-gray-600">Tournament Winners</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-yellow-600 mb-2">50+</div>
              <div className="text-gray-600">Championship Moments</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-purple-600 mb-2">1000+</div>
              <div className="text-gray-600">Happy Moments</div>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Section */}
      <section className="section-padding bg-gray-50">
        <div className="container-max">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-8">
              Browse by <span className="text-gradient">Category</span>
            </h2>
            
            <div className="flex flex-wrap justify-center gap-4">
              {categories.map((category) => {
                const Icon = category.icon;
                return (
                  <button
                    key={category.id}
                    onClick={() => setActiveFilter(category.id)}
                    className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-semibold transition-all ${
                      activeFilter === category.id
                        ? 'bg-primary-600 text-white shadow-lg'
                        : 'bg-white text-gray-600 hover:bg-primary-50 hover:text-primary-600'
                    }`}
                  >
                    <Icon size={20} />
                    <span>{category.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Gallery Grid */}
          <motion.div
            key={activeFilter}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 auto-rows-fr"
          >
            {filteredImages.map((image, index) => (
              <motion.div
                key={image.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="cursor-pointer"
                onClick={() => openModal(image)}
              >
                <div className="card overflow-hidden h-full flex flex-col">
                  <div className="relative">
                    <img
                      src={image.src}
                      alt={image.alt}
                      className="w-full h-64 object-cover"
                    />
                    <div className="absolute top-4 right-4">
                      <span className="bg-green-500 text-white text-xs px-3 py-1 rounded-full">
                        {image.achievement}
                      </span>
                    </div>
                  </div>
                  <div className="p-6 flex flex-col flex-grow">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">{image.title}</h3>
                    <p className="text-gray-600 text-sm mb-3 flex-grow">{image.description}</p>
                    <div className="text-xs text-gray-500 mt-auto">{image.date}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {filteredImages.length === 0 && (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🔍</div>
              <p className="text-gray-600">No images found for this category.</p>
            </div>
          )}
        </div>
      </section>

      {/* Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-5xl max-h-full bg-white rounded-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={closeModal}
                className="absolute top-4 right-4 z-10 p-2 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-70 transition-all"
              >
                <X size={24} />
              </button>
              
              <button
                onClick={prevImage}
                className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 p-2 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-70 transition-all"
              >
                <ChevronLeft size={24} />
              </button>
              
              <button
                onClick={nextImage}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 p-2 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-70 transition-all"
              >
                <ChevronRight size={24} />
              </button>

              <img
                src={selectedImage.src}
                alt={selectedImage.alt}
                className="w-full h-64 md:h-96 object-cover"
              />
              
              <div className="p-8">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-2xl font-bold text-gray-800">{selectedImage.title}</h3>
                  <span className="bg-green-100 text-green-800 text-sm px-3 py-1 rounded-full">
                    {selectedImage.achievement}
                  </span>
                </div>
                <p className="text-gray-600 mb-4">{selectedImage.description}</p>
                <div className="text-sm text-gray-500">{selectedImage.date}</div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Gallery;