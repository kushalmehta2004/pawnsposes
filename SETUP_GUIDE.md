# PawnsPoses Chess Coaching - Complete Setup Guide

## Quick Start (5 minutes!)

### 1. Install Dependencies
```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
```

### 2. Setup Environment
Create `server/.env` file:
```env
# Database
MONGODB_URI=mongodb://localhost:27017/pawns-poses

# JWT
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=7d

# Server
PORT=5000
NODE_ENV=development

# Admin Credentials
ADMIN_EMAIL=admin@pawnsposes.com
ADMIN_PASSWORD=admin123

# Cloudinary (for image uploads) - Get from cloudinary.com
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Email (Gmail example)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@pawnsposes.com
```

### 3. Setup Database
```bash
cd server
node setup.js
cd ..
```

### 4. Run the Application
```bash
# Option 1: Run both frontend and backend together
npm run dev

# Option 2: Run separately
# Terminal 1 - Backend
npm run server:dev

# Terminal 2 - Frontend  
npm start
```

## Access Points

- **Website**: http://localhost:3000
- **Admin Dashboard**: http://localhost:5000/admin
- **API**: http://localhost:5000/api

## Default Admin Login
- **Email**: admin@pawnsposes.com
- **Password**: admin123

## Features Available

✅ **Frontend Website**
- Home page with hero section
- About us page
- Contact form (connects to backend)
- Student registration (connects to backend)
- Testimonials (loads from backend)
- Gallery (loads from backend)
- Responsive design

✅ **Backend Dashboard**
- Admin authentication
- Contact management
- Student management  
- Testimonials CRUD
- Gallery CRUD
- Image uploads (Cloudinary)
- Email notifications

✅ **Database Integration**
- MongoDB with Mongoose
- Proper data models
- Validation and security

## Important Notes

1. **MongoDB**: Make sure MongoDB is running on your system
2. **Cloudinary**: Sign up at cloudinary.com for image uploads
3. **Email**: Use app password for Gmail (not regular password)
4. **Environment**: Update .env with your actual credentials

## Troubleshooting

**Can't connect to database?**
- Ensure MongoDB is running: `mongod`
- Check connection string in .env

**Images not uploading?**
- Verify Cloudinary credentials
- Check file size limits

**Emails not sending?**
- Use app password for Gmail
- Check firewall settings

## Production Deployment

1. Update environment variables for production
2. Set up MongoDB Atlas or production database
3. Configure Cloudinary for production
4. Set up proper email service
5. Use PM2 or similar for process management

## Need Help?

Check the logs:
- Frontend: Browser console
- Backend: Terminal output
- Database: MongoDB logs

## File Structure
```
PawnsPoses/
├── src/                 # React frontend
├── server/             # Node.js backend
│   ├── models/         # Database models
│   ├── routes/         # API routes
│   ├── middleware/     # Express middleware
│   ├── public/admin/   # Admin dashboard
│   └── uploads/        # File uploads
├── .env               # Frontend environment
└── server/.env       # Backend environment
```

🚀 **You're all set! Your chess coaching website is ready to use!**