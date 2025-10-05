---
description: Repository Information Overview
alwaysApply: true
---

# PawnsPoses Chess Coaching Information

## Summary
A modern, responsive chess coaching website built with React for PawnsPoses chess coaching academy. This project delivers a complete application with features including responsive design, email integration via EmailJS, registration system, photo gallery, WhatsApp integration, and a modern UI. The application also includes chess analysis features with Supabase integration for authentication and report storage.

## Structure
- **src/**: React application source code (components, pages, services, utils)
- **public/**: Static assets, chess opening data, tactics data, and Stockfish engine
- **scripts/**: Build scripts for chess data shards
- **server/**: Simple Express server for API functionality
- **build/**: Production build output directory

## Language & Runtime
**Language**: JavaScript (React)
**Version**: React 18
**Build System**: Create React App
**Package Manager**: npm

## Dependencies
**Main Dependencies**:
- React 18.2.0 - Modern UI framework
- @supabase/supabase-js 2.58.0 - Database and authentication
- chess.js 1.4.0 - Chess logic and move validation
- framer-motion 10.12.4 - Animations
- html2canvas 1.4.1 & jspdf 3.0.3 - PDF generation
- react-router-dom 6.8.1 - Client-side routing
- @emailjs/browser 4.4.1 - Email service integration

**Development Dependencies**:
- tailwindcss 3.3.0 - Utility-first CSS framework
- postcss 8.4.21 - CSS processing
- autoprefixer 10.4.14 - CSS compatibility

## Build & Installation
```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build
```

## Database
**Type**: Supabase (PostgreSQL)
**Configuration**: 
- Authentication via Supabase Auth
- Reports table with Row Level Security
- User-specific data access policies

**Setup**:
```sql
CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  game_count INTEGER DEFAULT 0,
  analysis_data JSONB NOT NULL,
  summary_metrics JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## External Services
**Email**: EmailJS integration for form submissions
- Registration form template
- Contact form template
- Direct Gmail delivery

**APIs**:
- Gemini AI API for chess analysis
- YouTube API for related content
- Supabase API for database operations

## Main Components
**Chess Analysis**:
- Stockfish integration for move analysis
- Mistake identification and improvement suggestions
- Opening, tactical, and endgame analysis
- PDF report generation

**User Interface**:
- Responsive design for all devices
- Dark mode support
- Interactive chessboard
- Form validation with React Hook Form

## Testing
**Framework**: React Testing Library
**Test Command**:
```bash
npm test
```