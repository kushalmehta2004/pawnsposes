@echo off
echo ========================================
echo    PawnsPoses Chess Coaching Setup
echo ========================================
echo.

echo [1/4] Installing frontend dependencies...
call npm install

echo.
echo [2/4] Installing backend dependencies...
cd server
call npm install
cd ..

echo.
echo [3/4] Creating environment file...
if not exist "server\.env" (
    echo # Copy this template and update with your values > server\.env
    echo MONGODB_URI=mongodb://localhost:27017/pawns-poses >> server\.env
    echo JWT_SECRET=your-super-secret-jwt-key-here >> server\.env
    echo JWT_EXPIRES_IN=7d >> server\.env
    echo PORT=5000 >> server\.env
    echo NODE_ENV=development >> server\.env
    echo ADMIN_EMAIL=admin@pawnsposes.com >> server\.env
    echo ADMIN_PASSWORD=admin123 >> server\.env
    echo CLOUDINARY_CLOUD_NAME=your-cloud-name >> server\.env
    echo CLOUDINARY_API_KEY=your-api-key >> server\.env
    echo CLOUDINARY_API_SECRET=your-api-secret >> server\.env
    echo EMAIL_HOST=smtp.gmail.com >> server\.env
    echo EMAIL_PORT=587 >> server\.env
    echo EMAIL_USER=your-email@gmail.com >> server\.env
    echo EMAIL_PASS=your-app-password >> server\.env
    echo EMAIL_FROM=noreply@pawnsposes.com >> server\.env
    echo.
    echo ✓ Created server\.env template
) else (
    echo ✓ Environment file already exists
)

echo.
echo [4/4] Setting up database...
cd server
node setup.js
cd ..

echo.
echo ========================================
echo           SETUP COMPLETE!
echo ========================================
echo.
echo IMPORTANT: Update server\.env with your actual:
echo   - MongoDB connection string
echo   - Cloudinary credentials  
echo   - Email settings
echo.
echo To start the application:
echo   npm run dev (both frontend + backend)
echo.
echo Access points:
echo   Website: http://localhost:3000
echo   Admin: http://localhost:5000/admin
echo   API: http://localhost:5000/api
echo.
echo Default admin login:
echo   Email: admin@pawnsposes.com
echo   Password: admin123
echo.
pause