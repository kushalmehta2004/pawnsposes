# Email Setup Guide for PawnsPoses Chess Coaching

This guide will help you set up EmailJS to receive form submissions directly to your Gmail account.

## Step 1: Create EmailJS Account

1. Go to [https://www.emailjs.com/](https://www.emailjs.com/)
2. Sign up for a free account
3. Verify your email address

## Step 2: Add Email Service (Gmail)

1. In your EmailJS dashboard, go to "Email Services"
2. Click "Add New Service"
3. Select "Gmail"
4. Click "Connect Account" and authorize EmailJS to access your Gmail
5. Give your service a name (e.g., "PawnsPoses Gmail")
6. Note down the **Service ID** (you'll need this later)
<!-- service_zjzxzxv -->

## Step 3: Create Email Templates

### Registration Form Template

1. Go to "Email Templates" in your dashboard
2. Click "Create New Template"
3. Use this template content:

**Subject:** New Chess Class Registration - {{student_name}}

**Content:**
```
New Student Registration Details:

Student Name: {{student_name}}
Age Group: {{age_group}}
Parent/Guardian: {{parent_name}}
Email: {{email}}
Phone: {{phone}}
Class Type: {{class_type}}
Chess Experience: {{experience}}

Registration Date: {{submission_date}}

---
This email was sent from the PawnsPoses website registration form.
Reply to: {{from_email}}
```

4. Save the template and note down the **Template ID**
<!-- template_skvayqf -->



### Contact Form Template

1. Create another new template
2. Use this template content:

**Subject:** Contact Form: {{subject}} - {{name}}

**Content:**
```
New Contact Form Submission:

Name: {{name}}
Email: {{email}}
Phone: {{phone}}
Subject: {{subject}}

Message:
{{message}}

Submission Date: {{submission_date}}

---
This email was sent from the PawnsPoses website contact form.
Reply to: {{from_email}}
```

3. Save the template and note down the **Template ID**
<!-- template_cs4vlkm -->


## Step 4: Get Your Public Key

1. Go to "Account" in your EmailJS dashboard
2. Find your **Public Key** (also called User ID)
<!-- UZTHIgB0fgIvkp5t0 -->
3. Note it down

## Step 5: Configure Environment Variables

1. Create a `.env` file in your project root (copy from `.env.example`)
2. Fill in your EmailJS credentials:

```env
# EmailJS Configuration
REACT_APP_EMAILJS_SERVICE_ID=your_service_id_here
REACT_APP_EMAILJS_TEMPLATE_ID_REGISTRATION=your_registration_template_id_here
REACT_APP_EMAILJS_TEMPLATE_ID_CONTACT=your_contact_template_id_here
REACT_APP_EMAILJS_PUBLIC_KEY=your_public_key_here

# Your Gmail address where you want to receive emails
REACT_APP_RECIPIENT_EMAIL=your-email@gmail.com
```

## Step 6: Update Email Service File

1. Open `src/services/emailService.js`
2. Replace `'your-email@gmail.com'` with your actual Gmail address if you haven't set the environment variable

## Step 7: Test the Setup

1. Start your development server: `npm start`
2. Fill out the registration form or contact form
3. Check your Gmail inbox for the test email
4. If you don't receive emails, check:
   - EmailJS dashboard for any error logs
   - Browser console for JavaScript errors
   - Spam folder in Gmail

## Troubleshooting

### Common Issues:

1. **Emails not received:**
   - Check spam folder
   - Verify all environment variables are correct
   - Check EmailJS dashboard for error logs

2. **Template variables not working:**
   - Make sure template variable names match exactly (case-sensitive)
   - Check that form field names match template variables

3. **Service blocked:**
   - EmailJS free tier has limits (200 emails/month)
   - Upgrade to paid plan if needed

### EmailJS Free Tier Limits:
- 200 emails per month
- 2 email services
- 2 email templates
- EmailJS branding in emails

## Security Notes

- Never commit your `.env` file to version control
- Keep your EmailJS credentials secure
- Consider upgrading to paid plan for production use
- Monitor your email usage in EmailJS dashboard

## Support

If you encounter issues:
1. Check EmailJS documentation: [https://www.emailjs.com/docs/](https://www.emailjs.com/docs/)
2. Check browser console for errors
3. Verify all credentials are correct
4. Test with a simple form first

---

Once setup is complete, your forms will send emails directly to your Gmail without needing a backend server!