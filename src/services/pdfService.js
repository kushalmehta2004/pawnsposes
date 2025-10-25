/**
 * PDF Service
 * Handles PDF generation from HTML content and storage in Supabase
 * Uses html2pdf for better HTML preservation and multi-page support
 */

import html2pdf from 'html2pdf.js';
import { supabase } from './supabaseClient';

/**
 * Generates a PDF from the current page content using html2pdf
 * This preserves HTML structure, makes text selectable, and handles page breaks naturally
 * @param {string} reportTitle - Title for the PDF file
 * @returns {Promise<Blob>} - PDF blob
 */
export const generatePDFFromCurrentPage = async (reportTitle = 'Chess Analysis Report') => {
  try {
    console.log('🔄 Starting PDF generation...');

    // Get the report content element
    const element = document.getElementById('report-content') ||
      document.querySelector('.report-content') ||
      document.querySelector('[id*="report"]') ||
      document.querySelector('.page') ||
      document.body;

    if (!element) {
      throw new Error('Report content element not found');
    }

    console.log('📄 Targeting element for PDF:', element.id || element.className || 'document.body');

    // Create a clone of the element to manipulate without affecting the original
    const clonedElement = element.cloneNode(true);

    // Convert PDF-safe buttons to links (for buttons with pdf-link class)
    const pdfLinkButtons = clonedElement.querySelectorAll('button.pdf-link');
    pdfLinkButtons.forEach(btn => {
      const href = btn.getAttribute('data-href');
      if (href) {
        const link = document.createElement('a');
        link.href = href;
        link.textContent = btn.textContent;
        link.style.color = '#3b82f6';
        link.style.textDecoration = 'underline';
        link.style.cursor = 'pointer';
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener,noreferrer');
        btn.replaceWith(link);
      }
    });

    // Hide buttons and interactive elements in the clone
    const elementsToHide = clonedElement.querySelectorAll('button, .no-print, [data-no-print], nav, header, footer, .print-button-container, .back-link');
    elementsToHide.forEach(el => {
      el.style.display = 'none';
    });

    // Add styles to ensure proper PDF formatting
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      @media print {
        body { background: white !important; }
        * { 
          box-shadow: none !important; 
          border-radius: 0 !important;
        }
        button, .no-print, [data-no-print] { 
          display: none !important; 
        }
      }
      
      .page-break {
        page-break-after: always;
      }
      
      section {
        page-break-inside: avoid;
      }
      
      h1, h2, h3 {
        page-break-after: avoid;
      }
      
      table {
        page-break-inside: avoid;
      }
    `;
    clonedElement.appendChild(styleEl);

    // html2pdf options for better formatting
    const options = {
      margin: [10, 10, 10, 10], // margins in mm: top, left, bottom, right
      filename: `${reportTitle.replace(/[^a-z0-9]/gi, '-')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      },
      jsPDF: { 
        orientation: 'portrait', 
        unit: 'mm', 
        format: 'a4',
        compress: true
      },
      pagebreak: { 
        mode: ['avoid-all', 'css', 'legacy'] // Better page break handling
      }
    };

    // Generate PDF and return as blob
    console.log('📝 Generating PDF with html2pdf...');
    
    return new Promise((resolve, reject) => {
      html2pdf()
        .set(options)
        .from(clonedElement)
        .toPdf()
        .get('pdf')
        .then((pdf) => {
          const blob = pdf.output('blob');
          if (blob && blob.size > 0) {
            console.log('✅ PDF generated successfully, size:', blob.size);
            resolve(blob);
          } else {
            console.error('❌ PDF generation failed - empty blob');
            reject(new Error('PDF generation produced an empty file'));
          }
        })
        .catch((error) => {
          console.error('❌ html2pdf error:', error);
          reject(new Error(`html2pdf failed: ${error.message}`));
        });
    });

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
