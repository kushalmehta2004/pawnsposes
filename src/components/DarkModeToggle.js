import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

/**
 * Floating Dark Mode Toggle
 * - Adds/removes 'dark-mode' class on <body>
 * - Persists preference in localStorage ('theme' = 'dark' | 'light')
 * - Fixed bottom-left; styled per theme
 */
const DarkModeToggle = () => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Initialize from body class or localStorage
    const saved = (typeof window !== 'undefined') ? window.localStorage.getItem('theme') : null;
    const bodyHas = document.body.classList.contains('dark-mode');
    const initialDark = saved ? saved === 'dark' : bodyHas;
    setIsDark(initialDark);
    if (initialDark) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.body.classList.add('dark-mode');
      try { localStorage.setItem('theme', 'dark'); } catch {}
    } else {
      document.body.classList.remove('dark-mode');
      try { localStorage.setItem('theme', 'light'); } catch {}
    }
  };

  const btnStyle = {
    position: 'fixed',
    left: '16px',
    bottom: '16px',
    width: '48px',
    height: '48px',
    borderRadius: '9999px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 1000,
    border: `1px solid ${isDark ? '#333333' : '#e5e7eb'}`,
    background: isDark ? '#2C2C2C' : '#ffffff',
    color: isDark ? '#EAEAEA' : '#1E1E1E',
    boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.12)',
    transition: 'background-color 0.2s ease, transform 0.1s ease',
  };

  const btnHoverStyle = {
    background: isDark ? '#3A3A3A' : '#f3f4f6',
  };

  // Simple hover handling without external CSS
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggleTheme}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...btnStyle, ...(hover ? btnHoverStyle : {}) }}
    >
      {isDark ? <Sun size={22} color="#EAEAEA" /> : <Moon size={22} color="#1E1E1E" />}
    </button>
  );
};

export default DarkModeToggle;