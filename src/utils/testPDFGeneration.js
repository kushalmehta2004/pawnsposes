/**
 * Test utility for PDF generation functionality
 * Use this to test PDF generation without going through the full report flow
 */

import pdfService from '../services/pdfService';

/**
 * Test PDF generation with current page content
 * @param {string} userId - User ID for testing
 * @returns {Promise<void>}
 */
export const testPDFGeneration = async (userId = 'test-user') => {
  try {
    console.log('🧪 Starting PDF generation test...');
    
    // Test 1: Generate PDF from current page
    console.log('📄 Generating PDF from current page...');
    const pdfBlob = await pdfService.generatePDFFromCurrentPage('Test Report');
    console.log('✅ PDF generated successfully, size:', (pdfBlob.size / 1024 / 1024).toFixed(2), 'MB');
    
    // Test 2: Upload PDF to storage (only if Supabase is configured)
    try {
      console.log('☁️ Testing PDF upload to storage...');
      const pdfUrl = await pdfService.uploadPDFToStorage(pdfBlob, 'Test Report', userId);
      console.log('✅ PDF uploaded successfully:', pdfUrl);
      
      // Test 3: Delete the test PDF
      console.log('🗑️ Cleaning up test PDF...');
      await pdfService.deletePDFFromStorage(pdfUrl);
      console.log('✅ Test PDF deleted successfully');
      
    } catch (uploadError) {
      console.warn('⚠️ PDF upload test failed (this is expected if storage bucket is not set up):', uploadError.message);
    }
    
    console.log('🎉 PDF generation test completed successfully!');
    
  } catch (error) {
    console.error('❌ PDF generation test failed:', error);
    throw error;
  }
};

/**
 * Test the complete PDF generation and upload flow
 * @param {string} userId - User ID for testing
 * @returns {Promise<string>} - PDF URL if successful
 */
export const testCompleteFlow = async (userId = 'test-user') => {
  try {
    console.log('🧪 Testing complete PDF flow...');
    
    const pdfUrl = await pdfService.generateAndUploadPDF('Complete Flow Test', userId);
    console.log('✅ Complete flow test successful:', pdfUrl);
    
    return pdfUrl;
    
  } catch (error) {
    console.error('❌ Complete flow test failed:', error);
    throw error;
  }
};

// Export for use in browser console during development
if (typeof window !== 'undefined') {
  window.testPDFGeneration = testPDFGeneration;
  window.testCompleteFlow = testCompleteFlow;
}

export default {
  testPDFGeneration,
  testCompleteFlow
};