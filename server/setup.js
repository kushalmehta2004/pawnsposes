const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

async function setupDatabase() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pawns-poses', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        console.log('Connected to MongoDB');
        
        // Check if admin already exists
        const existingAdmin = await Admin.findOne({ email: process.env.ADMIN_EMAIL });
        
        if (existingAdmin) {
            console.log('Admin already exists with email:', process.env.ADMIN_EMAIL);
            return;
        }
        
        // Create default admin
        const admin = new Admin({
            name: 'Admin',
            email: process.env.ADMIN_EMAIL || 'admin@pawnsposes.com',
            password: process.env.ADMIN_PASSWORD || 'admin123',
            role: 'superadmin'
        });
        
        await admin.save();
        
        console.log('Default admin created successfully!');
        console.log('Email:', admin.email);
        console.log('Password:', process.env.ADMIN_PASSWORD || 'admin123');
        console.log('Role:', admin.role);
        
    } catch (error) {
        console.error('Setup error:', error);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed');
    }
}

// Run setup
setupDatabase();