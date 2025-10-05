/**
 * PDF Service
 * Handles PDF generation from HTML content and storage in Supabase
 */

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { supabase } from './supabaseClient';

/**
 * Generates a PDF from the current page content
 * @param {string} reportTitle - Title for the PDF file
 * @returns {Promise<Blob>} - PDF blob
 */
export const generatePDFFromCurrentPage = async (reportTitle = 'Chess Analysis Report') => {
  try {
    console.log('🔄 Starting PDF generation...');
    
    // Get the report content element specifically (not the entire page)
    const element = document.getElementById('report-content') || 
                   document.querySelector('.report-content') || 
                   document.querySelector('[id*="report"]') ||
                   document.querySelector('.page') ||
                   document.body;
    
    if (!element) {
      throw new Error('Report content element not found');
    }
    
    console.log('📄 Targeting element for PDF:', element.id || element.className || 'document.body');
    console.log('📐 Element dimensions:', {
      width: element.offsetWidth,
      height: element.offsetHeight,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight
    });
    
    // Temporarily hide buttons and interactive elements for PDF
    const elementsToHide = document.querySelectorAll('button, .no-print, [data-no-print], nav, header, footer, .print-button-container');
    const originalDisplays = [];
    
    elementsToHide.forEach((el, index) => {
      originalDisplays[index] = el.style.display;
      el.style.display = 'none';
    });
    
    // Force light mode for PDF
    const wasDark = document.body.classList.contains('dark-mode');
    if (wasDark) {
      document.body.classList.remove('dark-mode');
    }
    
    // Add temporary styles for clean PDF generation
    const tempStyle = document.createElement('style');
    tempStyle.id = 'pdf-generation-styles';
    tempStyle.textContent = `
      #report-content {
        background: white !important;
        color: black !important;
        padding: 20px !important;
        margin: 0 !important;
        box-shadow: none !important;
        border: none !important;
      }
      #report-content * {
        color: inherit !important;
      }
      #report-content .no-print,
      #report-content button,
      #report-content nav,
      #report-content header,
      #report-content footer {
        display: none !important;
      }
    `;
    document.head.appendChild(tempStyle);
    
    // Generate canvas from HTML
    const canvas = await html2canvas(element, {
      scale: 2, // Higher quality
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: element.offsetWidth || element.scrollWidth,
      height: element.offsetHeight || element.scrollHeight,
      scrollX: 0,
      scrollY: 0,
      logging: false, // Reduce console noise
      removeContainer: true // Clean up temporary elements
    });
    
    // Restore original styles
    elementsToHide.forEach((el, index) => {
      el.style.display = originalDisplays[index];
    });
    
    // Remove temporary styles
    const tempStyleEl = document.getElementById('pdf-generation-styles');
    if (tempStyleEl) {
      tempStyleEl.remove();
    }
    
    if (wasDark) {
      document.body.classList.add('dark-mode');
    }
    
    // Create PDF
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    // Calculate dimensions to fit A4 with margins
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 10; // 10mm margins
    const availableWidth = pdfWidth - (margin * 2);
    const availableHeight = pdfHeight - (margin * 2);
    
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    const ratio = Math.min(availableWidth / imgWidth, availableHeight / imgHeight);
    const scaledWidth = imgWidth * ratio;
    const scaledHeight = imgHeight * ratio;
    const imgX = (pdfWidth - scaledWidth) / 2;
    const imgY = margin;
    
    // Add image to PDF
    pdf.addImage(imgData, 'PNG', imgX, imgY, scaledWidth, scaledHeight);
    
    // If content is too tall, add additional pages
    let remainingHeight = scaledHeight - availableHeight;
    let currentY = availableHeight;
    
    while (remainingHeight > 0) {
      pdf.addPage();
      const pageHeight = Math.min(remainingHeight, availableHeight);
      
      // Create a new canvas for the remaining content
      const remainingCanvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: element.offsetWidth || element.scrollWidth,
        height: pageHeight / ratio,
        scrollX: 0,
        scrollY: currentY / ratio,
        logging: false,
        removeContainer: true
      });
      
      const remainingImgData = remainingCanvas.toDataURL('image/png');
      pdf.addImage(remainingImgData, 'PNG', imgX, margin, scaledWidth, pageHeight);
      
      remainingHeight -= availableHeight;
      currentY += availableHeight;
    }
    
    // Convert to blob
    const pdfBlob = pdf.output('blob');
    console.log('✅ PDF generated successfully');
    
    return pdfBlob;
    
  } catch (error) {
    console.error('❌ Error generating PDF:', error);
    throw new Error(`Failed to generate PDF: ${error.message}`);
  }
};

/**
 * Uploads a PDF blob to Supabase storage
 * @param {Blob} pdfBlob - PDF blob to upload
 * @param {string} fileName - File name for the PDF
 * @param {string} userId - User ID for folder organization
 * @returns {Promise<string>} - Public URL of the uploaded PDF
 */
export const uploadPDFToStorage = async (pdfBlob, fileName, userId) => {
  try {
    console.log('🔄 Uploading PDF to storage...');
    
    // Create a unique file path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9-_]/g, '-');
    const filePath = `reports/${userId}/${timestamp}-${sanitizedFileName}.pdf`;
    
    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('report-pdfs')
      .upload(filePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: false
      });
    
    if (error) {
      console.error('❌ Storage upload error:', error);
      throw new Error(`Failed to upload PDF: ${error.message}`);
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('report-pdfs')
      .getPublicUrl(filePath);
    
    console.log('✅ PDF uploaded successfully:', urlData.publicUrl);
    return urlData.publicUrl;
    
  } catch (error) {
    console.error('❌ Error uploading PDF:', error);
    throw error;
  }
};

/**
 * Generates and uploads a PDF from the current page
 * @param {string} reportTitle - Title for the PDF
 * @param {string} userId - User ID
 * @returns {Promise<string>} - Public URL of the uploaded PDF
 */
export const generateAndUploadPDF = async (reportTitle, userId) => {
  try {
    // Generate PDF from current page
    const pdfBlob = await generatePDFFromCurrentPage(reportTitle);
    
    // Upload to storage
    const pdfUrl = await uploadPDFToStorage(pdfBlob, reportTitle, userId);
    
    return pdfUrl;
    
  } catch (error) {
    console.error('❌ Error in generateAndUploadPDF:', error);
    throw error;
  }
};

/**
 * Deletes a PDF from Supabase storage
 * @param {string} pdfUrl - Public URL of the PDF to delete
 * @returns {Promise<boolean>} - Success status
 */
export const deletePDFFromStorage = async (pdfUrl) => {
  try {
    // Extract file path from URL
    const urlParts = pdfUrl.split('/');
    const bucketIndex = urlParts.findIndex(part => part === 'report-pdfs');
    if (bucketIndex === -1) {
      throw new Error('Invalid PDF URL format');
    }
    
    const filePath = urlParts.slice(bucketIndex + 1).join('/');
    
    const { error } = await supabase.storage
      .from('report-pdfs')
      .remove([filePath]);
    
    if (error) {
      console.error('❌ Error deleting PDF:', error);
      throw new Error(`Failed to delete PDF: ${error.message}`);
    }
    
    console.log('✅ PDF deleted successfully');
    return true;
    
  } catch (error) {
    console.error('❌ Error in deletePDFFromStorage:', error);
    throw error;
  }
};

export default {
  generatePDFFromCurrentPage,
  uploadPDFToStorage,
  generateAndUploadPDF,
  deletePDFFromStorage
};