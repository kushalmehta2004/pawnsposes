import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/dark-mode.css';
import App from './App';

// Apply saved theme preference early, but only on allowed routes
try {
  const saved = window.localStorage.getItem('theme');
  const p = window.location.pathname || '';
  const isAllowedRoute = (
    p === '/report-display' ||
    p === '/full-report' ||
    p.startsWith('/puzzle/')
  );

  if (isAllowedRoute && saved === 'dark') {
    document.body.classList.add('dark-mode');
  } else {
    // Ensure dark mode is OFF on disallowed routes or when explicitly light
    document.body.classList.remove('dark-mode');
  }
} catch {}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);