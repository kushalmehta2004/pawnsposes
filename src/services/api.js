const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? process.env.REACT_APP_API_URL || 'http://localhost:5000'
  : 'http://localhost:5000';

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Testimonials
  async getTestimonials(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const endpoint = `/api/testimonials${queryParams ? `?${queryParams}` : ''}`;
    return this.request(endpoint);
  }

  async getFeaturedTestimonials() {
    return this.getTestimonials({ featured: 'true', limit: 6 });
  }

  // Gallery
  async getGalleryImages(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const endpoint = `/api/gallery${queryParams ? `?${queryParams}` : ''}`;
    return this.request(endpoint);
  }

  async getGalleryCategories() {
    return this.request('/api/gallery/categories');
  }

  async getFeaturedGalleryImages() {
    return this.getGalleryImages({ featured: 'true', limit: 8 });
  }

  // Contact
  async submitContact(contactData) {
    return this.request('/api/contact', {
      method: 'POST',
      body: JSON.stringify(contactData),
    });
  }

  // Students
  async registerStudent(studentData) {
    return this.request('/api/students', {
      method: 'POST',
      body: JSON.stringify(studentData),
    });
  }

  // Health check
  async healthCheck() {
    return this.request('/api/health');
  }
}

export default new ApiService();