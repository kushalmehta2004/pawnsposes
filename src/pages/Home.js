import React from 'react';
import Hero from '../components/Home/Hero';
import Features from '../components/Home/Features';
import Gallery from '../components/Home/Gallery';
import Testimonials from '../components/Home/Testimonials';
import Registration from '../components/Home/Registration';

const Home = () => {
  return (
    <div className="min-h-screen">
      <Hero />
      <Features />
      <Gallery />
      <Testimonials />
      <Registration />
    </div>
  );
};

export default Home;