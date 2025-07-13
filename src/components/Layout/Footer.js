import React from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, MessageCircle, Instagram, Facebook, Twitter } from 'lucide-react';

const Footer = () => {
  const handleWhatsApp = () => {
    window.open('https://wa.me/917895108392?text=Hi! I would like to know more about chess coaching.', '_blank');
  };

  return (
    <footer className="bg-gradient-to-b from-primary-800 to-primary-900 text-white">
      <div className="container-max">
        <div className="py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Company Info */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <img 
                  src="/logo.jpg" 
                  alt="PawnsPoses Logo" 
                  className="w-10 h-10 object-contain rounded-lg"
                />
                <span className="text-2xl font-bold">PawnsPoses</span>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">
                Professional chess coaching for all ages and skill levels. 
                Learn from expert coaches and master the game of chess.
              </p>
              <div className="flex space-x-3">
                <a href="#" className="text-gray-400 hover:text-white transition-colors">
                  <Facebook size={20} />
                </a>
                <a href="https://www.instagram.com/pawnsposes/" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                  <Instagram size={20} />
                </a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors">
                  <Twitter size={20} />
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Quick Links</h3>
              <ul className="space-y-2">
                <li>
                  <Link to="/" className="text-gray-400 hover:text-white transition-colors">
                    Home
                  </Link>
                </li>
                <li>
                  <Link to="/about" className="text-gray-400 hover:text-white transition-colors">
                    About Us
                  </Link>
                </li>
                <li>
                  <Link to="/gallery" className="text-gray-400 hover:text-white transition-colors">
                    Gallery
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="text-gray-400 hover:text-white transition-colors">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>

            {/* Services */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Our Services</h3>
              <ul className="space-y-2 text-gray-400">
                <li>• Individual Chess Coaching</li>
                <li>• Group Classes</li>
                <li>• Tournament Preparation</li>
                <li>• Online Chess Lessons</li>
                <li>• Chess Strategy Training</li>
              </ul>
            </div>

            {/* Contact Info */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Contact Info</h3>
              <div className="space-y-3">
                <div className="flex items-center space-x-3 text-gray-400">
                  <Phone size={18} />
                  <div>
                    <a href="tel:+91 7895108392" className="hover:text-white transition-colors">
                      +91 7895108392
                    </a>
                    <br />
                    
                  </div>
                </div>
                <div className="flex items-center space-x-3 text-gray-400">
                  <Mail size={18} />
                  <a href="mailto:info@pawnsposes.com" className="hover:text-white transition-colors">
                    info@pawnsposes.com
                  </a>
                </div>
                <div className="flex items-start space-x-3 text-gray-400">
                  <MapPin size={18} className="mt-1" />
                  <span>Mumbai, Maharashtra, India</span>
                </div>
              </div>
              <button
                onClick={handleWhatsApp}
                className="flex items-center space-x-2 w-full bg-gradient-to-r from-secondary-500 to-secondary-600 hover:from-secondary-600 hover:to-secondary-700 text-white px-4 py-2 rounded-lg transition-all duration-200 transform hover:scale-105"
              >
                <MessageCircle size={18} />
                <span>WhatsApp Us</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-700 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-gray-400 text-sm">
              © 2024 PawnsPoses Chess Coaching. All rights reserved.
            </p>
            <div className="flex space-x-6 text-sm text-gray-400">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-white transition-colors">Refund Policy</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;