# PawnsPoses Backend Dashboard

A comprehensive backend dashboard for managing the PawnsPoses chess coaching website.

## Features

- **Admin Authentication**: Secure login system with JWT tokens
- **Contact Management**: View and manage contact form submissions
- **Student Management**: Track student registrations and progress
- **Testimonials**: Add, edit, and manage testimonials with image uploads
- **Gallery**: Manage gallery images with categories and tags
- **Dashboard Analytics**: Overview of system statistics and recent activity
- **Image Management**: Cloudinary integration for image storage
- **Email Notifications**: Automated email notifications for contacts and students

## Installation

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or cloud instance)
- Cloudinary account (for image uploads)

### Quick Setup

1. Run the installation script:
   ```bash
   install.bat
   ```

2. Update the `.env` file with your configuration:
   ```env
   MONGODB_URI=your-mongodb-connection-string
   JWT_SECRET=your-jwt-secret-key
   CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
   CLOUDINARY_API_KEY=your-cloudinary-api-key
   CLOUDINARY_API_SECRET=your-cloudinary-api-secret
   EMAIL_HOST=smtp.gmail.com
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password
   ```

3. Start the server:
   ```bash
   npm start
   ```

### Manual Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Setup the database:
   ```bash
   node setup.js
   ```

3. Create uploads directory:
   ```bash
   mkdir uploads
   ```

4. Start the server:
   ```bash
   npm start
   ```

## Usage

### Admin Dashboard

Access the admin dashboard at: `http://localhost:5000/admin`

Default credentials:
- Email: `admin@pawnsposes.com`
- Password: `admin123`

### API Endpoints

#### Authentication
- `POST /api/auth/login` - Admin login
- `GET /api/auth/me` - Get current admin
- `PUT /api/auth/profile` - Update admin profile
- `PUT /api/auth/password` - Change password

#### Contacts
- `GET /api/contact` - Get all contacts (admin)
- `POST /api/contact` - Submit contact form (public)
- `GET /api/contact/:id` - Get contact details
- `PUT /api/contact/:id` - Update contact
- `DELETE /api/contact/:id` - Delete contact

#### Students
- `GET /api/students` - Get all students (admin)
- `POST /api/students` - Register new student (public)
- `GET /api/students/:id` - Get student details
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Delete student

#### Testimonials
- `GET /api/testimonials` - Get testimonials (public)
- `GET /api/testimonials/admin` - Get all testimonials (admin)
- `POST /api/testimonials` - Create testimonial (admin)
- `PUT /api/testimonials/:id` - Update testimonial (admin)
- `DELETE /api/testimonials/:id` - Delete testimonial (admin)

#### Gallery
- `GET /api/gallery` - Get gallery images (public)
- `GET /api/gallery/admin` - Get all gallery images (admin)
- `POST /api/gallery` - Add gallery image (admin)
- `PUT /api/gallery/:id` - Update gallery image (admin)
- `DELETE /api/gallery/:id` - Delete gallery image (admin)

#### Admin
- `GET /api/admin/dashboard` - Get dashboard statistics
- `GET /api/admin/admins` - Get all admins (super admin)
- `POST /api/admin/admins` - Create admin (super admin)
- `PUT /api/admin/admins/:id` - Update admin (super admin)
- `DELETE /api/admin/admins/:id` - Delete admin (super admin)

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | JWT secret key | Yes |
| `JWT_EXPIRES_IN` | JWT expiration time | No (default: 7d) |
| `PORT` | Server port | No (default: 5000) |
| `NODE_ENV` | Environment (development/production) | No |
| `ADMIN_EMAIL` | Default admin email | No |
| `ADMIN_PASSWORD` | Default admin password | No |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | Yes |
| `CLOUDINARY_API_KEY` | Cloudinary API key | Yes |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | Yes |
| `EMAIL_HOST` | SMTP host | Yes |
| `EMAIL_PORT` | SMTP port | No (default: 587) |
| `EMAIL_USER` | SMTP username | Yes |
| `EMAIL_PASS` | SMTP password | Yes |
| `EMAIL_FROM` | From email address | Yes |

## File Structure

```
server/
├── models/           # Database models
├── routes/           # API routes
├── middleware/       # Express middleware
├── utils/            # Utility functions
├── public/admin/     # Admin dashboard files
├── uploads/          # Local file uploads
├── .env              # Environment variables
├── server.js         # Main server file
├── setup.js          # Database setup script
└── README.md         # This file
```

## Security Features

- JWT authentication for admin access
- Password hashing with bcrypt
- Input validation and sanitization
- Rate limiting
- CORS configuration
- Helmet for security headers
- File upload restrictions

## Development

### Running in Development Mode

```bash
npm run dev
```

This will start the server with nodemon for automatic restarts.

### Database Models

- **Admin**: Admin user accounts
- **Contact**: Contact form submissions
- **Student**: Student registrations
- **Testimonial**: Customer testimonials
- **Gallery**: Gallery images

### Adding New Features

1. Create new models in `models/`
2. Create new routes in `routes/`
3. Add middleware if needed in `middleware/`
4. Update the dashboard frontend in `public/admin/`

## Deployment

### Production Setup

1. Set `NODE_ENV=production`
2. Use a production MongoDB instance
3. Configure proper JWT secret
4. Set up Cloudinary for image storage
5. Configure email service
6. Use process manager like PM2

### PM2 Deployment

```bash
npm install -g pm2
pm2 start server.js --name "pawnsposes-backend"
pm2 save
pm2 startup
```

## Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Check MongoDB connection string
   - Ensure MongoDB is running
   - Verify network connectivity

2. **Image Upload Issues**
   - Check Cloudinary credentials
   - Verify file permissions
   - Check file size limits

3. **Email Not Sending**
   - Verify SMTP credentials
   - Check email service settings
   - Ensure firewall allows SMTP

### Logs

Check server logs for detailed error information:
```bash
pm2 logs pawnsposes-backend
```

## Support

For support and questions, please contact the development team or create an issue in the project repository.

## License

This project is licensed under the ISC License.