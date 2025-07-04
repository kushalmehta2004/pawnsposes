// Configuration
const API_BASE_URL = window.location.origin;
let currentToken = localStorage.getItem('adminToken');
let currentSection = 'dashboard';
let currentAdmin = null;

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard script loaded');
    console.log('Current token:', currentToken ? 'exists' : 'none');
    
    if (currentToken) {
        validateToken();
    } else {
        showLoginSection();
    }
    
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Navigation tabs - use event delegation
    document.addEventListener('click', function(e) {
        if (e.target.matches('[onclick*="showSection"]')) {
            e.preventDefault();
            const onclickAttr = e.target.getAttribute('onclick');
            const sectionMatch = onclickAttr.match(/showSection\('([^']+)'\)/);
            if (sectionMatch) {
                showSection(sectionMatch[1]);
            }
        }
    });
    
    // Testimonial form
    const testimonialForm = document.getElementById('testimonialForm');
    if (testimonialForm) {
        testimonialForm.addEventListener('submit', handleTestimonialSubmit);
    }
    
    // Gallery form
    const galleryForm = document.getElementById('galleryForm');
    if (galleryForm) {
        galleryForm.addEventListener('submit', handleGallerySubmit);
    }
    
    // Search and filter inputs
    const contactSearch = document.getElementById('contactSearch');
    if (contactSearch) {
        contactSearch.addEventListener('input', debounce(loadContacts, 300));
    }
    
    const contactStatusFilter = document.getElementById('contactStatusFilter');
    if (contactStatusFilter) {
        contactStatusFilter.addEventListener('change', loadContacts);
    }
    
    const studentSearch = document.getElementById('studentSearch');
    if (studentSearch) {
        studentSearch.addEventListener('input', debounce(loadStudents, 300));
    }
    
    const studentStatusFilter = document.getElementById('studentStatusFilter');
    if (studentStatusFilter) {
        studentStatusFilter.addEventListener('change', loadStudents);
    }
    
    // Profile dropdown
    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
        profileBtn.addEventListener('click', toggleProfileDropdown);
    }
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
        const profileDropdown = document.getElementById('profileDropdown');
        if (profileDropdown && !e.target.closest('#profileBtn')) {
            profileDropdown.classList.add('hidden');
        }
    });
    
    // Setup drag and drop for images
    setupDragAndDrop('testimonialImageDrop', 'testimonialImage', 'testimonialImagePreview');
    setupDragAndDrop('galleryImageDrop', 'galleryImage', 'galleryImagePreview');
}

// Authentication functions
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        showLoading();
        
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentToken = data.token;
            currentAdmin = data.admin;
            localStorage.setItem('adminToken', currentToken);
            localStorage.setItem('adminData', JSON.stringify(currentAdmin));
            
            showDashboardSection();
            loadDashboard();
        } else {
            showError('loginError', data.message);
        }
    } catch (error) {
        showError('loginError', 'Login failed. Please try again.');
    } finally {
        hideLoading();
    }
}

async function validateToken() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const admin = await response.json();
            currentAdmin = admin;
            localStorage.setItem('adminData', JSON.stringify(admin));
            
            showDashboardSection();
            loadDashboard();
        } else {
            logout();
        }
    } catch (error) {
        logout();
    }
}

function logout() {
    currentToken = null;
    currentAdmin = null;
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminData');
    showLoginSection();
}

// Section management
function showLoginSection() {
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');
}

function showDashboardSection() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');
    
    // Update admin name
    if (currentAdmin) {
        document.getElementById('adminName').textContent = currentAdmin.name;
    }
}

function showSection(section) {
    console.log('showSection called with:', section);
    currentSection = section;
    
    // Update nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active', 'text-purple-600', 'border-purple-600');
        tab.classList.add('text-gray-500', 'border-transparent');
    });
    
    // Find the clicked tab and update its styling
    const clickedTab = document.querySelector(`[onclick="showSection('${section}')"]`);
    console.log('Found clicked tab:', clickedTab);
    if (clickedTab) {
        clickedTab.classList.add('active', 'text-purple-600', 'border-purple-600');
        clickedTab.classList.remove('text-gray-500', 'border-transparent');
    }
    
    // Show/hide content sections
    document.querySelectorAll('[id$="Content"]').forEach(content => {
        content.classList.add('hidden');
    });
    
    const targetContent = document.getElementById(section + 'Content');
    console.log('Target content element:', targetContent);
    if (targetContent) {
        targetContent.classList.remove('hidden');
    } else {
        console.error('Content section not found:', section + 'Content');
    }
    
    // Load section data
    try {
        switch(section) {
            case 'dashboard':
                loadDashboard();
                break;
            case 'contacts':
                loadContacts();
                break;
            case 'students':
                loadStudents();
                break;
            case 'testimonials':
                loadTestimonials();
                break;
            case 'gallery':
                loadGallery();
                break;
            default:
                console.error('Unknown section:', section);
        }
    } catch (error) {
        console.error('Error loading section data:', error);
        // Continue anyway - don't let data loading errors break navigation
    }
}

// Make showSection globally available for debugging
window.showSection = showSection;

// Debug function to test navigation
window.testNavigation = function() {
    console.log('Testing navigation...');
    const sections = ['dashboard', 'contacts', 'students', 'testimonials', 'gallery'];
    
    sections.forEach((section, index) => {
        setTimeout(() => {
            console.log(`Testing ${section}...`);
            showSection(section);
        }, index * 1000);
    });
};

// Dashboard functions
async function loadDashboard() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/dashboard`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Update stats
            document.getElementById('totalContacts').textContent = data.stats.totalContacts;
            document.getElementById('newContacts').textContent = data.stats.newContacts;
            document.getElementById('totalStudents').textContent = data.stats.totalStudents;
            document.getElementById('activeStudents').textContent = data.stats.activeStudents;
            
            // Update recent activity
            updateRecentContacts(data.recentActivity.contacts);
            updateRecentStudents(data.recentActivity.students);
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

function updateRecentContacts(contacts) {
    const container = document.getElementById('recentContacts');
    container.innerHTML = '';
    
    if (contacts.length === 0) {
        container.innerHTML = '<p class="text-gray-500">No recent contacts</p>';
        return;
    }
    
    contacts.forEach(contact => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg';
        div.innerHTML = `
            <div>
                <div class="font-medium text-gray-900">${contact.name}</div>
                <div class="text-sm text-gray-500">${contact.subject}</div>
            </div>
            <div class="text-right">
                <div class="text-sm text-gray-500">${formatDate(contact.createdAt)}</div>
                <span class="status-badge status-${contact.status}">${contact.status}</span>
            </div>
        `;
        container.appendChild(div);
    });
}

function updateRecentStudents(students) {
    const container = document.getElementById('recentStudents');
    container.innerHTML = '';
    
    if (students.length === 0) {
        container.innerHTML = '<p class="text-gray-500">No recent students</p>';
        return;
    }
    
    students.forEach(student => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg';
        div.innerHTML = `
            <div>
                <div class="font-medium text-gray-900">${student.name}</div>
                <div class="text-sm text-gray-500">${student.phone}</div>
            </div>
            <div class="text-right">
                <div class="text-sm text-gray-500">${formatDate(student.createdAt)}</div>
                <span class="status-badge status-${student.status}">${student.status}</span>
            </div>
        `;
        container.appendChild(div);
    });
}

// Contacts functions
async function loadContacts(page = 1) {
    try {
        console.log('Loading contacts...');
        const searchElement = document.getElementById('contactSearch');
        const statusElement = document.getElementById('contactStatusFilter');
        
        const search = searchElement ? searchElement.value : '';
        const status = statusElement ? statusElement.value : '';
        
        const params = new URLSearchParams({
            page,
            limit: 10,
            ...(search && { search }),
            ...(status && { status })
        });
        
        const response = await fetch(`${API_BASE_URL}/api/contact?${params}`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Contacts loaded:', data);
            updateContactsTable(data.contacts || []);
            updatePagination('contactsPagination', data.currentPage, data.totalPages, loadContacts);
        } else {
            console.error('Failed to load contacts:', response.status, response.statusText);
            const errorData = await response.json().catch(() => ({}));
            console.error('Error details:', errorData);
        }
    } catch (error) {
        console.error('Error loading contacts:', error);
    }
}

function updateContactsTable(contacts) {
    const tbody = document.getElementById('contactsList');
    tbody.innerHTML = '';
    
    contacts.forEach(contact => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="font-medium">${contact.name}</td>
            <td>${contact.email}</td>
            <td>${contact.subject}</td>
            <td><span class="status-badge status-${contact.status}">${contact.status}</span></td>
            <td>${formatDate(contact.createdAt)}</td>
            <td>
                <button onclick="viewContact('${contact._id}')" class="btn-secondary">
                    <i class="fas fa-eye"></i>
                </button>
                <button onclick="deleteContact('${contact._id}')" class="btn-danger">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function viewContact(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/contact/${id}`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const contact = await response.json();
            showContactDetails(contact);
        }
    } catch (error) {
        console.error('Error loading contact:', error);
    }
}

function showContactDetails(contact) {
    const detailsDiv = document.getElementById('contactDetails');
    detailsDiv.innerHTML = `
        <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="form-label">Name</label>
                    <p class="font-medium">${contact.name}</p>
                </div>
                <div>
                    <label class="form-label">Email</label>
                    <p class="font-medium">${contact.email}</p>
                </div>
                <div>
                    <label class="form-label">Phone</label>
                    <p class="font-medium">${contact.phone || 'N/A'}</p>
                </div>
                <div>
                    <label class="form-label">Status</label>
                    <select id="contactStatus" class="form-select">
                        <option value="new" ${contact.status === 'new' ? 'selected' : ''}>New</option>
                        <option value="read" ${contact.status === 'read' ? 'selected' : ''}>Read</option>
                        <option value="replied" ${contact.status === 'replied' ? 'selected' : ''}>Replied</option>
                        <option value="resolved" ${contact.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                    </select>
                </div>
            </div>
            
            <div>
                <label class="form-label">Subject</label>
                <p class="font-medium">${contact.subject}</p>
            </div>
            
            <div>
                <label class="form-label">Message</label>
                <div class="bg-gray-50 p-4 rounded-lg">
                    <p class="whitespace-pre-wrap">${contact.message}</p>
                </div>
            </div>
            
            <div>
                <label class="form-label">Notes</label>
                <textarea id="contactNotes" class="form-textarea" placeholder="Add your notes here...">${contact.notes || ''}</textarea>
            </div>
            
            <div class="flex justify-end space-x-4">
                <button onclick="updateContact('${contact._id}')" class="btn-primary">Update</button>
                <button onclick="closeModal('contactModal')" class="btn-secondary">Close</button>
            </div>
        </div>
    `;
    
    showModal('contactModal');
}

async function updateContact(id) {
    try {
        const status = document.getElementById('contactStatus').value;
        const notes = document.getElementById('contactNotes').value;
        
        const response = await fetch(`${API_BASE_URL}/api/contact/${id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status, notes })
        });
        
        if (response.ok) {
            closeModal('contactModal');
            loadContacts();
            showSuccess('Contact updated successfully');
        }
    } catch (error) {
        console.error('Error updating contact:', error);
        showError('', 'Error updating contact');
    }
}

async function deleteContact(id) {
    if (!confirm('Are you sure you want to delete this contact?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/contact/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            loadContacts();
            showSuccess('Contact deleted successfully');
        }
    } catch (error) {
        console.error('Error deleting contact:', error);
        showError('', 'Error deleting contact');
    }
}

// Students functions
async function loadStudents(page = 1) {
    try {
        console.log('Loading students...');
        const searchElement = document.getElementById('studentSearch');
        const statusElement = document.getElementById('studentStatusFilter');
        
        const search = searchElement ? searchElement.value : '';
        const status = statusElement ? statusElement.value : '';
        
        const params = new URLSearchParams({
            page,
            limit: 10,
            ...(search && { search }),
            ...(status && { status })
        });
        
        const response = await fetch(`${API_BASE_URL}/api/students?${params}`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Students loaded:', data);
            updateStudentsTable(data.students || []);
            updatePagination('studentsPagination', data.currentPage, data.totalPages, loadStudents);
        } else {
            console.error('Failed to load students:', response.status, response.statusText);
            const errorData = await response.json().catch(() => ({}));
            console.error('Error details:', errorData);
        }
    } catch (error) {
        console.error('Error loading students:', error);
    }
}

function updateStudentsTable(students) {
    const tbody = document.getElementById('studentsList');
    tbody.innerHTML = '';
    
    students.forEach(student => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="font-medium">${student.name}</td>
            <td>${student.email}</td>
            <td>${student.phone}</td>
            <td><span class="status-badge status-${student.status}">${student.status}</span></td>
            <td>${student.experience}</td>
            <td>${formatDate(student.createdAt)}</td>
            <td>
                <button onclick="viewStudent('${student._id}')" class="btn-secondary">
                    <i class="fas fa-eye"></i>
                </button>
                <button onclick="deleteStudent('${student._id}')" class="btn-danger">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function viewStudent(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/students/${id}`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const student = await response.json();
            showStudentDetails(student);
        }
    } catch (error) {
        console.error('Error loading student:', error);
    }
}

function showStudentDetails(student) {
    const detailsDiv = document.getElementById('studentDetails');
    detailsDiv.innerHTML = `
        <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="form-label">Name</label>
                    <p class="font-medium">${student.name}</p>
                </div>
                <div>
                    <label class="form-label">Email</label>
                    <p class="font-medium">${student.email}</p>
                </div>
                <div>
                    <label class="form-label">Phone</label>
                    <p class="font-medium">${student.phone}</p>
                </div>
                <div>
                    <label class="form-label">Age</label>
                    <p class="font-medium">${student.age || 'N/A'}</p>
                </div>
                <div>
                    <label class="form-label">Experience</label>
                    <p class="font-medium">${student.experience}</p>
                </div>
                <div>
                    <label class="form-label">Course Type</label>
                    <p class="font-medium">${student.courseType}</p>
                </div>
                <div>
                    <label class="form-label">Status</label>
                    <select id="studentStatus" class="form-select">
                        <option value="inquiry" ${student.status === 'inquiry' ? 'selected' : ''}>Inquiry</option>
                        <option value="trial" ${student.status === 'trial' ? 'selected' : ''}>Trial</option>
                        <option value="enrolled" ${student.status === 'enrolled' ? 'selected' : ''}>Enrolled</option>
                        <option value="active" ${student.status === 'active' ? 'selected' : ''}>Active</option>
                        <option value="inactive" ${student.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>
            </div>
            
            ${student.parentName ? `
                <div>
                    <label class="form-label">Parent Name</label>
                    <p class="font-medium">${student.parentName}</p>
                </div>
            ` : ''}
            
            ${student.goals ? `
                <div>
                    <label class="form-label">Goals</label>
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <p class="whitespace-pre-wrap">${student.goals}</p>
                    </div>
                </div>
            ` : ''}
            
            <div>
                <label class="form-label">Notes</label>
                <textarea id="studentNotes" class="form-textarea" placeholder="Add your notes here...">${student.notes || ''}</textarea>
            </div>
            
            <div class="flex justify-end space-x-4">
                <button onclick="updateStudent('${student._id}')" class="btn-primary">Update</button>
                <button onclick="closeModal('studentModal')" class="btn-secondary">Close</button>
            </div>
        </div>
    `;
    
    showModal('studentModal');
}

async function updateStudent(id) {
    try {
        const status = document.getElementById('studentStatus').value;
        const notes = document.getElementById('studentNotes').value;
        
        const response = await fetch(`${API_BASE_URL}/api/students/${id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status, notes })
        });
        
        if (response.ok) {
            closeModal('studentModal');
            loadStudents();
            showSuccess('Student updated successfully');
        }
    } catch (error) {
        console.error('Error updating student:', error);
        showError('', 'Error updating student');
    }
}

async function deleteStudent(id) {
    if (!confirm('Are you sure you want to delete this student?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/students/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            loadStudents();
            showSuccess('Student deleted successfully');
        }
    } catch (error) {
        console.error('Error deleting student:', error);
        showError('', 'Error deleting student');
    }
}

// Testimonials functions
async function loadTestimonials(page = 1) {
    try {
        console.log('Loading testimonials...');
        const response = await fetch(`${API_BASE_URL}/api/testimonials/admin?page=${page}&limit=10`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Testimonials loaded:', data);
            updateTestimonialsTable(data.testimonials || []);
            updatePagination('testimonialsPagination', data.currentPage, data.totalPages, loadTestimonials);
        } else {
            console.error('Failed to load testimonials:', response.status, response.statusText);
            // Show empty table if testimonials fail to load
            updateTestimonialsTable([]);
        }
    } catch (error) {
        console.error('Error loading testimonials:', error);
        // Show empty table if testimonials fail to load
        updateTestimonialsTable([]);
    }
}

function updateTestimonialsTable(testimonials) {
    const tbody = document.getElementById('testimonialsList');
    tbody.innerHTML = '';
    
    testimonials.forEach(testimonial => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <img src="${testimonial.image.url}" alt="${testimonial.name}" class="w-12 h-12 rounded-full object-cover">
            </td>
            <td class="font-medium">${testimonial.name}</td>
            <td>${testimonial.designation}</td>
            <td>
                <div class="flex items-center">
                    ${Array.from({length: testimonial.rating}, () => '<i class="fas fa-star text-yellow-400"></i>').join('')}
                    ${Array.from({length: 5 - testimonial.rating}, () => '<i class="far fa-star text-gray-300"></i>').join('')}
                </div>
            </td>
            <td><span class="status-badge status-${testimonial.isActive ? 'active' : 'inactive'}">${testimonial.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>${testimonial.featured ? '<i class="fas fa-star text-yellow-400"></i>' : ''}</td>
            <td>
                <button onclick="editTestimonial('${testimonial._id}')" class="btn-secondary">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteTestimonial('${testimonial._id}')" class="btn-danger">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function showAddTestimonial() {
    document.getElementById('testimonialModalTitle').textContent = 'Add Testimonial';
    document.getElementById('testimonialForm').reset();
    document.getElementById('testimonialImagePreview').classList.add('hidden');
    document.getElementById('testimonialForm').removeAttribute('data-edit-id');
    showModal('testimonialModal');
}

async function editTestimonial(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/testimonials/${id}`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const testimonial = await response.json();
            
            document.getElementById('testimonialModalTitle').textContent = 'Edit Testimonial';
            document.getElementById('testimonialName').value = testimonial.name;
            document.getElementById('testimonialDesignation').value = testimonial.designation;
            document.getElementById('testimonialContent').value = testimonial.content;
            document.getElementById('testimonialRating').value = testimonial.rating;
            document.getElementById('testimonialOrder').value = testimonial.order;
            document.getElementById('testimonialFeatured').checked = testimonial.featured;
            document.getElementById('testimonialActive').checked = testimonial.isActive;
            
            // Show current image
            const preview = document.getElementById('testimonialImagePreview');
            preview.src = testimonial.image.url;
            preview.classList.remove('hidden');
            
            document.getElementById('testimonialForm').setAttribute('data-edit-id', id);
            showModal('testimonialModal');
        }
    } catch (error) {
        console.error('Error loading testimonial:', error);
    }
}

async function handleTestimonialSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData();
    const editId = e.target.getAttribute('data-edit-id');
    
    formData.append('name', document.getElementById('testimonialName').value);
    formData.append('designation', document.getElementById('testimonialDesignation').value);
    formData.append('content', document.getElementById('testimonialContent').value);
    formData.append('rating', document.getElementById('testimonialRating').value);
    formData.append('order', document.getElementById('testimonialOrder').value);
    formData.append('featured', document.getElementById('testimonialFeatured').checked);
    formData.append('isActive', document.getElementById('testimonialActive').checked);
    
    const imageFile = document.getElementById('testimonialImage').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }
    
    try {
        showLoading();
        
        const url = editId ? `${API_BASE_URL}/api/testimonials/${editId}` : `${API_BASE_URL}/api/testimonials`;
        const method = editId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${currentToken}`
            },
            body: formData
        });
        
        if (response.ok) {
            closeModal('testimonialModal');
            loadTestimonials();
            showSuccess('Testimonial saved successfully');
        } else {
            const errorData = await response.json();
            showError('', errorData.message || 'Error saving testimonial');
        }
    } catch (error) {
        console.error('Error saving testimonial:', error);
        showError('', 'Error saving testimonial');
    } finally {
        hideLoading();
    }
}

async function deleteTestimonial(id) {
    if (!confirm('Are you sure you want to delete this testimonial?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/testimonials/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            loadTestimonials();
            showSuccess('Testimonial deleted successfully');
        }
    } catch (error) {
        console.error('Error deleting testimonial:', error);
        showError('', 'Error deleting testimonial');
    }
}

// Gallery functions
async function loadGallery(page = 1) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/gallery/admin?page=${page}&limit=12`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            updateGalleryGrid(data.images);
            updatePagination('galleryPagination', data.currentPage, data.totalPages, loadGallery);
        }
    } catch (error) {
        console.error('Error loading gallery:', error);
    }
}

function updateGalleryGrid(images) {
    const grid = document.getElementById('galleryGrid');
    grid.innerHTML = '';
    
    images.forEach(image => {
        const card = document.createElement('div');
        card.className = 'card p-4';
        card.innerHTML = `
            <img src="${image.image.url}" alt="${image.title}" class="w-full h-48 object-cover rounded-lg mb-4">
            <h3 class="font-semibold text-lg mb-2">${image.title}</h3>
            <p class="text-gray-600 text-sm mb-3">${image.description || 'No description'}</p>
            <div class="flex items-center justify-between">
                <span class="text-xs bg-gray-100 px-2 py-1 rounded">${image.category}</span>
                <div class="flex items-center space-x-2">
                    ${image.featured ? '<i class="fas fa-star text-yellow-400"></i>' : ''}
                    <span class="status-badge status-${image.isActive ? 'active' : 'inactive'}">${image.isActive ? 'Active' : 'Inactive'}</span>
                </div>
            </div>
            <div class="flex justify-end space-x-2 mt-4">
                <button onclick="editGalleryImage('${image._id}')" class="btn-secondary">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteGalleryImage('${image._id}')" class="btn-danger">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function showAddGalleryImage() {
    document.getElementById('galleryModalTitle').textContent = 'Add Gallery Image';
    document.getElementById('galleryForm').reset();
    document.getElementById('galleryImagePreview').classList.add('hidden');
    document.getElementById('galleryForm').removeAttribute('data-edit-id');
    showModal('galleryModal');
}

async function editGalleryImage(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/gallery/${id}`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const image = await response.json();
            
            document.getElementById('galleryModalTitle').textContent = 'Edit Gallery Image';
            document.getElementById('galleryTitle').value = image.title;
            document.getElementById('galleryDescription').value = image.description || '';
            document.getElementById('galleryCategory').value = image.category;
            document.getElementById('galleryTags').value = image.tags.join(', ');
            document.getElementById('galleryOrder').value = image.order;
            document.getElementById('galleryFeatured').checked = image.featured;
            document.getElementById('galleryActive').checked = image.isActive;
            
            // Show current image
            const preview = document.getElementById('galleryImagePreview');
            preview.src = image.image.url;
            preview.classList.remove('hidden');
            
            document.getElementById('galleryForm').setAttribute('data-edit-id', id);
            showModal('galleryModal');
        }
    } catch (error) {
        console.error('Error loading gallery image:', error);
    }
}

async function handleGallerySubmit(e) {
    e.preventDefault();
    
    const formData = new FormData();
    const editId = e.target.getAttribute('data-edit-id');
    
    formData.append('title', document.getElementById('galleryTitle').value);
    formData.append('description', document.getElementById('galleryDescription').value);
    formData.append('category', document.getElementById('galleryCategory').value);
    formData.append('tags', document.getElementById('galleryTags').value);
    formData.append('order', document.getElementById('galleryOrder').value);
    formData.append('featured', document.getElementById('galleryFeatured').checked);
    formData.append('isActive', document.getElementById('galleryActive').checked);
    
    const imageFile = document.getElementById('galleryImage').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }
    
    try {
        showLoading();
        
        const url = editId ? `${API_BASE_URL}/api/gallery/${editId}` : `${API_BASE_URL}/api/gallery`;
        const method = editId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${currentToken}`
            },
            body: formData
        });
        
        if (response.ok) {
            closeModal('galleryModal');
            loadGallery();
            showSuccess('Gallery image saved successfully');
        } else {
            const errorData = await response.json();
            showError('', errorData.message || 'Error saving gallery image');
        }
    } catch (error) {
        console.error('Error saving gallery image:', error);
        showError('', 'Error saving gallery image');
    } finally {
        hideLoading();
    }
}

async function deleteGalleryImage(id) {
    if (!confirm('Are you sure you want to delete this gallery image?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/gallery/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            loadGallery();
            showSuccess('Gallery image deleted successfully');
        }
    } catch (error) {
        console.error('Error deleting gallery image:', error);
        showError('', 'Error deleting gallery image');
    }
}

// Utility functions
function setupDragAndDrop(dropAreaId, inputId, previewId) {
    const dropArea = document.getElementById(dropAreaId);
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    
    dropArea.addEventListener('click', () => input.click());
    
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('dragover');
    });
    
    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('dragover');
    });
    
    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            input.files = files;
            previewImage(files[0], preview);
        }
    });
    
    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            previewImage(e.target.files[0], preview);
        }
    });
}

function previewImage(file, preview) {
    const reader = new FileReader();
    reader.onload = (e) => {
        preview.src = e.target.result;
        preview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function showModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

function showError(elementId, message) {
    if (elementId) {
        const element = document.getElementById(elementId);
        element.textContent = message;
        element.classList.remove('hidden');
    } else {
        alert(message);
    }
}

function showSuccess(message) {
    // Create a temporary success message
    const successDiv = document.createElement('div');
    successDiv.className = 'success fixed top-4 right-4 z-50';
    successDiv.textContent = message;
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

function toggleProfileDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    dropdown.classList.toggle('hidden');
}

function updatePagination(containerId, currentPage, totalPages, loadFunction) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    if (totalPages <= 1) return;
    
    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.textContent = 'Previous';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => loadFunction(currentPage - 1);
    container.appendChild(prevBtn);
    
    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = i === currentPage ? 'active' : '';
        pageBtn.onclick = () => loadFunction(i);
        container.appendChild(pageBtn);
    }
    
    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => loadFunction(currentPage + 1);
    container.appendChild(nextBtn);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Close modals when clicking outside
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
};