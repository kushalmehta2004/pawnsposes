import emailjs from '@emailjs/browser';

// EmailJS configuration
// You'll need to replace these with your actual EmailJS credentials
const EMAILJS_SERVICE_ID = process.env.REACT_APP_EMAILJS_SERVICE_ID || 'YOUR_SERVICE_ID';
const EMAILJS_TEMPLATE_ID_REGISTRATION = process.env.REACT_APP_EMAILJS_TEMPLATE_ID_REGISTRATION || 'YOUR_REGISTRATION_TEMPLATE_ID';
const EMAILJS_TEMPLATE_ID_CONTACT = process.env.REACT_APP_EMAILJS_TEMPLATE_ID_CONTACT || 'YOUR_CONTACT_TEMPLATE_ID';
const EMAILJS_PUBLIC_KEY = process.env.REACT_APP_EMAILJS_PUBLIC_KEY || 'YOUR_PUBLIC_KEY';
const RECIPIENT_EMAIL = process.env.REACT_APP_RECIPIENT_EMAIL || 'kkm080923@gmail.com';

class EmailService {
  constructor() {
    // Initialize EmailJS with your public key
    emailjs.init(EMAILJS_PUBLIC_KEY);
  }

  async sendRegistrationEmail(formData) {
    const templateParams = {
      to_email: RECIPIENT_EMAIL,
      from_name: formData.studentName,
      from_email: formData.email,
      student_name: formData.studentName,
      age_group: formData.ageGroup,
      parent_name: formData.parentName,
      email: formData.email,
      phone: formData.phone,
      class_type: formData.classType,
      experience: formData.experience || 'Not specified',
      submission_date: new Date().toLocaleString(),
      message: `
New Student Registration Details:

Student Name: ${formData.studentName}
Age Group: ${formData.ageGroup}
Parent/Guardian: ${formData.parentName}
Email: ${formData.email}
Phone: ${formData.phone}
Class Type: ${formData.classType}
Chess Experience: ${formData.experience || 'Not specified'}

Registration Date: ${new Date().toLocaleString()}
      `
    };

    try {
      const response = await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID_REGISTRATION,
        templateParams
      );
      console.log('Registration email sent successfully:', response);
      return response;
    } catch (error) {
      console.error('Failed to send registration email:', error);
      throw error;
    }
  }

  async sendContactEmail(formData) {
    const templateParams = {
      to_email: RECIPIENT_EMAIL,
      from_name: formData.name,
      from_email: formData.email,
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      subject: formData.subject,
      message: formData.message,
      submission_date: new Date().toLocaleString(),
      full_message: `
New Contact Form Submission:

Name: ${formData.name}
Email: ${formData.email}
Phone: ${formData.phone}
Subject: ${formData.subject}

Message:
${formData.message}

Submission Date: ${new Date().toLocaleString()}
      `
    };

    try {
      const response = await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID_CONTACT,
        templateParams
      );
      console.log('Contact email sent successfully:', response);
      return response;
    } catch (error) {
      console.error('Failed to send contact email:', error);
      throw error;
    }
  }
}

export default new EmailService();