# PawnsPoses Chess Coaching Website

A modern, responsive chess coaching website built with React. This frontend-only application sends form submissions directly to your Gmail using EmailJS - no backend required!

## 🎯 Features

- **Modern Design**: Clean, professional design inspired by successful coaching platforms
- **Responsive Layout**: Works perfectly on all devices (desktop, tablet, mobile)
- **Interactive Components**: Smooth animations and transitions using Framer Motion
- **Email Integration**: Forms send directly to your Gmail via EmailJS
- **Registration System**: Complete form handling with validation
- **Photo Gallery**: Showcase student achievements and coaching moments
- **WhatsApp Integration**: Direct booking and contact via WhatsApp
- **Contact Forms**: Multiple ways for customers to get in touch
- **SEO Optimized**: Clean URL structure and meta tags
- **Performance Optimized**: Fast loading and smooth interactions

## 🚀 Tech Stack

- **React 18**: Modern React with hooks
- **React Router**: Client-side routing
- **Tailwind CSS**: Utility-first CSS framework
- **Framer Motion**: Smooth animations and transitions
- **React Hook Form**: Form handling and validation
- **React Hot Toast**: Toast notifications
- **Lucide React**: Beautiful icons
- **EmailJS**: Frontend email service for form submissions

## 📁 Project Structure

```
src/
├── components/
│   ├── Home/
│   │   ├── Hero.js
│   │   ├── Features.js
│   │   ├── Gallery.js
│   │   ├── Registration.js
│   │   └── Testimonials.js
│   └── Layout/
│       ├── Header.js
│       └── Footer.js
├── pages/
│   ├── Home.js
│   ├── About.js
│   ├── Gallery.js
│   └── Contact.js
├── App.js
├── App.css
├── index.js
└── index.css
```

## 🛠️ Installation & Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd PawnsPoses
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure EmailJS**
   - Follow the detailed setup guide in `EMAIL_SETUP_GUIDE.md`
   - Update the `.env` file with your EmailJS credentials
   - Replace placeholder email addresses with your Gmail

4. **Start the development server**
   ```bash
   npm start
   ```

5. **Build for production**
   ```bash
   npm run build
   ```

## 🎨 Customization

### Colors
The website uses a custom color palette defined in `tailwind.config.js`:
- **Primary**: Blue shades for main elements
- **Secondary**: Yellow/Orange for accents
- **Dark**: Gray shades for text and backgrounds

### Contact Information
Update contact details in:
- `src/components/Layout/Header.js`
- `src/components/Layout/Footer.js`
- `src/pages/Contact.js`

### WhatsApp Integration
Update WhatsApp numbers in:
- `src/components/Layout/Header.js`
- `src/components/Home/Hero.js`
- `src/components/Home/Registration.js`

## 📱 Pages Overview

### Home Page
- **Hero Section**: Eye-catching banner with call-to-action
- **Features**: Why choose PawnsPoses
- **Gallery**: Student achievements showcase
- **Testimonials**: Parent and student reviews
- **Registration**: Sign-up form for classes

### About Page
- **Mission & Vision**: Company values and goals
- **Coach Profiles**: Meet the expert coaches
- **Stats**: Achievement numbers
- **Values**: Core principles

### Gallery Page
- **Filterable Gallery**: Photos by category
- **Modal View**: Full-size image viewing
- **Achievement Highlights**: Success stories

### Contact Page
- **Contact Form**: Multiple inquiry types
- **Contact Information**: All ways to reach out
- **FAQ**: Common questions answered
- **Social Media**: Links to social profiles

## 📧 Email Integration

The website uses EmailJS to send form submissions directly to your Gmail:

### Form Handling
- Registration form sends student details to your email
- Contact form sends inquiries to your email
- All forms use React Hook Form for validation
- Error handling and success notifications implemented

### Email Templates
- Separate templates for registration and contact forms
- Professional formatting with all form data
- Automatic reply-to functionality
- Submission timestamps included

### Setup Requirements
- EmailJS account (free tier available)
- Gmail account for receiving emails
- Environment variables configuration
- Template setup in EmailJS dashboard

## 🌟 Future Enhancements

### Phase 1 (Backend Integration)
- [ ] User authentication
- [ ] Student dashboard
- [ ] Payment integration
- [ ] Booking system
- [ ] Admin panel

### Phase 2 (Advanced Features)
- [ ] Online chess board
- [ ] Video lessons
- [ ] Progress tracking
- [ ] Tournament management
- [ ] Mobile app

### Phase 3 (Scaling)
- [ ] Multi-language support
- [ ] Advanced analytics
- [ ] AI-powered features
- [ ] Franchise management

## 📞 Support

For technical support or questions about the website:
- **Email**: info@pawnsposes.com
- **WhatsApp**: +91 9906958392
- **Phone**: +919320444221

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🎯 Business Goals

This website is designed to:
- **Attract Students**: Professional appearance builds trust
- **Showcase Success**: Gallery and testimonials prove results
- **Easy Registration**: Simple forms reduce friction
- **Multiple Contact Options**: WhatsApp, phone, email, forms
- **Mobile-First**: Most parents browse on mobile
- **SEO Optimized**: Better search engine visibility

## 🔮 Roadmap

### Q1 2024
- [ ] Launch MVP website
- [ ] Integrate with Google Analytics
- [ ] Add blog section
- [ ] Implement SEO improvements

### Q2 2024
- [ ] Add backend with user accounts
- [ ] Implement online payment
- [ ] Add booking calendar
- [ ] Mobile app development

### Q3 2024
- [ ] Launch mobile app
- [ ] Add online chess lessons
- [ ] Implement progress tracking
- [ ] Add tournament features

---

Built with ❤️ for chess education and student success.