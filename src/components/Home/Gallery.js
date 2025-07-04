import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Trophy, Users, Star } from 'lucide-react';
import apiService from '../../services/api';

const Gallery = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [galleryImages, setGalleryImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fallbackImages = [
    {
      _id: 1,
      image: { url: "/api/placeholder/400/300" },
      title: "National Championship Winner",
      description: "Arjun, age 12, won the state championship after 6 months of training with us.",
      category: "achievements"
    },
    {
      _id: 2,
      image: { url: "/api/placeholder/400/300" },
      title: "Individual Coaching Session",
      description: "One-on-one coaching helps students improve faster and build confidence.",
      category: "training"
    },
    {
      _id: 3,
      image: { url: "/api/placeholder/400/300" },
      title: "Group Learning Experience",
      description: "Students learn from each other in our interactive group sessions.",
      category: "training"
    }
  ];

  useEffect(() => {
    loadGallery();
  }, []);

  const loadGallery = async () => {
    try {
      setLoading(true);
      const response = await apiService.getFeaturedGalleryImages();
      if (response.images && response.images.length > 0) {
        setGalleryImages(response.images);
      } else {
        setGalleryImages(fallbackImages);
      }
    } catch (error) {
      console.error('Error loading gallery:', error);
      setError('Failed to load gallery');
      setGalleryImages(fallbackImages);
    } finally {
      setLoading(false);
    }
  };

  const stats = [
    {
      icon: Trophy,
      number: "100+",
      label: "Tournament Winners",
      color: "text-yellow-500"
    },
    {
      icon: Users,
      number: "500+",
      label: "Happy Students",
      color: "text-blue-500"
    },
    {
      icon: Star,
      number: "4.9",
      label: "Average Rating",
      color: "text-green-500"
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
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
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
                whileHover={{ scale: 1.05 }}
                className="cursor-pointer group"
                onClick={() => openModal(image)}
              >
                <div className="card overflow-hidden">
                  <div className="relative">
                    <img
                      src={image.image?.url || image.src}
                      alt={image.title}
                      className="w-full h-64 object-cover transition-transform duration-300 group-hover:scale-110"
                      onError={(e) => {
                        e.target.src = "/api/placeholder/400/300";
                      }}
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-300 flex items-center justify-center">
                      <div className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="text-center">
                          <div className="text-3xl mb-2">🔍</div>
                          <p className="text-sm font-semibold">View Details</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">{image.title}</h3>
                    <p className="text-gray-600 text-sm">{image.description || 'No description available'}</p>
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
                  className="w-full h-64 md:h-96 object-cover"
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