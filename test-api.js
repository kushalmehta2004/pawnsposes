// Simple API test script
const fetch = require('node-fetch');

const API_BASE = 'http://localhost:5000/api';

async function testAPI() {
    console.log('Testing API endpoints...\n');
    
    // Test health endpoint
    try {
        const healthResponse = await fetch(`${API_BASE}/health`);
        const healthData = await healthResponse.json();
        console.log('✅ Health check:', healthData.status);
    } catch (error) {
        console.log('❌ Health check failed:', error.message);
    }
    
    // Test admin login
    try {
        const loginResponse = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'admin@pawnsposes.com',
                password: 'admin123'
            })
        });
        
        if (loginResponse.ok) {
            const loginData = await loginResponse.json();
            console.log('✅ Admin login successful');
            
            // Test dashboard with token
            const dashboardResponse = await fetch(`${API_BASE}/admin/dashboard`, {
                headers: { 'Authorization': `Bearer ${loginData.token}` }
            });
            
            if (dashboardResponse.ok) {
                const dashboardData = await dashboardResponse.json();
                console.log('✅ Dashboard data loaded:', {
                    totalContacts: dashboardData.stats.totalContacts,
                    totalStudents: dashboardData.stats.totalStudents
                });
            } else {
                console.log('❌ Dashboard failed:', dashboardResponse.status);
            }
            
            // Test contacts endpoint
            const contactsResponse = await fetch(`${API_BASE}/contact`, {
                headers: { 'Authorization': `Bearer ${loginData.token}` }
            });
            
            if (contactsResponse.ok) {
                const contactsData = await contactsResponse.json();
                console.log('✅ Contacts loaded:', contactsData.contacts.length, 'contacts');
            } else {
                console.log('❌ Contacts failed:', contactsResponse.status);
            }
            
            // Test students endpoint
            const studentsResponse = await fetch(`${API_BASE}/students`, {
                headers: { 'Authorization': `Bearer ${loginData.token}` }
            });
            
            if (studentsResponse.ok) {
                const studentsData = await studentsResponse.json();
                console.log('✅ Students loaded:', studentsData.students.length, 'students');
            } else {
                console.log('❌ Students failed:', studentsResponse.status);
            }
            
        } else {
            const errorData = await loginResponse.json();
            console.log('❌ Admin login failed:', errorData.message);
        }
    } catch (error) {
        console.log('❌ Login test failed:', error.message);
    }
    
    // Test student registration
    try {
        const studentData = {
            name: 'Test Student API',
            email: 'teststudent@example.com',
            phone: '9876543210',
            experience: 'beginner',
            courseType: 'individual'
        };
        
        const registerResponse = await fetch(`${API_BASE}/students`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(studentData)
        });
        
        if (registerResponse.ok) {
            const registerData = await registerResponse.json();
            console.log('✅ Student registration successful');
        } else {
            const errorData = await registerResponse.json();
            console.log('❌ Student registration failed:', errorData.message);
        }
    } catch (error) {
        console.log('❌ Student registration test failed:', error.message);
    }
}

testAPI();