import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import Header from './components/Layout/Header';
import Footer from './components/Layout/Footer';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import About from './pages/About';
import Gallery from './pages/Gallery';
import Contact from './pages/Contact';
import Auth from './pages/Auth';
import Reports from './pages/Reports';
import ReportDisplay from './pages/ReportDisplay';
import FullReport from './pages/FullReport';
import MyReports from './pages/MyReports';
import PuzzlePage from './pages/PuzzlePage';
import Pricing from './pages/Pricing';
import PuzzleDataTest from './components/PuzzleDataTest';
import MistakeAnalysisTest from './components/MistakeAnalysisTest';
import Phase2Summary from './components/Phase2Summary';
import ProfileTest from './components/ProfileTest';
import DarkModeToggle from './components/DarkModeToggle';
import './App.css';

// Renders the floating toggle only on the specified routes
const ThemeToggleOnRoutes = () => {
  const location = useLocation();
  const p = location.pathname;
  const isAllowed = p === '/report-display' || p === '/full-report' || p === '/my-reports' || p.startsWith('/puzzle/');

  // Guard: ensure dark class is removed when navigating away from allowed routes
  useEffect(() => {
    if (!isAllowed) {
      document.body.classList.remove('dark-mode');
    }
  }, [isAllowed]);

  return isAllowed ? <DarkModeToggle /> : null;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App mobile-safe">
          <ScrollToTop />
          <Header />
          <main className="mobile-safe">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/gallery" element={<Gallery />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reports" element={
                <ProtectedRoute>
                  <Reports />
                </ProtectedRoute>
              } />
              <Route path="/report-display" element={
                <ProtectedRoute>
                  <ReportDisplay />
                </ProtectedRoute>
              } />
              <Route path="/full-report" element={
                <ProtectedRoute>
                  <FullReport />
                </ProtectedRoute>
              } />
              <Route path="/my-reports" element={
                <ProtectedRoute>
                  <MyReports />
                </ProtectedRoute>
              } />
              <Route path="/puzzle/:puzzleType" element={<PuzzlePage />} />
              <Route path="/puzzle-test" element={<PuzzleDataTest />} />
              <Route path="/mistake-analysis-test" element={<MistakeAnalysisTest />} />
              <Route path="/phase2-summary" element={<Phase2Summary />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/profile-test" element={<ProfileTest />} />
              <Route path="/contact" element={<Contact />} />
            </Routes>
          </main>
          {/* Floating toggle lives at the app root so it persists and stays fixed */}
          <ThemeToggleOnRoutes />
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
    </AuthProvider>
  );
}

export default App;