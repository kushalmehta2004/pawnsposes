const nodemailer = require('nodemailer');

// Create reusable transporter object using SMTP transport
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

const sendContactEmail = async (contactData) => {
  const transporter = createTransporter();
  
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_USER,
    subject: `New Contact Form Submission: ${contactData.subject}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333; border-bottom: 2px solid #4f46e5; padding-bottom: 10px;">
          New Contact Form Submission
        </h2>
        
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #4f46e5; margin-top: 0;">Contact Details</h3>
          <p><strong>Name:</strong> ${contactData.name}</p>
          <p><strong>Email:</strong> ${contactData.email}</p>
          <p><strong>Phone:</strong> ${contactData.phone || 'Not provided'}</p>
          <p><strong>Subject:</strong> ${contactData.subject}</p>
        </div>
        
        <div style="background-color: #fff; padding: 20px; border-left: 4px solid #4f46e5; margin: 20px 0;">
          <h3 style="color: #333; margin-top: 0;">Message</h3>
          <p style="line-height: 1.6; color: #555;">${contactData.message}</p>
        </div>
        
        <div style="text-align: center; margin-top: 30px; padding: 20px; background-color: #f3f4f6; border-radius: 8px;">
          <p style="color: #666; font-size: 14px;">
            This email was sent from the PawnsPoses website contact form.
          </p>
          <p style="color: #666; font-size: 12px;">
            Submitted on: ${new Date().toLocaleString()}
          </p>
        </div>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Contact email sent: ', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending contact email:', error);
    throw error;
  }
};

const sendWelcomeEmail = async (studentData) => {
  const transporter = createTransporter();
  
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: studentData.email,
    subject: 'Welcome to PawnsPoses Chess Coaching!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Welcome to PawnsPoses! ♟️</h1>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.9;">Your Chess Journey Begins Here</p>
        </div>
        
        <div style="padding: 30px; background-color: #fff; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <h2 style="color: #333; margin-top: 0;">Hello ${studentData.name}!</h2>
          
          <p style="color: #555; line-height: 1.6;">
            Thank you for your interest in our chess coaching program. We're excited to help you develop your chess skills and strategic thinking abilities.
          </p>
          
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #4f46e5; margin-top: 0;">What's Next?</h3>
            <ul style="color: #555; line-height: 1.6;">
              <li>Our team will contact you within 24 hours to discuss your chess goals</li>
              <li>We'll schedule a free demo session at your convenience</li>
              <li>You'll receive a personalized learning plan based on your skill level</li>
              <li>Get access to our exclusive chess resources and materials</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://wa.me/919320444221" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Chat with Us on WhatsApp
            </a>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding: 20px; background-color: #f3f4f6; border-radius: 8px;">
            <p style="color: #666; font-size: 14px; margin: 0;">
              Have questions? Feel free to reach out to us anytime!
            </p>
            <p style="color: #4f46e5; font-weight: bold; margin: 5px 0 0 0;">
              📧 info@pawnsposes.com | 📞 +91 9906958392
            </p>
          </div>
        </div>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent: ', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw error;
  }
};

module.exports = {
  sendContactEmail,
  sendWelcomeEmail
};