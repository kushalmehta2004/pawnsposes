import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Header from './components/Layout/Header';
import Footer from './components/Layout/Footer';
import ScrollToTop from './components/ScrollToTop';
import Home from './pages/Home';
import About from './pages/About';
import Gallery from './pages/Gallery';
import Contact from './pages/Contact';
import Reports from './pages/Reports';
import ReportDisplay from './pages/ReportDisplay';
import FullReport from './pages/FullReport';
import PuzzlePage from './pages/PuzzlePage';
import PuzzleDataTest from './components/PuzzleDataTest';
import MistakeAnalysisTest from './components/MistakeAnalysisTest';
import Phase2Summary from './components/Phase2Summary';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App mobile-safe">
        <ScrollToTop />
        <Header />
        <main className="mobile-safe">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/report-display" element={<ReportDisplay />} />
            <Route path="/full-report" element={<FullReport />} />
            <Route path="/puzzle/:puzzleType" element={<PuzzlePage />} />
            <Route path="/puzzle-test" element={<PuzzleDataTest />} />
            <Route path="/mistake-analysis-test" element={<MistakeAnalysisTest />} />
            <Route path="/phase2-summary" element={<Phase2Summary />} />
            <Route path="/contact" element={<Contact />} />
          </Routes>
        </main>
        <Footer />
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
          }}
        />
      </div>
    </Router>
  );
}

export default App;