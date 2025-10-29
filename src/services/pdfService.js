/**
 * PDF Service
 * Handles PDF generation from HTML content and storage in Supabase
 * Uses html2pdf with optimized settings for multi-page support and link preservation
 */

import html2pdf from 'html2pdf.js';
import { supabase } from './supabaseClient';

/**
 * Generates a PDF from the current page content
 * Preserves HTML structure, creates clickable links, and handles multi-page layouts
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

    // ✅ STEP 1: Convert buttons to visibly styled links (preserved in PDF)
    const buttons = clonedElement.querySelectorAll('button');
    buttons.forEach(btn => {
      const dataHref = btn.getAttribute('data-href');
      const href = dataHref || btn.href || '#';
      const text = btn.textContent || btn.innerText;
      
      // Create styled link that looks like a button
      const link = document.createElement('a');
      link.href = href;
      link.textContent = text;
      link.style.cssText = `
        display: inline-block;
        padding: 8px 14px;
        margin: 4px 2px;
        background-color: #3b82f6;
        color: white;
        text-decoration: none;
        border-radius: 4px;
        font-weight: 500;
        border: 1px solid #2563eb;
      `;
      
      if (href && href !== '#') {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener,noreferrer');
      }
      
      btn.replaceWith(link);
    });

    // ✅ STEP 2: Hide UI elements that shouldn't appear in PDF
    const elementsToHide = clonedElement.querySelectorAll(
      '.no-print, [data-no-print], nav, header, footer, .print-button-container, .back-link, [class*="download"], [class*="Download"]'
    );
    elementsToHide.forEach(el => {
      el.style.display = 'none';
    });

    // ✅ STEP 3: Apply print-optimized CSS with proper pagination
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      /* Reset spacing */
      * {
        box-shadow: none !important;
      }
      
      body {
        background: white !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      
      main, .page, [id*="report"] {
        padding-top: 0 !important;
        min-height: auto !important;
        margin: 0 !important;
        background: white !important;
      }
      
      /* Section & Article - Allow natural breaking to prevent large white gaps */
      section, article {
        margin-bottom: 8px !important;
        padding: 12px !important;
        background: white !important;
        /* Remove page-break-inside: avoid to allow natural pagination */
      }
      
      /* Heading optimization - Allow breaks after headings for natural flow */
      h1, h2, h3, h4, h5, h6 {
        margin-bottom: 6px !important;
        margin-top: 8px !important;
        /* Remove page-break-after: avoid for natural pagination */
      }
      
      h1 { font-size: 22px !important; }
      h2 { font-size: 16px !important; }
      h3 { font-size: 14px !important; }
      
      /* Table optimization - Keep tables intact */
      table {
        page-break-inside: avoid;
        width: 100% !important;
        border-collapse: collapse !important;
        margin: 4px 0 !important;
      }
      
      th, td {
        padding: 4px 6px !important;
        border: 0.5px solid #d1d5db !important;
        font-size: 11px !important;
      }
      
      th {
        background-color: #f3f4f6 !important;
        font-weight: 600 !important;
      }
      
      /* Paragraph optimization - Prevent orphans/widows (single lines isolated from their block) */
      p {
        margin-bottom: 4px !important;
        orphans: 3;
        widows: 3;
      }
      
      /* List optimization - Allow natural breaking for long lists */
      ul, ol {
        margin-left: 16px !important;
        margin-bottom: 4px !important;
      }
      
      li {
        margin-bottom: 2px !important;
        orphans: 2;
        widows: 2;
      }
      
      /* List item paragraphs - Prevent splitting */
      li > p {
        orphans: 2;
        widows: 2;
        margin-bottom: 2px !important;
      }
      
      /* Links styling */
      a {
        color: inherit !important;
        text-decoration: none !important;
      }
      
      /* Card optimization - Allow natural breaking instead of forcing to next page */
      .card, [class*="card"] {
        margin: 6px 0 !important;
        padding: 10px !important;
        border: 1px solid #e5e7eb !important;
        /* Remove page-break-inside: avoid for natural flow */
      }
      
      /* Image optimization - Keep images intact */
      img {
        max-width: 100% !important;
        height: auto !important;
        page-break-inside: avoid;
      }
      
      /* Prevent empty pages */
      .page-break {
        page-break-after: always;
      }
      
      /* Explicit page break helpers (optional, for use if needed) */
      .force-page-break {
        page-break-before: always;
      }
    `;
    clonedElement.appendChild(styleEl);

    // ✅ STEP 4: Configure html2pdf with natural pagination settings
    const options = {
      margin: [8, 8, 8, 8], // 8mm margins (tighter than before)
      filename: `${reportTitle.replace(/[^a-z0-9]/gi, '-')}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: {
        scale: 2, // Higher resolution for better text clarity
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        windowHeight: clonedElement.scrollHeight, // Ensure full page height is captured
        logging: false
      },
      jsPDF: {
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      },
      pagebreak: {
        mode: ['css', 'legacy'], // Use CSS page breaks primarily
        // Only avoid breaking in truly unbreakable elements (tables, images)
        // Allow natural pagination for sections, headers, and content
        avoid: ['table', 'img']
      }
    };

    console.log('📝 Generating PDF with html2pdf...');

    return new Promise((resolve, reject) => {
      try {
        html2pdf()
          .set(options)
          .from(clonedElement)
          .toPdf()
          .get('pdf')
          .then((pdf) => {
            const blob = pdf.output('blob');
            if (blob && blob.size > 0) {
              console.log('✅ PDF generated successfully, size:', (blob.size / 1024).toFixed(2), 'KB');
              resolve(blob);
            } else {
              throw new Error('PDF generation produced an empty file');
            }
          })
          .catch((error) => {
            console.error('❌ html2pdf error:', error);
            reject(new Error(`html2pdf failed: ${error.message}`));
          });
      } catch (error) {
        console.error('❌ Error in PDF generation promise:', error);
        reject(error);
      }
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
