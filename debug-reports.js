/**
 * Debug script to test report saving and fetching
 * Run this in browser console to debug the reports issue
 */

// Test 1: Check if user is authenticated
console.log('=== DEBUGGING REPORTS ===');
console.log('1. User authentication:', window.localStorage.getItem('supabase.auth.token'));

// Test 2: Check if we can connect to Supabase
import { supabase } from './src/services/supabaseClient.js';

async function debugReports() {
  try {
    // Test database connection
    console.log('2. Testing database connection...');
    const { data: testData, error: testError } = await supabase
      .from('reports')
      .select('count(*)')
      .limit(1);
    
    if (testError) {
      console.error('❌ Database connection failed:', testError);
      return;
    }
    console.log('✅ Database connection successful');

    // Test user session
    console.log('3. Testing user session...');
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('❌ User not authenticated:', userError);
      return;
    }
    console.log('✅ User authenticated:', user.id);

    // Test fetching reports
    console.log('4. Testing report fetch...');
    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('*')
      .eq('user_id', user.id);
    
    if (reportsError) {
      console.error('❌ Failed to fetch reports:', reportsError);
      return;
    }
    
    console.log('✅ Reports fetched successfully:', reports.length, 'reports found');
    console.log('Reports data:', reports);

    // Test table structure
    console.log('5. Testing table structure...');
    const { data: tableInfo, error: tableError } = await supabase
      .rpc('get_table_columns', { table_name: 'reports' })
      .catch(() => {
        // Fallback: try to insert a test record to see what columns are missing
        return supabase
          .from('reports')
          .select('*')
          .limit(1);
      });

    console.log('Table structure test completed');

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

// Run the debug
debugReports();