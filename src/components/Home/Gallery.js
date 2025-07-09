import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Trophy, Users, Star } from 'lucide-react';

const Gallery = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading] = useState(false);

  const galleryImages = [
    {
      _id: 1,
      image: { url: "/images/4th Portishead Rapid Tournament Winner.jpg" },
      title: "4th Portishead Rapid Tournament Winner",
      description: "Ravya Sharma secured 1st place in the 4th Portishead Junior Rapid Play Tournament on May 3, 2025 with us.",
      category: "achievements"
    },
    {
      _id: 2,
      image: { url: "/images/5 year old USCF 1100.jpg" },
      title: "5-Year-Old USCF 1100 Rated Tournament Winner",
      description: "5-year-old, USCF 1100-rated, First Place Winner in the Under-11 Tournament",
      category: "achievements"
    },
    {
      _id: 3,
      image: { url: "/images/Arin CSC junior Grand Prix 2025 Champion.jpg" },
      title: "Arin CSC junior Grand Prix 2025 Champion",
      description: "Arin wins the CSC Junior Grand Prix 2025, claiming the championship title.",
      category: "achievements"
    }
  ];

  const stats = [
    {
      icon: Trophy,
      number: "100+",
      label: "Tournament Winners",
      color: "text-secondary-500"
    },
    {
      icon: Users,
      number: "500+",
      label: "Happy Students",
      color: "text-primary-500"
    },
    {
      icon: Star,
      number: "4.9",
      label: "Average Rating",
      color: "text-secondary-600"
    }
  ];

  const openModal = (image) => {
    setSelectedImage(image);
  };

  const closeModal = () => {
    setSelectedImage(null);
  };

  const nextImage = () => {
    const currentIndex = galleryImages.findIndex(img => img._id === selectedImage._id);
    const nextIndex = (currentIndex + 1) % galleryImages.length;
    setSelectedImage(galleryImages[nextIndex]);
  };

  const prevImage = () => {
    const currentIndex = galleryImages.findIndex(img => img._id === selectedImage._id);
    const prevIndex = (currentIndex - 1 + galleryImages.length) % galleryImages.length;
    setSelectedImage(galleryImages[prevIndex]);
  };

  return (
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
            Our Success <span className="text-gradient">Stories</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            See our students' journey from beginners to champions. Every victory is a testament to dedication and expert guidance.
          </p>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16"
        >
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div key={index} className="text-center">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4 ${stat.color}`}>
                  <Icon size={32} />
                </div>
                <div className="text-3xl font-bold text-gray-800 mb-2">{stat.number}</div>
                <div className="text-gray-600">{stat.label}</div>
              </div>
            );
          })}
        </motion.div>

        {/* Gallery Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
          className="flex flex-wrap justify-center gap-6"
        >
          {loading ? (
            Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="card overflow-hidden animate-pulse">
                <div className="w-full h-64 bg-gray-200"></div>
                <div className="p-6">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-full"></div>
                </div>
              </div>
            ))
          ) : (
            galleryImages.map((image, index) => (
              <motion.div
                key={image._id || image.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                whileHover={{ scale: 1.03 }}
                className="cursor-pointer group w-full md:w-80 lg:w-96"
                onClick={() => openModal(image)}
              >
                <div className="card overflow-hidden h-full flex flex-col">
                  <div className="relative flex-shrink-0">
                    <img
                      src={image.image?.url || image.src}
                      alt={image.title}
                      className="w-full h-64 object-contain bg-gray-50 transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        e.target.src = "/api/placeholder/400/300";
                      }}
                    />

                  </div>
                  <div className="p-6 flex-grow flex flex-col">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2 flex-shrink-0">{image.title}</h3>
                    <p className="text-gray-600 text-sm flex-grow">{image.description || 'No description available'}</p>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </motion.div>

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
                className="relative max-w-4xl max-h-full bg-white rounded-lg overflow-hidden"
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
                  src={selectedImage.image?.url || selectedImage.src}
                  alt={selectedImage.title}
                  className="w-full h-64 md:h-96 object-contain"
                />
                
                <div className="p-6">
                  <h3 className="text-2xl font-bold text-gray-800 mb-2">{selectedImage.title}</h3>
                  <p className="text-gray-600">{selectedImage.description || 'No description available'}</p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};

export default Gallery;