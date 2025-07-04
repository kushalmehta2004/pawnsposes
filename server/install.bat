@echo off
echo Installing PawnsPoses Backend Dashboard...
echo.

echo Installing Node.js dependencies...
call npm install

echo.
echo Setting up database...
node setup.js

echo.
echo Creating uploads directory...
if not exist "uploads" mkdir uploads

echo.
echo Installation complete!
echo.
echo To start the server:
echo   npm start (production)
echo   npm run dev (development)
echo.
echo Admin Dashboard URL: http://localhost:5000/admin
echo.
echo Default Admin Credentials:
echo   Email: admin@pawnsposes.com
echo   Password: admin123
echo.
echo IMPORTANT: Please update the .env file with your actual configuration!
echo.
pause