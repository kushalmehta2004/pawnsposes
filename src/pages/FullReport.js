import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import reportService from '../services/reportService';
import pdfService from '../services/pdfService';

import toast from 'react-hot-toast';

// Simple in-memory cache to persist across route toggles within the same session
// Resets naturally when the app reloads or user leaves these pages
let FULL_REPORT_CACHE = { key: null, videoRec: null, phaseReview: null, positionalStudy: null, actionPlan: null, recurringWeaknesses: null };

// Global set to track saved analysis IDs across component mounts
let SAVED_ANALYSIS_IDS = new Set();

const FullReport = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const {
    analysis,
    performanceMetrics,
    recurringWeaknesses: initialRecurringWeaknesses,
    engineInsights,
    improvementRecommendations,
    personalizedResources,
    isCalculatingMetrics,
    isAnalyzingWeaknesses,
    dataSource,
    reportId // If viewing a saved report
  } = location.state || {};

  const [recurringWeaknesses, setRecurringWeaknesses] = React.useState(initialRecurringWeaknesses);
  const [reportSaved, setReportSaved] = React.useState(false);
  const [savedReportId, setSavedReportId] = React.useState(null);

  // State for async content loading
  const [positionalStudy, setPositionalStudy] = React.useState(null);
  const [isLoadingStudy, setIsLoadingStudy] = React.useState(false);

  // Ref to prevent duplicate auto-saves
  const hasSavedRef = React.useRef(false);
  const [phaseReview, setPhaseReview] = React.useState(null);
  const [actionPlan, setActionPlan] = React.useState(null);
  const [isLoadingActionPlan, setIsLoadingActionPlan] = React.useState(false);

  // Create a unique identifier for this analysis to prevent duplicate saves
  const analysisId = React.useMemo(() => {
    if (!analysis) return null;
    const username = analysis?.username || analysis?.formData?.username || analysis?.player?.username;
    const gameCount = analysis?.games?.length || analysis?.gameData?.length || 0;
    
    // Create a hash from the first few game IDs or moves to make it unique
    let contentHash = '';
    if (analysis?.games?.length > 0) {
      contentHash = analysis.games.slice(0, 3).map(g => g.id || g.gameId || '').join('_');
    } else if (analysis?.gameData?.length > 0) {
      contentHash = analysis.gameData.slice(0, 3).map(g => g.id || g.gameId || '').join('_');
    }
    
    return `${username}_${gameCount}_${contentHash}`;
  }, [analysis]);

  // Check if this analysis was already saved and update the state accordingly
  React.useEffect(() => {
    if (analysisId && SAVED_ANALYSIS_IDS.has(analysisId)) {
      setReportSaved(true);
    }
  }, [analysisId]);

  // Cache recurring weaknesses to avoid recalculating on navigation
  React.useEffect(() => {
    const cacheKey = analysis?.player?.username || analysis?.formData?.username || 'unknown';
    if (FULL_REPORT_CACHE.key === cacheKey && FULL_REPORT_CACHE.recurringWeaknesses) {
      setRecurringWeaknesses(FULL_REPORT_CACHE.recurringWeaknesses);
    } else if (initialRecurringWeaknesses) {
      setRecurringWeaknesses(initialRecurringWeaknesses);
      FULL_REPORT_CACHE = { ...FULL_REPORT_CACHE, key: cacheKey, recurringWeaknesses: initialRecurringWeaknesses };
    }
  }, [initialRecurringWeaknesses, analysis]);

  // Simple keyword -> YouTube mapping + fallback search (no API key)
  const [videoRec, setVideoRec] = React.useState({ title: null, url: null });

  const topicFromWeakness = React.useMemo(() => {
    const t = (recurringWeaknesses?.[0]?.title || performanceMetrics?.focusArea || '').toString().trim().toLowerCase();
    return t;
  }, [recurringWeaknesses, performanceMetrics]);

  // Fetch a precise, working YouTube video for the user's first weakness
  React.useEffect(() => {
    let cancelled = false;

    // Use cache key based on current analysis identity to persist between toggles
    const cacheKey = analysis?.player?.username || analysis?.formData?.username || 'unknown';

    // Restore from cache if available
    if (FULL_REPORT_CACHE.key === cacheKey && FULL_REPORT_CACHE.videoRec) {
      setVideoRec(FULL_REPORT_CACHE.videoRec);
      return () => {};
    }

    const run = async () => {
      try {
        if (!recurringWeaknesses || recurringWeaknesses.length === 0) {
          setVideoRec({ title: null, url: null });
          return;
        }
        
        setIsLoadingVideo(true);
        const { searchBestYouTubeForWeakness } = await import('../services/youtubeSearchService');
        const topic = (recurringWeaknesses?.[0]?.title || '').toString().trim();
        if (!topic) {
          setVideoRec({ title: null, url: null });
          return;
        }
        
        const rec = await searchBestYouTubeForWeakness(topic);
        if (rec?.url) {
          if (!cancelled) {
            const value = { title: rec.title || 'Recommended Video', url: rec.url };
            setVideoRec(value);
            FULL_REPORT_CACHE = { ...FULL_REPORT_CACHE, key: cacheKey, videoRec: value };
          }
          return;
        } else {
          // No video found
          if (!cancelled) {
            setVideoRec({ title: null, url: null });
          }
        }
      } catch (e) {
        // No fallback shown to avoid unreliable links
        if (!cancelled) {
          setVideoRec({ title: null, url: null });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingVideo(false);
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [recurringWeaknesses, analysis, performanceMetrics]);

  React.useEffect(() => {
    const topic = topicFromWeakness;
    if (!topic) { setVideoRec({ title: null, url: null }); return; }
    // If AI already provided a concrete video, do not override
    if (videoRec?.url) return;
    // No search-based fallback: only show verified direct video links when available
  }, [topicFromWeakness, videoRec?.url]);

  // Debug: Log what we actually received
  React.useEffect(() => {
    // console.log('=== DEBUGGING OPPONENT NAME EXTRACTION ===');  // DISABLED - Issue resolved
    // if (recurringWeaknesses && recurringWeaknesses.length > 0) {
    //   console.log('Analysis data:', analysis);
    //   if (analysis && analysis.games) {
    //     console.log('Available games:', analysis.games.map(g => ({ 
    //       gameNumber: g.gameNumber, 
    //       opponent: g.opponent,
    //       white: g.white,
    //       black: g.black 
    //     })));
    //   }
    //   
    //   recurringWeaknesses.forEach((weakness, idx) => {
    //     console.log(`\n--- Weakness ${idx + 1}: ${weakness.title} ---`);
    //     const gameRefs = weakness.description.match(/Game\s+(\d+)/gi);
    //     if (gameRefs) {
    //       console.log('Game references found:', gameRefs);
    //     }
    //   });
    // }
    
    // Verify we're getting data from the correct source
    if (dataSource) {
      // console.log('✅ Data source confirmed:', dataSource);  // DISABLED - Noise reduction
      if (dataSource.includes('Unified Single Gemini Call')) {
        // console.log('🎉 SUCCESS: Using data from unified single API call!');  // DISABLED - Noise reduction
      }
    } else {
      // console.log('⚠️ No data source marker - might be from wrong call');  // DISABLED - Noise reduction
    }
  }, [analysis, performanceMetrics, recurringWeaknesses, isCalculatingMetrics, isAnalyzingWeaknesses, dataSource]);

  // Autosave functionality removed - users now save manually using the Save button
  // Track loading states for all async content
  const [isLoadingVideo, setIsLoadingVideo] = React.useState(false);
  const [isLoadingPhaseReview, setIsLoadingPhaseReview] = React.useState(false);

  // Check if all content has finished loading
  const isAllContentLoaded = React.useMemo(() => {
    const hasVideoContent = !recurringWeaknesses || recurringWeaknesses.length === 0 || (!isLoadingVideo && videoRec?.url !== undefined);
    const hasPositionalStudy = !recurringWeaknesses || recurringWeaknesses.length === 0 || (!isLoadingStudy && positionalStudy !== null);
    const hasPhaseReview = !analysis?.games?.length || (!isLoadingPhaseReview && phaseReview !== null);
    const hasActionPlan = !recurringWeaknesses || recurringWeaknesses.length === 0 || (!isLoadingActionPlan && actionPlan !== null);
    
    return hasVideoContent && hasPositionalStudy && hasPhaseReview && hasActionPlan;
  }, [recurringWeaknesses, videoRec, positionalStudy, isLoadingStudy, phaseReview, isLoadingPhaseReview, actionPlan, isLoadingActionPlan, analysis, isLoadingVideo]);

  // Auto-save PDF report when analysis is complete AND all content has loaded (only for new reports, not saved ones)
  React.useEffect(() => {
    const savePDFReportAutomatically = async () => {
      // Debug logging for auto-save conditions
      console.log('🔍 PDF Auto-save check:', {
        user: !!user,
        userId: user?.id,
        analysis: !!analysis,
        performanceMetrics: !!performanceMetrics,
        recurringWeaknesses: !!recurringWeaknesses,
        reportId: reportId,
        reportSaved: reportSaved,
        analysisId: analysisId,
        alreadySaved: SAVED_ANALYSIS_IDS.has(analysisId),
        savedAnalysisCount: SAVED_ANALYSIS_IDS.size,
        dataSource: dataSource,
        isFromSavedReport: dataSource?.includes('saved_report'),
        isAllContentLoaded: isAllContentLoaded,
        loadingStates: {
          isLoadingVideo: isLoadingVideo,
          isLoadingStudy: isLoadingStudy,
          isLoadingPhaseReview: isLoadingPhaseReview,
          isLoadingActionPlan: isLoadingActionPlan
        },
        contentStates: {
          hasVideoRec: !!videoRec?.url,
          hasPositionalStudy: !!positionalStudy,
          hasPhaseReview: !!phaseReview,
          hasActionPlan: !!actionPlan
        }
      });

      // Only save if:
      // 1. User is authenticated
      // 2. We have complete analysis data
      // 3. This is not a saved report being viewed (no reportId)
      // 4. This specific analysis hasn't been saved before
      // 5. Data source indicates this is from a fresh analysis
      // 6. ALL content has finished loading (including async components)
      if (
        user &&
        analysis &&
        performanceMetrics &&
        recurringWeaknesses &&
        !reportId &&
        analysisId &&
        !SAVED_ANALYSIS_IDS.has(analysisId) &&
        dataSource &&
        !dataSource.includes('saved_report') &&
        isAllContentLoaded
      ) {
        try {
          if (hasSavedRef.current) {
            console.log('⏭️ PDF Auto-save skipped - already saved for this analysis');
            return;
          }

          console.log('🔄 Auto-saving PDF report (all content loaded)...');

          const username = analysis?.username || analysis?.formData?.username || 'Unknown';
          const platform = analysis?.platform || analysis?.formData?.platform || 'Unknown';
          const gameCount = analysis?.games?.length || analysis?.gameData?.length || 0;
          const title = `${username}'s Chess Analysis Report - ${gameCount} games`;

          // Generate PDF from current page
          const pdfBlob = await pdfService.generatePDFFromCurrentPage(title);

          // Upload PDF to storage
          const pdfUrl = await pdfService.uploadPDFToStorage(pdfBlob, title, user.id);

          // Save report record with PDF URL
          const savedReport = await reportService.saveReport(user.id, pdfUrl, platform, username, title, gameCount);
          setReportSaved(true);
          setSavedReportId(savedReport.id);
          SAVED_ANALYSIS_IDS.add(analysisId);
          hasSavedRef.current = true;

          console.log('✅ PDF Report auto-saved successfully:', savedReport.id);

          toast.success('Report saved as PDF successfully!', {
            duration: 3000,
            icon: '💾'
          });

        } catch (error) {
          console.error('❌ Failed to auto-save PDF report:', error);
          console.error('❌ Error details:', error.message);

          // Show user-friendly error messages
          let errorMessage = 'Failed to save PDF report';

          if (error.message?.includes('timeout')) {
            errorMessage = 'PDF generation timed out. Try again.';
          } else if (error.message?.includes('storage')) {
            errorMessage = 'Failed to upload PDF. Check your connection.';
          } else if (error.message?.includes('403')) {
            errorMessage = 'Permission denied. Please check your login status.';
          } else if (error.message?.includes('500')) {
            errorMessage = 'Server error. Please try again later.';
          } else {
            errorMessage = `Save failed: ${error.message}`;
          }

          toast.error(errorMessage, {
            duration: 7000,
            icon: '❌'
          });
        }
      } else {
        console.log('⏭️ PDF Auto-save skipped - conditions not met or content still loading');
      }
    };

    // Only attempt to save if all content is loaded, with a minimum delay
    if (isAllContentLoaded) {
      const timeoutId = setTimeout(savePDFReportAutomatically, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [user, analysis, performanceMetrics, recurringWeaknesses, engineInsights, improvementRecommendations, personalizedResources, reportId, analysisId, dataSource, isAllContentLoaded, videoRec, positionalStudy, phaseReview, actionPlan]);

  const handleBackToReport = () => {
    // Pass computed data back so ReportDisplay can reuse it without refetching
    navigate('/report-display', { 
      state: { 
        analysis,
        performanceMetrics,
        recurringWeaknesses,
        engineInsights,
        improvementRecommendations,
        personalizedResources,
        isCalculatingMetrics,
        isAnalyzingWeaknesses,
        dataSource,
        // Also return advanced computed items to avoid recomputation
        phaseReview,
        positionalStudy,
        videoRec,
        actionPlan,
      } 
    });
  };


  const handleDownloadPDF = () => {
    // Force light mode and hide interactive buttons in the printed PDF
    const wasDark = document.body.classList.contains('dark-mode');

    // Temporary print-only stylesheet to hide buttons (e.g., dark mode toggle)
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-temp-print-style', 'true');
    styleEl.textContent = `
      @media print {
        button { display: none !important; }
      }
    `;
    document.head.appendChild(styleEl);

    const beforePrintHandler = () => {
      if (wasDark) document.body.classList.remove('dark-mode');
    };

    const cleanup = () => {
      // Remove temp style
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
      // Restore dark mode if it was active
      if (wasDark && !document.body.classList.contains('dark-mode')) {
        document.body.classList.add('dark-mode');
      }
      window.removeEventListener('afterprint', afterPrintHandler);
      window.removeEventListener('beforeprint', beforePrintHandler);
    };

    const afterPrintHandler = () => {
      cleanup();
    };

    window.addEventListener('beforeprint', beforePrintHandler);
    window.addEventListener('afterprint', afterPrintHandler);

    // Ensure light mode right before opening the print dialog
    beforePrintHandler();
    window.print();

    // Fallback in case 'afterprint' doesn't fire (some browsers)
    setTimeout(() => {
      if (document.head.contains(styleEl)) {
        cleanup();
      }
    }, 1500);
  };



  if (!analysis) {
    navigate('/report-display');
    return null;
  }

  React.useEffect(() => {
    let cancelled = false;

    const cacheKey = analysis?.player?.username || analysis?.formData?.username || 'unknown';

    // Restore from cache
    if (FULL_REPORT_CACHE.key === cacheKey && FULL_REPORT_CACHE.positionalStudy) {
      setPositionalStudy(FULL_REPORT_CACHE.positionalStudy);
      return () => {};
    }

    const fetchStudy = async () => {
      try {
        if (!recurringWeaknesses || recurringWeaknesses.length === 0) return;
        setIsLoadingStudy(true);
        const { suggestMasterGameForWeaknesses } = await import('../utils/geminiStockfishAnalysis');
        const study = await suggestMasterGameForWeaknesses(recurringWeaknesses);
        if (!cancelled) {
          setPositionalStudy(study);
          FULL_REPORT_CACHE = { ...FULL_REPORT_CACHE, key: cacheKey, positionalStudy: study };
        }
      } catch (e) {
        console.warn('Positional study suggestion skipped:', e.message);
      } finally {
        if (!cancelled) setIsLoadingStudy(false);
      }
    };
    fetchStudy();
    return () => { cancelled = true; };
  }, [recurringWeaknesses]);

  React.useEffect(() => {
    let cancelled = false;

    const cacheKey = analysis?.player?.username || analysis?.formData?.username || 'unknown';

    // Restore from cache
    if (FULL_REPORT_CACHE.key === cacheKey && FULL_REPORT_CACHE.phaseReview) {
      setPhaseReview(FULL_REPORT_CACHE.phaseReview);
      return () => {};
    }

    const runPhaseReview = async () => {
      try {
        if (!analysis || !Array.isArray(analysis.games) || analysis.games.length === 0) return;
        
        setIsLoadingPhaseReview(true);
        const games = analysis.games;
        // Build a compact summary for Gemini (minimal fields)
        const gamesSummary = games.slice(0, 20).map(g => ({
          gameNumber: g.gameNumber,
          color: g.userColor || (g.white?.username === analysis?.player?.username ? 'white' : 'black'),
          result: g.result || g.outcome || g.winner || '',
          accuracy: g.accuracyData?.userAccuracy ?? g.userAccuracy ?? g.accuracy,
          moves: Array.isArray(g.moves) ? g.moves.length : (g.moveCount || g.moves),
          opening: g.opening || { name: g.openingName, eco: g.eco },
          phaseDrops: g.phaseDrops // if any precomputed phase drops are stored
        }));
        const playerInfo = {
          username: analysis?.player?.username,
          skillLevel: analysis?.player?.skillLevel || performanceMetrics?.skillLevel,
          averageRating: analysis?.player?.averageRating || performanceMetrics?.averageRating,
        };
        const { generatePhaseReviewFromGames } = await import('../utils/geminiStockfishAnalysis');
        const result = await generatePhaseReviewFromGames(gamesSummary, playerInfo);
        if (!cancelled) {
          setPhaseReview(result);
          FULL_REPORT_CACHE = { ...FULL_REPORT_CACHE, key: cacheKey, phaseReview: result };
        }
      } catch (e) {
        console.warn('Phase review generation skipped:', e.message);
      } finally {
        if (!cancelled) {
          setIsLoadingPhaseReview(false);
        }
      }
    };
    runPhaseReview();
    return () => { cancelled = true; };
  }, [analysis, performanceMetrics]);

  // Fetch Gemini-curated actionable plan based on existing weaknesses
  React.useEffect(() => {
    let cancelled = false;

    const cacheKey = analysis?.player?.username || analysis?.formData?.username || 'unknown';

    // Restore from cache
    if (FULL_REPORT_CACHE.key === cacheKey && FULL_REPORT_CACHE.actionPlan) {
      setActionPlan(FULL_REPORT_CACHE.actionPlan);
      return () => {};
    }

    const run = async () => {
      try {
        if (!recurringWeaknesses || recurringWeaknesses.length === 0) return;
        setIsLoadingActionPlan(true);
        const { generateActionPlanFromWeaknesses } = await import('../utils/geminiStockfishAnalysis');
        const playerInfo = {
          username: analysis?.player?.username,
          skillLevel: analysis?.player?.skillLevel || performanceMetrics?.skillLevel,
          averageRating: analysis?.player?.averageRating || performanceMetrics?.averageRating,
        };
        const plan = await generateActionPlanFromWeaknesses(recurringWeaknesses, playerInfo);
        if (!cancelled && plan) {
          setActionPlan(plan);
          FULL_REPORT_CACHE = { ...FULL_REPORT_CACHE, key: cacheKey, actionPlan: plan };
        }
      } catch (e) {
        console.warn('Action plan generation skipped:', e.message);
      } finally {
        if (!cancelled) setIsLoadingActionPlan(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [recurringWeaknesses, analysis, performanceMetrics]);

  return (
    <div style={{
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      backgroundColor: '#f0f2f5',
      color: '#333',
      minHeight: '100vh',
      fontSize: '16px'
    }}>
      <style>{`
        .page-container {
          max-width: 800px;
          margin: 2rem auto;
          padding: 1rem;
        }
        
        .page {
          padding: 2.5rem;
          border-radius: 6px;
          background: #ffffff;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.07);
          border-top: 8px solid #064e3b;
        }
        
        .print-button-container {
          display: flex;
          justify-content: center;
          margin-bottom: 1rem;
          padding-top: 3.5rem;
        }
        
        .print-button {
          background-color: #065f46;
          color: white;
          font-weight: 600;
          padding: 0.75rem 1.5rem;
          border-radius: 0.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          transition: background-color 0.3s ease, box-shadow 0.3s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: auto;
          min-width: 180px;
          border: none;
          cursor: pointer;
        }
        
        .print-button:hover {
          background-color: #047857;
          box-shadow: 0 7px 14px rgba(0,0,0,0.1);
        }
        
        .section-header {
          font-size: 1.125rem;
          font-weight: 800;
          color: #064e3b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          margin-bottom: 1rem;
        }
        
        .section-header i {
          margin-right: 0.75rem;
          color: #10b981;
        }
        
        .highlight-card {
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 1rem;
          text-align: center;
        }
        
        .checklist-item {
          display: flex;
          align-items: flex-start;
          padding: 0.75rem;
          border-radius: 0.5rem;
          background-color: #f8fafc;
          border: 1px solid #e5e7eb;
        }
        
        .move-code {
          font-family: monospace;
          background-color: #e5e7eb;
          padding: 2px 5px;
          border-radius: 4px;
          font-size: 0.9em;
        }
        
        .rating-bar-bg {
          background-color: #e5e7eb;
          border-radius: 9999px;
          height: 8px;
          overflow: hidden;
          width: 100%;
        }
        
        .rating-bar {
          background-color: #10b981;
          height: 100%;
          border-radius: 9999px;
        }
        
        .tagline {
          text-align: center;
          font-style: italic;
          color: #4b5563;
          margin-bottom: 2rem;
          font-weight: 500;
        }

        .back-link {
          display: inline-block;
          margin-bottom: 1.5rem;
          color: #6b7280;
          text-decoration: none;
          font-weight: 600;
          cursor: pointer;
        }

        .back-link:hover {
          color: #064e3b;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 1rem;
          border-bottom: 1px solid #e5e7eb;
          margin-bottom: 1.5rem;
        }

        .header h1 {
          font-size: 2.5rem;
          font-weight: 800;
          color: #1f2937;
          margin: 0;
        }

        .subtitle {
          font-size: 1rem;
          color: #6b7280;
          margin: 0;
        }

        .user-info {
          text-align: right;
        }

        .username {
          font-weight: 600;
          font-size: 1.125rem;
          color: #1f2937;
          margin: 0;
        }

        .date {
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0;
        }

        .grid {
          display: grid;
          gap: 1rem;
        }

        .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
        .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }

        .section {
          margin-bottom: 2rem;
          padding: 1.5rem;
          background-color: rgba(16, 185, 129, 0.05);
          border: 1px solid rgba(16, 185, 129, 0.1);
          border-radius: 0.5rem;
        }

        .weakness-card {
          background-color: #f9fafb;
          padding: 1rem;
          border-radius: 0.5rem;
          border: 1px solid #e5e7eb;
          margin-bottom: 1rem;
        }

        .weakness-card h3 {
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 0.5rem;
        }

        .weakness-card .description {
          font-size: 0.875rem;
          color: #6b7280;
          margin-bottom: 0.75rem;
        }

        .mistake-example {
          margin-top: 0.5rem;
          padding: 0.75rem;
          background: white;
          border-left: 4px solid #ef4444;
          border-radius: 0.25rem;
        }

        .mistake-example .game-info {
          font-size: 0.75rem;
          color: #6b7280;
          margin-bottom: 0.25rem;
        }

        .mistake-example .mistake-text {
          font-size: 0.875rem;
          color: #1f2937;
        }

        @media (max-width: 768px) {
          .page {
            padding: 1.5rem;
          }
          .header {
            flex-direction: column;
            align-items: flex-start;
          }
          /* Stack the Performance Report header and user info on mobile */
          .report-header {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
          .report-header > div:last-child {
            text-align: left !important;
            margin-top: 0.5rem;
          }
          .user-info {
            text-align: left !important;
            margin-top: 1rem;
          }
          .grid-cols-4 {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .grid-cols-2 {
            grid-template-columns: repeat(1, minmax(0, 1fr));
          }
        }

        @media (max-width: 480px) {
          .grid-cols-4 {
            grid-template-columns: repeat(1, minmax(0, 1fr));
          }
        }
      `}</style>
          <style>{`
            @media print {
              /* Hide app chrome and non-report UI */
              header, nav, footer, .print-button-container, .no-print { display: none !important; }

              /* Explicitly show the report's own header */
              .report-header { display: block !important; }

              /* Keep report content in normal flow for reliable clickable links */
              #report-content { position: static !important; width: auto !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

              /* Optimize page appearance */
              .page { box-shadow: none !important; border: none !important; }
              .page-container { max-width: 100% !important; margin: 0 !important; padding: 0 !important; }

              /* Ensure links look like links and remain clickable in PDF */
              a[href] { color: #064e3b !important; text-decoration: underline !important; }
            }

            @page { size: A4; margin: 12mm; }
          `}</style>

      <div className="page-container">
        <div className="print-button-container">
          <button onClick={handleDownloadPDF} className="print-button no-print">
            <i className="fas fa-download" style={{ marginRight: '0.5rem' }}></i>Download PDF
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="page"
          id="report-content"
        >
          <a className="no-print" onClick={handleBackToReport} style={{
            display: 'inline-block',
            marginBottom: '1.5rem',
            color: '#6b7280',
            textDecoration: 'none',
            fontWeight: '600',
            cursor: 'pointer'
          }}>← Back to Summary</a>
          
          <div className="report-header" style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'flex-start', 
            paddingBottom: '1rem',
            borderBottom: '1px solid #e5e7eb',
            marginBottom: '1.5rem'
          }}>
            <div>
              <h1 style={{ 
                fontSize: '2.5rem', 
                fontWeight: '800', 
                color: '#1f2937',
                margin: '0'
              }}>Performance Report </h1>
              <p style={{ 
                fontSize: '1rem', 
                color: '#6b7280',
                margin: '0'
              }}>Personalized chess performance insights</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ 
                fontWeight: '600', 
                fontSize: '1.125rem', 
                color: '#1f2937',
                margin: '0'
              }}>{(analysis?.player?.username || analysis?.username || analysis?.rawAnalysis?.username || analysis?.formData?.username || 'Chess Player')}</p>
              <p style={{ 
                fontSize: '0.875rem', 
                color: '#6b7280',
                margin: '0'
              }}>{new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}</p>
            </div>
          </div>

          <main style={{ marginTop: '1.5rem' }}>
            <div className="tagline">
              <p>"Built by a real master coach, not just a graph-spitting bot."</p>
              <p>"We don't just show you what's wrong — we train you to fix it."</p>
            </div>

            {/* Section 1: Performance Summary */}
            <section style={{ 
              marginBottom: '2rem', 
              padding: '1.5rem', 
              backgroundColor: 'rgba(16, 185, 129, 0.05)', 
              border: '1px solid rgba(16, 185, 129, 0.1)', 
              borderRadius: '0.5rem' 
            }}>
              <h2 className="section-header">
                <i className="fas fa-chart-line"></i>Performance Summary
              </h2>
              <div className="grid grid-cols-4" style={{ marginBottom: '1.5rem' }}>
                <div className="highlight-card" style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
                  <h4 style={{ fontWeight: '700', fontSize: '0.875rem', color: '#166534' }}>Win Rate</h4>
                  <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937', marginTop: '0.25rem' }}>
                    {performanceMetrics?.winRate ? performanceMetrics.winRate : 'Calculating...'}
                  </p>
                </div>
                <div className="highlight-card" style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }} title={performanceMetrics?.accuracyReasoning || 'AI-calculated accuracy based on FEN position analysis'}>
                  <h4 style={{ fontWeight: '700', fontSize: '0.875rem', color: '#1e40af' }}>Average Accuracy</h4>
                  <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937', marginTop: '0.25rem' }}>
                    {performanceMetrics?.averageAccuracy ? performanceMetrics.averageAccuracy : 'Calculating...'}
                  </p>
                  {performanceMetrics?.accuracyReasoning && (
                    <p style={{ fontSize: '0.625rem', color: '#4b5563', marginTop: '0.25rem', fontWeight: '400', fontStyle: 'italic' }}>
                      {performanceMetrics.accuracyReasoning}
                    </p>
                  )}
                </div>
                <div className="highlight-card" style={{ backgroundColor: '#fefce8', borderColor: '#fde047' }}>
                  <h4 style={{ fontWeight: '700', fontSize: '0.875rem', color: '#a16207' }}>Most Played</h4>
                  <p style={{ fontSize: '1.125rem', fontWeight: '700', color: '#1f2937', marginTop: '0.25rem' }}>
                    {performanceMetrics?.mostPlayedOpening || 'Analyzing...'}
                  </p>
                </div>
                <div className="highlight-card" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}>
                  <h4 style={{ fontWeight: '700', fontSize: '0.875rem', color: '#dc2626' }}>#1 Focus Area</h4>
                  <p style={{ fontSize: '1.125rem', fontWeight: '700', color: '#1f2937', marginTop: '0.25rem' }}>
                    {performanceMetrics?.focusArea || 'Analyzing...'}
                  </p>
                </div>
              </div>
              
              {/* Executive Summary from Pawnsposes AI - Replaces Key Insights */}
              {analysis?.pawnsposesAI?.executiveSummary && (
                <div>
                  <h3 style={{ fontWeight: '700', color: '#1f2937', marginBottom: '0.5rem' }}>Executive Summary:</h3>
                  <p style={{ fontSize: '0.875rem', color: '#4b5563', lineHeight: '1.5' }}>
                    {analysis.pawnsposesAI.executiveSummary}
                  </p>
                </div>
              )}
            </section>

            {/* Section 2: Recurring Weaknesses - REMOVED: Now using Pawnsposes AI Analysis only */}
            {false && (
            <section style={{ marginBottom: '2rem' }}>
              <h2 className="section-header" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <i className="fas fa-magnifying-glass-chart"></i>Recurring Weaknesses
                </span>
                {dataSource === 'GeminiRecurringWeaknesses' && recurringWeaknesses && recurringWeaknesses.length > 0 && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.25rem 0.625rem',
                    backgroundColor: '#dbeafe',
                    color: '#1e40af',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    borderRadius: '9999px',
                    border: '1px solid #93c5fd'
                  }}>
                    <i className="fas fa-sparkles" style={{ fontSize: '0.625rem' }}></i>
                    Gemini Verified
                  </span>
                )}
              </h2>
              
              {isAnalyzingWeaknesses ? (
                <div style={{
                  backgroundColor: '#f9fafb',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb',
                  marginBottom: '1rem'
                }}>
                  <h3 style={{ fontWeight: '700', color: '#1f2937' }}>🔍 Analyzing Your Game Positions...</h3>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>Our deep analysis engine is examining your actual game positions with 20-move depth to identify recurring patterns. This may take a few moments.</p>
                </div>
              ) : recurringWeaknesses && recurringWeaknesses.length > 0 ? (
                <div>
                  {(() => {
                    // Filter out weaknesses that only have severity/category (these are fragments)
                    const validWeaknesses = recurringWeaknesses.filter(weakness => 
                      weakness.title && (
                        (typeof weakness.description === 'string' && weakness.description.length > 10) ||
                        (weakness.explanation && weakness.example)
                      )
                    );
                    // Render all weaknesses; do not suppress examples even if same gameNumber
                    
                    
                    return validWeaknesses.map((weakness, index) => {
                      // ✅ NEW: Handle JSON format from FEN-based recurring weaknesses analysis
                      if (weakness.explanation && weakness.example && typeof weakness.example === 'object') {
                        const { explanation, example, betterPlan } = weakness;
                        const { gameNumber, moveNumber, move, fen, explanation: exampleExplanation, betterMove } = example;
                        
                        return (
                          <div key={index} style={{
                            backgroundColor: '#f9fafb',
                            padding: '1rem',
                            borderRadius: '0.5rem',
                            border: '1px solid #e5e7eb',
                            marginBottom: '1rem'
                          }}>
                            {/* Title */}
                            <h3 style={{ fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>
                              {index + 1}. {weakness.title}
                            </h3>

                            {/* Explanation (short description) */}
                            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem', marginBottom: '0.5rem', lineHeight: '1.6' }}>
                              {explanation}
                            </p>

                            {/* Example with game context */}
                            {(() => {
                              // Prefer >10, but always render an example to ensure each weakness has one
                              return (
                                <div style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: 'white', borderLeft: '4px solid #ef4444', borderRadius: '0.25rem' }}>
                                  {/* Game context */}
                                  <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                                    {(() => { let opp = example?.opponent || example?.opponentName || example?.opponent_username; let username = (analysis?.player?.username || analysis?.username || analysis?.rawAnalysis?.username || analysis?.formData?.username || '').toString(); const getNames = (g) => { const white = g?.white?.username || g?.players?.white?.user?.name || g?.gameInfo?.white || (typeof g?.white === 'string' ? g.white : g?.white?.name); const black = g?.black?.username || g?.players?.black?.user?.name || g?.gameInfo?.black || (typeof g?.black === 'string' ? g.black : g?.black?.name); return { white, black }; }; if (!username && Array.isArray(analysis?.games)) { const freq = new Map(); analysis.games.forEach(g => { const { white, black } = getNames(g); if (white) freq.set(white, (freq.get(white) || 0) + 1); if (black) freq.set(black, (freq.get(black) || 0) + 1); }); let best = ''; let bestCount = 0; freq.forEach((count, name) => { if (count > bestCount) { best = name; bestCount = count; } }); username = best || username; } if (!opp && Array.isArray(analysis?.games)) { let g = analysis.games.find(g => Number(g?.gameNumber) === Number(gameNumber)); if (!g && Number.isFinite(Number(gameNumber)) && analysis.games[Number(gameNumber) - 1]) { g = analysis.games[Number(gameNumber) - 1]; } if (g) { const { white, black } = getNames(g); const u = (username || '').toString().toLowerCase(); const w = (white || '').toString().toLowerCase(); const b = (black || '').toString().toLowerCase(); if (u && w && u === w) opp = black || g?.opponent; else if (u && b && u === b) opp = white || g?.opponent; if (!opp && g?.opponent) opp = g.opponent; } } const vsText = opp ? `vs. ${opp}` : `vs. Game ${gameNumber}`; return `${vsText} (Move ${moveNumber})`; })()}
                                  </p>
                                  
                                  {/* Mistake and Better Plan */}
                                  <p style={{ fontSize: '0.875rem', color: '#1f2937', lineHeight: '1.5', margin: 0 }}>
                                    <strong>Mistake:</strong> {move ? `After ${move}, ` : ''}{exampleExplanation}
                                    <br />
                                    <strong>Better Plan:</strong> {betterMove ? `${betterMove}. ` : ''}{betterPlan}
                                  </p>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      }
                      
                      // Prefer enriched fields if present (from deep analysis)
                      if (weakness.opponentContext || weakness.example) {
                        // Shorten description to 2-3 sentences
                        const descSentences = (weakness.description || '').split(/[.!?]+/);
                        let shortDesc = weakness.description || '';
                        if (descSentences.length > 3) {
                          shortDesc = descSentences.slice(0, 2).join('.') + '.';
                        }
                        // Strip any leading 'Description:' label and remove inline Examples
                        shortDesc = shortDesc
                          .replace(/^\s*Description\s*[:\-]?\s*/i, '')
                          .replace(/\bExamples?\s*:\s*[\s\S]*$/i, '')
                          .trim();
                        return (
                          <div key={index} style={{
                            backgroundColor: '#f9fafb',
                            padding: '1rem',
                            borderRadius: '0.5rem',
                            border: '1px solid #e5e7eb',
                            marginBottom: '1rem'
                          }}>
                            {/* Title */}
                            <h3 style={{ fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>
                              {(weakness.title || '').replace(/"/g, '').replace(/^\s*Weakness\s*\d+\s*:\s*/i, '')}
                            </h3>

                            {/* Subtitle (short description) */}
                            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem', marginBottom: '0.25rem', lineHeight: '1.6' }}>
                              {shortDesc}
                            </p>

                            {/* Opponent context: ensure "vs." style */}
                            {weakness.opponentContext && !weakness.example && (
                              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                {weakness.opponentContext.replace(/^vs\s+/i, 'vs. ')}
                              </p>
                            )}

                            {/* Mistake / Better Plan lines parsed from example */}
                            {weakness.example && (() => {
                              const exampleRaw = weakness.example;
                              // Extract move number and played SAN from the prefix if present
                              const prefixMatch = exampleRaw.match(/^Game\s+\d+,\s*Move\s+(\d+)\s*\(([^)]+)\)\s*:\s*/i);
                              const moveNo = prefixMatch ? prefixMatch[1] : null;
                              const sanPlayed = prefixMatch ? prefixMatch[2] : null;
                              // Prefer examples after move 10; if earlier, still render to ensure each weakness has one
                              // (No early-return here) 
                              // Remove the prefix to get the rest
                              const rest = exampleRaw.replace(/^Game\s+\d+,\s*Move\s+\d+\s*\([^)]+\)\s*:\s*/i, '');
                              const parts = rest.split(/;\s*best\s+was\s*/i);
                              const mistakeClause = (parts[0] || '').trim(); // e.g., 'blunder losing 6.4 pawns'
                              const bestSan = (parts[1] || '').replace(/[.\s]+$/,'').trim();

                              // Prefer labeled lines if provided
                              const mistakeLM = exampleRaw.match(/(?:^|\n)\s*Mistake\s*:\s*(.+?)(?:\n|$)/i);
                              const betterLM = exampleRaw.match(/(?:^|\n)\s*Better\s*Plan\s*:\s*(.+?)(?:\n|$)/i);

                              let mistakeSentence = '';
                              let betterPlanSentence = '';
                              if (mistakeLM) {
                                mistakeSentence = mistakeLM[1].trim();
                                if (!/[.!?]$/.test(mistakeSentence)) mistakeSentence += '.';
                              } else if (moveNo && sanPlayed && mistakeClause) {
                                mistakeSentence = `After ${moveNo}. ${sanPlayed}, ${mistakeClause}${/[.!?]$/.test(mistakeClause) ? '' : '.'}`;
                              } else if (mistakeClause) {
                                mistakeSentence = `${mistakeClause}${/[.!?]$/.test(mistakeClause) ? '' : '.'}`;
                              }

                              if (betterLM) {
                                betterPlanSentence = betterLM[1].trim();
                                if (!/[.!?]$/.test(betterPlanSentence)) betterPlanSentence += '.';
                              } else if (bestSan) {
                                betterPlanSentence = `Play ${bestSan}.`;
                              }

                              return (
                                <div style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: 'white', borderLeft: '4px solid #ef4444', borderRadius: '0.25rem' }}>
                                  {/* Opponent context inside the example box */}
                                  {weakness.opponentContext && (
                                    <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                                      {weakness.opponentContext.replace(/^vs\s+/i, 'vs. ')}
                                    </p>
                                  )}
                                  {mistakeSentence && (
                                    <p style={{ fontSize: '0.875rem', color: '#1f2937', lineHeight: '1.5', margin: 0 }}>
                                      <strong>Mistake:</strong> {mistakeSentence}
                                      {betterPlanSentence && (
                                        <> <br /><strong>Better Plan:</strong> {betterPlanSentence}</>
                                      )}
                                    </p>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      }

                      // ✅ NEW FORMAT: Check if weakness has new structure (gameInfo, mistake, betterPlan)
                      if (weakness.gameInfo && weakness.mistake && weakness.betterPlan) {
                        // Use new format directly - no parsing needed!
                        const mainDescription = weakness.subtitle || weakness.description || '';
                        const gameExamples = [{
                          gameInfo: weakness.gameInfo,
                          mistake: weakness.mistake,
                          betterPlan: weakness.betterPlan
                        }];
                        
                        return (
                          <div key={index} style={{
                            backgroundColor: '#f9fafb',
                            padding: '1rem',
                            borderRadius: '0.5rem',
                            border: '1px solid #e5e7eb',
                            marginBottom: '1rem'
                          }}>
                            <h3 style={{ 
                              fontWeight: '700', 
                              color: '#1f2937',
                              marginBottom: '0.25rem'
                            }}>
                              {(weakness.title || '').replace(/"/g, '').replace(/^\s*Weakness\s*\d+\s*:\s*/i, '')}
                            </h3>
                            
                            {/* Main Description (subtitle) */}
                            {mainDescription && (
                              <p style={{ 
                                fontSize: '0.875rem', 
                                color: '#6b7280', 
                                marginTop: '0.25rem',
                                marginBottom: '0.75rem',
                                lineHeight: '1.6'
                              }}>
                                {mainDescription}
                              </p>
                            )}
                            
                            {/* Game Example */}
                            <div style={{
                              marginTop: '0.5rem',
                              padding: '0.75rem',
                              backgroundColor: 'white',
                              borderLeft: '4px solid #ef4444',
                              borderRadius: '0.25rem'
                            }}>
                              <p style={{ 
                                fontSize: '0.75rem', 
                                color: '#6b7280', 
                                marginBottom: '0.25rem'
                              }}>
                                {weakness.gameInfo}
                              </p>
                              <p style={{ 
                                fontSize: '0.875rem', 
                                color: '#1f2937', 
                                lineHeight: '1.5', 
                                margin: 0 
                              }}>
                                <strong>Mistake:</strong> {weakness.mistake}
                              </p>
                              <p style={{ 
                                fontSize: '0.875rem', 
                                color: '#1f2937', 
                                lineHeight: '1.5', 
                                marginTop: '0.5rem' 
                              }}>
                                <strong>Better Plan:</strong> {weakness.betterPlan}
                              </p>
                            </div>
                          </div>
                        );
                      }
                      
                      // ⚠️ OLD FORMAT FALLBACK: Parse the description to extract different sections
                      const fullDescription = weakness.description || '';
                      
                      // Split the description into sections
                      let mainDescription = fullDescription;
                      let examples = '';
                      let improvementAdvice = '';
                      
                      // Extract Examples section (between **Examples:** and **Improvement Advice:**)
                      const examplesRegex = /\*\s*\*\*Examples:\*\*(.*?)(?=\*\s*\*\*Improvement Advice:\*\*|$)/s;
                      const examplesMatch = fullDescription.match(examplesRegex);
                      if (examplesMatch) {
                        examples = examplesMatch[1].trim();
                        mainDescription = mainDescription.replace(examplesMatch[0], '').trim();
                      }
                      
                      // Extract Improvement Advice section
                      const adviceRegex = /\*\s*\*\*Improvement Advice:\*\*(.*?)$/s;
                      const adviceMatch = fullDescription.match(adviceRegex);
                      if (adviceMatch) {
                        improvementAdvice = adviceMatch[1].trim();
                        mainDescription = mainDescription.replace(/\*\s*\*\*Improvement Advice:\*\*.*$/s, '').trim();
                      }
                      
                      // Clean up main description and make it shorter
                      mainDescription = mainDescription
                        .replace(/\*\s*\*\*Examples:\*\*.*$/s, '') // Remove any remaining examples marker
                        .replace(/\bExamples?\s*:\s*[\s\S]*$/i, '') // Remove inline Examples from plain text
                        .replace(/\*\*/g, '') // Remove ** markdown
                        .replace(/\*/g, '') // Remove * markdown
                        .replace(/^\s*Description\s*[:\-]?\s*/i, '') // Remove leading 'Description:' label if present
                        .trim();
                      
                      // Shorten the description to first 2 sentences or 150 characters
                      const sentences = mainDescription.split(/[.!?]+/);
                      if (sentences.length > 2) {
                        mainDescription = sentences.slice(0, 2).join('.') + '.';
                      } else if (mainDescription.length > 150) {
                        mainDescription = mainDescription.substring(0, 150) + '...';
                      }
                      
                      // Parse game examples from the description - look for detailed game analysis
                      const gameExamples = [];
                      
                      // Look for examples section that contains detailed game analysis
                      if (examples) {
                        // Try to extract game examples from the examples section
                        const gamePattern = /\*\s*\*\*Game\s+(\d+)[^:]*:\s*([^:]*?):\*\*(.*?)(?=\*\s*\*\*Game|\*\s*\*\*Improvement|$)/gs;
                        const gameMatches = [...examples.matchAll(gamePattern)];
                        
                        gameMatches.forEach(match => {
                          const gameNum = match[1];
                          const opponent = match[2].trim();
                          const content = match[3].trim();
                          
                          // Extract move details
                          const moveMatch = content.match(/Move\s+(\d+)[^.]*\(([^)]+)\)/i);
                          const moveNum = moveMatch?.[1];
                          const move = moveMatch?.[2];
                          
                          // Extract mistake and better plan
                          let mistake = content;
                          let betterPlan = "Consider alternative moves that improve your position.";
                          
                          // Look for "Better Plan" or similar sections
                          const betterPlanMatch = content.match(/(?:Better Plan|Alternative|Instead)[^.]*[:.]\s*([^.]+\.)/i);
                          if (betterPlanMatch) {
                            betterPlan = betterPlanMatch[1].trim();
                            mistake = content.replace(betterPlanMatch[0], '').trim();
                          }
                          
                          // Clean up mistake text
                          mistake = mistake
                            .replace(/\*\*/g, '')
                            .replace(/Move\s+\d+[^.]*\([^)]+\)[^.]*\.?\s*/i, '')
                            .trim();
                          
                          if (mistake.length > 200) {
                            mistake = mistake.substring(0, 200) + '...';
                          }
                          
                          gameExamples.push({
                            gameInfo: `vs. ${opponent} (Move ${moveNum})`,
                            mistake: `After ${moveNum}. ${move}, ${mistake}`,
                            betterPlan: betterPlan
                          });
                        });
                      }
                      
                      // If no examples section, try to parse from main description and weakness examples
                      if (gameExamples.length === 0) {
                        // First, look for game references in the main description
                        const gameInDescPattern = /Game\s+(\d+),?\s*Move\s+(\d+)[^.]*\(([^)]+)\)[^.]*\./gi;
                        const descMatches = [...fullDescription.matchAll(gameInDescPattern)];
                        
                        descMatches.forEach(match => {
                          const gameNum = parseInt(match[1]);
                          const moveNum = match[2];
                          const move = match[3];
                          
                          // Try to find opponent name from analysis data
                          let opponent = "opponent";
                          if (analysis && analysis.games) {
                            const gameData = analysis.games.find(g => g.gameNumber === gameNum);
                            if (gameData && gameData.opponent) {
                              opponent = gameData.opponent;
                            }
                          }
                          
                          // Generate detailed mistake explanations based on the weakness context
                          let mistake = "";
                          let betterPlan = "";
                          
                          // Extract context around the game reference for better analysis
                          const context = match[0];
                          const pawnLoss = context.match(/([\d.]+)\s+pawns/)?.[1];
                          const weaknessTitle = weakness.title.toLowerCase();
                          
                          // Provide context-specific analysis based on weakness type
                          if (weaknessTitle.includes('tactical') || weaknessTitle.includes('hidden')) {
                            mistake = `The move ${move} overlooks a critical tactical sequence. In this complex position, you missed forcing moves that could have exploited your opponent's piece coordination weaknesses.`;
                            betterPlan = `Look for tactical shots like ${move.includes('g') ? 'f4-f5 breakthrough' : move.includes('B') ? 'Bxh7+ sacrifice' : 'Nxf7 knight sacrifice'} or other forcing continuations that create immediate threats.`;
                          } else if (weaknessTitle.includes('positional') || weaknessTitle.includes('prophylaxis')) {
                            mistake = `The move ${move} fails to address the positional imbalances in the position. You're focusing on immediate tactics while neglecting long-term strategic factors like pawn structure and piece coordination.`;
                            betterPlan = `Consider moves that improve your position structurally, such as ${move.includes('e') ? 'd4-d5 space gain' : move.includes('g') ? 'h3 and g4 kingside expansion' : 'Rd1 and doubling rooks'} to build lasting advantages.`;
                          } else if (weaknessTitle.includes('calculation') || weaknessTitle.includes('depth')) {
                            mistake = `The move ${move} shows insufficient calculation depth. You're not seeing the full consequences of this move, particularly your opponent's strongest responses 3-4 moves ahead.`;
                            betterPlan = `Calculate deeper variations, especially after ${move.includes('g') ? 'opponent\'s f6 counter-attack' : move.includes('B') ? 'opponent\'s piece exchanges' : 'opponent\'s central counterplay'} and ensure your move works in all lines.`;
                          } else {
                            mistake = `The move ${move} doesn't align with the position's requirements. ${pawnLoss ? `This oversight costs approximately ${pawnLoss} pawns in evaluation.` : 'The move lacks strategic purpose.'}`;
                            betterPlan = `Focus on moves that address the position's key features: piece activity, king safety, and pawn structure.`;
                          }
                          
                          gameExamples.push({
                            gameInfo: `vs. ${opponent} (Move ${moveNum})`,
                            mistake: mistake,
                            betterPlan: betterPlan
                          });
                        });
                        
                        // If still no examples from description, use weakness.examples data more intelligently
                        if (gameExamples.length === 0 && weakness.examples && weakness.examples.length > 0) {
                          // Group examples by move number to avoid repetition
                          const moveGroups = {};
                          weakness.examples.forEach(example => {
                            const moveMatch = example.match(/Move\s+(\d+)/);
                            if (moveMatch) {
                              const moveNum = moveMatch[1];
                              if (!moveGroups[moveNum]) {
                                moveGroups[moveNum] = [];
                              }
                              moveGroups[moveNum].push(example);
                            }
                          });
                          
                          // Create examples from different move numbers
                          Object.keys(moveGroups).slice(0, 2).forEach(moveNum => {
                            const examples = moveGroups[moveNum];
                            const firstExample = examples[0];
                            
                            // Try to extract move notation and ensure we have required data
                            const moveNotationMatch = firstExample.match(/([a-h][1-8]|[NBRQK][a-h]?[1-8]?x?[a-h][1-8]|O-O|O-O-O)/);
                            const move = moveNotationMatch ? moveNotationMatch[1] : null;
                            
                            // Get opponent name from analysis data
                            let opponent = null;
                            if (analysis && analysis.games && analysis.games.length > 0) {
                              const gameWithMove = analysis.games.find(g => 
                                g.moves && g.moves.some(m => m.moveNumber == moveNum)
                              );
                              if (gameWithMove && gameWithMove.opponent) {
                                opponent = gameWithMove.opponent;
                              }
                            }
                            
                            // Require both opponent and move; otherwise skip this example
                            if (!opponent || !move) {
                              return;
                            }
                            
                            // Generate contextual analysis
                            const weaknessTitle = weakness.title.toLowerCase();
                            let mistake = "";
                            let betterPlan = "";
                            
                            if (weaknessTitle.includes('tactical')) {
                              mistake = `The move ${move} misses a tactical opportunity in a sharp position. Your calculation didn't go deep enough to spot the winning combination available.`;
                              betterPlan = `Look for forcing sequences starting with checks, captures, and threats. Consider moves like Rxe6, Nxf7+, or Bxh7+ that create immediate tactical pressure.`;
                            } else if (weaknessTitle.includes('positional')) {
                              mistake = `The move ${move} ignores the positional demands of the position. You're not addressing key structural weaknesses or improving your piece coordination.`;
                              betterPlan = `Focus on moves that improve your worst-placed pieces, control key squares, or create long-term advantages like Nd5, Bc4, or f4-f5.`;
                            } else {
                              mistake = `The move ${move} doesn't capitalize on the position's potential. You're missing the critical point of this position type.`;
                              betterPlan = `Study similar positions and look for typical plans involving piece improvements, pawn breaks, or tactical motifs.`;
                            }
                            
                            gameExamples.push({
                              gameInfo: `vs. ${opponent} (Move ${moveNum})`,
                              mistake: mistake,
                              betterPlan: betterPlan
                            });
                          });
                        }
                      }
                      
                      // Final fallback - ensure we always display at least one example
                      if (gameExamples.length === 0) {
                        try {
                          const user = (analysis?.player?.username || analysis?.username || analysis?.formData?.username || '').toString();
                          let chosenGame = null;
                          let chosenMove = null;
                          if (Array.isArray(analysis?.games)) {
                            // Prefer a move after 10 if available
                            outer: for (const g of analysis.games) {
                              if (Array.isArray(g?.moves)) {
                                for (const m of g.moves) {
                                  const mm = Number(m?.moveNumber ?? m?.move_no ?? m?.ply);
                                  if (Number.isFinite(mm) && mm > 10) { chosenGame = g; chosenMove = m; break outer; }
                                }
                              }
                            }
                            // If not found, take any move available as last resort
                            if (!chosenGame) {
                              for (const g of analysis.games) {
                                if (Array.isArray(g?.moves) && g.moves.length > 0) { chosenGame = g; chosenMove = g.moves[Math.min(10, g.moves.length - 1)]; break; }
                              }
                            }
                          }
                          if (chosenGame) {
                            const white = chosenGame?.white?.username || chosenGame?.players?.white?.user?.name || chosenGame?.gameInfo?.white || (typeof chosenGame?.white === 'string' ? chosenGame.white : chosenGame?.white?.name);
                            const black = chosenGame?.black?.username || chosenGame?.players?.black?.user?.name || chosenGame?.gameInfo?.black || (typeof chosenGame?.black === 'string' ? chosenGame.black : chosenGame?.black?.name);
                            let opponent = chosenGame?.opponent || '';
                            if (!opponent && user) {
                              const u = user.toLowerCase();
                              if (white && white.toLowerCase() === u) opponent = black;
                              else if (black && black.toLowerCase() === u) opponent = white;
                            }
                            const moveNum = Number(chosenMove?.moveNumber ?? chosenMove?.move_no ?? chosenMove?.ply) || 12;
                            const san = chosenMove?.san || chosenMove?.notation || chosenMove?.move || '';
                            gameExamples.push({
                              gameInfo: `vs. ${opponent || 'opponent'} (Move ${moveNum})`,
                              mistake: san ? `After ${moveNum}. ${san}, this position reflects the weakness: ${(weakness.title || '').toLowerCase()}.` : `This position reflects the weakness: ${(weakness.title || '').toLowerCase()}.`,
                              betterPlan: 'Look for a plan that improves piece activity, king safety, and pawn structure in line with the theme.'
                            });
                          }
                        } catch (e) {
                          // As a last resort, create a generic example card
                          gameExamples.push({
                            gameInfo: `Example`,
                            mistake: `This position illustrates the theme: ${(weakness.title || '').toLowerCase()}.`,
                            betterPlan: 'Adopt a plan consistent with the theme: improve piece activity, ensure king safety, and fix structural issues.'
                          });
                        }
                      }
                      
                      return (
                        <div key={index} style={{
                          backgroundColor: '#f9fafb',
                          padding: '1rem',
                          borderRadius: '0.5rem',
                          border: '1px solid #e5e7eb',
                          marginBottom: '1rem'
                        }}>
                          <h3 style={{ 
                            fontWeight: '700', 
                            color: '#1f2937',
                            marginBottom: '0.25rem'
                          }}>
                            {(weakness.title || '').replace(/"/g, '').replace(/^\s*Weakness\s*\d+\s*:\s*/i, '')}
                          </h3>
                          
                          {/* Main Description */}
                          <p style={{ 
                            fontSize: '0.875rem', 
                            color: '#6b7280', 
                            marginTop: '0.25rem',
                            marginBottom: '0.75rem',
                            lineHeight: '1.6'
                          }}>
                            {mainDescription}
                          </p>
                          
                          {/* Game Examples */}
                          {gameExamples.length > 0 && gameExamples.map((example, exIdx) => (
                            <div key={exIdx} style={{
                              marginTop: '0.5rem',
                              padding: '0.75rem',
                              backgroundColor: 'white',
                              borderLeft: '4px solid #ef4444',
                              borderRadius: '0.25rem'
                            }}>
                              <p style={{ 
                                fontSize: '0.75rem', 
                                color: '#6b7280', 
                                marginBottom: '0.25rem'
                              }}>
                                {example.gameInfo}
                              </p>
                              <p style={{ 
                                fontSize: '0.875rem', 
                                color: '#1f2937',
                                lineHeight: '1.5'
                              }}>
                                <strong>Mistake:</strong> {example.mistake}
                                <br />
                                <strong>Better Plan:</strong> {example.betterPlan}
                              </p>
                            </div>
                          ))}

                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <div style={{
                  backgroundColor: '#f9fafb',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb',
                  marginBottom: '1rem'
                }}>
                  <h3 style={{ fontWeight: '700', color: '#1f2937' }}>No Weaknesses Detected</h3>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>Great job! Our analysis didn't find any significant recurring patterns in your play.</p>
                </div>
              )}
            </section>
            )}

            {/* Pawnsposes AI Analysis Section */}
            {analysis?.pawnsposesAI && (
              <section style={{ marginBottom: '2rem' }}>
                <h2 className="section-header" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center' }}>
                    <i className="fas fa-chess-king"></i>Recurring Weaknesses
                  </span>
                  
                </h2>

                {/* Executive Summary moved to Performance Summary section */}

                {/* Recurring Weaknesses */}
                {analysis.pawnsposesAI.recurringWeaknesses && analysis.pawnsposesAI.recurringWeaknesses.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ 
                      fontWeight: '700', 
                      color: '#1f2937', 
                      marginBottom: '1rem',
                      fontSize: '1.125rem'
                    }}>
                    </h3>
                    {analysis.pawnsposesAI.recurringWeaknesses.map((weakness, index) => (
                      <div key={index} style={{
                        backgroundColor: '#f9fafb',
                        padding: '1.25rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #e5e7eb',
                        marginBottom: '1rem'
                      }}>
                        {/* Weakness Title */}
                        <h4 style={{ 
                          fontWeight: '700', 
                          color: '#dc2626', 
                          marginBottom: '0.5rem',
                          fontSize: '1rem'
                        }}>
                          {index + 1}. {weakness.title}
                        </h4>

                        {/* Weakness Explanation */}
                        {weakness.explanation && (
                          <p style={{ 
                            fontSize: '0.875rem', 
                            color: '#4b5563', 
                            marginBottom: '1rem',
                            lineHeight: '1.6'
                          }}>
                            {weakness.explanation}
                          </p>
                        )}

                        {/* Examples */}
                        {weakness.examples && weakness.examples.length > 0 && (
                          <div style={{ marginTop: '0.75rem' }}>
                            <p style={{ 
                              fontSize: '0.8rem', 
                              fontWeight: '600', 
                              color: '#6b7280',
                              marginBottom: '0.5rem'
                            }}>
                              Example from your games:
                            </p>
                            {weakness.examples.slice(0, 1).map((example, exIdx) => (
                              <div key={exIdx} style={{
                                backgroundColor: 'white',
                                padding: '0.75rem',
                                borderLeft: '4px solid #ef4444',
                                borderRadius: '0.25rem',
                                marginBottom: '0.5rem'
                              }}>
                                {/* Game Context */}
                                {example.gameNumber && example.moveNumber && (
                                  <p style={{ 
                                    fontSize: '0.75rem', 
                                    color: '#6b7280',
                                    marginBottom: '0.25rem'
                                  }}>
                                    Game {example.gameNumber}, Move {example.moveNumber}
                                    {example.move && ` (${example.move})`}
                                  </p>
                                )}

                                {/* Mistake Explanation */}
                                {example.explanation && (
                                  <p style={{ 
                                    fontSize: '0.875rem', 
                                    color: '#1f2937',
                                    marginBottom: '0.5rem',
                                    lineHeight: '1.5'
                                  }}>
                                    <strong>Why it's a mistake:</strong> {example.explanation}
                                  </p>
                                )}

                                {/* Better Plan */}
                                {example.betterPlan && (
                                  <p style={{ 
                                    fontSize: '0.875rem', 
                                    color: '#059669',
                                    margin: 0,
                                    lineHeight: '1.5'
                                  }}>
                                    <strong>Better plan:</strong> {example.betterPlan}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Superior Plan */}
                        {weakness.superiorPlan && (
                          <div style={{
                            backgroundColor: '#ecfdf5',
                            padding: '0.75rem',
                            borderRadius: '0.25rem',
                            marginTop: '0.75rem',
                            border: '1px solid #a7f3d0'
                          }}>
                            <p style={{ 
                              fontSize: '0.875rem', 
                              color: '#065f46',
                              margin: 0,
                              lineHeight: '1.6'
                            }}>
                              <strong>Superior approach:</strong> {weakness.superiorPlan}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Middlegame Mastery, Endgame Technique, and Improvement Plan sections removed - focusing only on recurring weaknesses */}
              </section>
            )}

            {/* Engine Insights Section */}
            {engineInsights && (
              <section style={{ marginBottom: '2rem' }}>
                <h2 className="section-header">
                  <i className="fas fa-cogs"></i>🤖 Deep Engine Analysis
                </h2>
                <p style={{ 
                  fontSize: '0.875rem', 
                  color: '#6b7280', 
                  marginBottom: '1.5rem',
                  fontStyle: 'italic'
                }}>
                  Advanced Stockfish engine analysis with AI explanations
                </p>
                <div style={{
                  background: 'linear-gradient(135deg, #e0f2fe 0%, #b3e5fc 100%)',
                  border: '2px solid #0288d1',
                  borderRadius: '0.75rem',
                  padding: '2rem',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                }}>
                  <div style={{
                    fontSize: '0.95rem',
                    lineHeight: '1.7',
                    color: '#374151',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {engineInsights}
                  </div>
                </div>
              </section>
            )}

            {/* Section 3: Phase Review */}
            <section style={{ marginBottom: '2rem' }}>
              <h2 className="section-header">
                <i className="fas fa-tasks"></i>Phase Review
              </h2>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
                gap: '1.5rem' 
              }}>
                {/* Middlegame Card */}
                <div style={{
                  backgroundColor: '#f9fafb',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <h3 style={{ 
                    fontWeight: '700', 
                    color: '#1f2937', 
                    marginBottom: '0.75rem' 
                  }}>
                    Middlegame <span style={{ color: '#6b7280', fontWeight: '500' }}>(Overall: {phaseReview?.middlegame?.overall ?? 5}/10)</span>
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                    {(phaseReview?.middlegame?.metrics ?? [
                      { label: 'Positional Understanding', score: 4 },
                      { label: 'Tactical Awareness', score: 7 },
                      { label: 'Plan Formation', score: 3 },
                      { label: 'Piece Coordination', score: 6 },
                    ]).map((m, idx) => (
                      <React.Fragment key={idx}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{m.label}</span><span>{m.score}/10</span>
                        </div>
                        <div className="rating-bar-bg"><div className="rating-bar" style={{ width: `${Math.max(0, Math.min(10, m.score)) * 10}%` }}></div></div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                
                {/* Endgame Card */}
                <div style={{
                  backgroundColor: '#f9fafb',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <h3 style={{ 
                    fontWeight: '700', 
                    color: '#1f2937', 
                    marginBottom: '0.75rem' 
                  }}>
                    Endgame <span style={{ color: '#6b7280', fontWeight: '500' }}>(Overall: {phaseReview?.endgame?.overall ?? 4}/10)</span>
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                    {(phaseReview?.endgame?.details ?? [
                      { label: 'Pawn Endgames (3 games, 33% success)', score: 5 },
                      { label: 'Rook Endgames (2 games, 0% success)', score: 3 },
                      { label: 'Queen Endgames (1 game, 0% success)', score: 4 },
                    ]).map((d, idx) => (
                      <React.Fragment key={idx}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{d.label}</span><span>{d.score}/10</span>
                        </div>
                        <div className="rating-bar-bg"><div className="rating-bar" style={{ width: `${Math.max(0, Math.min(10, d.score)) * 10}%` }}></div></div>
                      </React.Fragment>
                    ))}
                    <p style={{ 
                      fontSize: '0.75rem', 
                      color: '#6b7280', 
                      fontStyle: 'italic', 
                      marginTop: '0.75rem' 
                    }}>
                      {phaseReview?.endgame?.notes ?? 'Common Mistakes: Rushing moves, underestimating opponent resources, passive defence.'}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 4: Action Plan */}
            <section className="action-plan" style={{ marginBottom: '2rem' }}>
              <h2 className="section-header">
                <i className="fas fa-bullseye"></i>Actionable Improvement Plan
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {actionPlan?.items?.length > 0 ? (
                  actionPlan.items.map((item, index) => (
                    <div key={index} className="checklist-item">
                      <span style={{ 
                        color: index === 0 ? '#dc2626' : index === 1 ? '#dc2626' : '#d97706', 
                        fontWeight: '700', 
                        fontSize: '1.125rem', 
                        marginRight: '1rem' 
                      }}>
                        {index < 2 ? 'HIGH' : 'MED'}
                      </span>
                      <div>
                        <strong style={{ fontWeight: '600', color: '#1f2937' }}>
                          {item.title || `Focus Area ${index + 1}`}
                        </strong> {item.plan || item.advice || item.summary || 'Practice this area with targeted drills and review annotated examples.'}

                      </div>
                    </div>
                  ))
                ) : isLoadingActionPlan ? (
                  <div className="checklist-item">
                    <span style={{ color: '#6b7280', fontWeight: '700', fontSize: '1.125rem', marginRight: '1rem' }}>…</span>
                    <div>
                      <strong style={{ fontWeight: '600', color: '#1f2937' }}>Generating:</strong> Creating a personalized, weakness-aware action plan…
                    </div>
                  </div>
                ) : (recurringWeaknesses && recurringWeaknesses.length > 0) ? (
                  recurringWeaknesses.slice(0, 3).map((weakness, index) => (
                    <div key={index} className="checklist-item">
                      <span style={{ 
                        color: index === 0 ? '#dc2626' : index === 1 ? '#dc2626' : '#d97706', 
                        fontWeight: '700', 
                        fontSize: '1.125rem', 
                        marginRight: '1rem' 
                      }}>
                        {index < 2 ? 'HIGH' : 'MED'}
                      </span>
                      <div>
                        <strong style={{ fontWeight: '600', color: '#1f2937' }}>
                          {weakness.title || `Focus Area ${index + 1}`}:
                        </strong> {weakness.betterPlan || weakness.actionPlan || weakness.recommendation || weakness.subtitle || 'Work on this area through focused practice and study.'}
                      </div>
                    </div>
                  ))
                ) : performanceMetrics?.focusArea ? (
                  <div className="checklist-item">
                    <span style={{ color: '#dc2626', fontWeight: '700', fontSize: '1.125rem', marginRight: '1rem' }}>HIGH</span>
                    <div>
                      <strong style={{ fontWeight: '600', color: '#1f2937' }}>Primary Focus Area:</strong> Work on {performanceMetrics.focusArea.toLowerCase()} through targeted practice and study.
                    </div>
                  </div>
                ) : (
                  <div className="checklist-item">
                    <span style={{ color: '#6b7280', fontWeight: '700', fontSize: '1.125rem', marginRight: '1rem' }}>PENDING</span>
                    <div>
                      <strong style={{ fontWeight: '600', color: '#1f2937' }}>Position Analysis in Progress:</strong> Your personalized action plan will be generated once the FEN-based weakness analysis is complete.
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Section 5: Resources */}
            <section>
              <h2 className="section-header">
                <i className="fas fa-book-open"></i>Additional Resources
              </h2>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
                gap: '1rem' 
              }}>
                {/* Personalized Study Recommendation */}
                <div className="checklist-item">
                  <i className="fas fa-chess-king" style={{ color: '#10b981', fontSize: '1.25rem', marginRight: '1rem', marginTop: '0.25rem' }}></i>
                  <div>
                    <h4 style={{ fontWeight: '600', color: '#1f2937' }}>
                      {personalizedResources?.studyRecommendation ? 'Personalized Study Plan' : (performanceMetrics?.focusArea ? `${performanceMetrics.focusArea} Study` : 'Master Game Study')}
                    </h4>
                    <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                      {personalizedResources?.studyRecommendation ? (
                        <p style={{ margin: 0 }}>{personalizedResources.studyRecommendation}</p>
                      ) : positionalStudy ? (
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: '#1f2937' }}>{positionalStudy.title || 'Recommended Game'}</div>
                          <div style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                            {positionalStudy.players || ''}{positionalStudy.event ? ` — ${positionalStudy.event}` : ''}{positionalStudy.year ? ` (${positionalStudy.year})` : ''}{positionalStudy.eco ? ` | ${positionalStudy.eco}` : ''}
                          </div>
                          {positionalStudy.reason && (
                            <div style={{ fontSize: '0.95rem', marginBottom: '0.5rem', color: '#1f2937' }}>{positionalStudy.reason}</div>
                          )}
                          {positionalStudy.link ? (
                            <a href={positionalStudy.link} target="_blank" rel="noreferrer" style={{ color: '#064e3b', fontWeight: 600 }}>
                              Open Study / Game
                            </a>
                          ) : (
                            <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>Use this title to find a study online.</div>
                          )}
                        </div>
                      ) : isLoadingStudy ? (
                        <p style={{ margin: 0 }}>Fetching a master game recommendation based on your weaknesses...</p>
                      ) : (
                        <p style={{ margin: 0 }}>
                          {performanceMetrics?.focusArea?.toLowerCase().includes('tactical') ? (
                            <>Focus on Chess.com tactics trainer or Lichess puzzle rush to improve pattern recognition.</>
                          ) : performanceMetrics?.focusArea?.toLowerCase().includes('endgame') ? (
                            <>Study basic endgame principles with Dvoretsky's Endgame Manual or online endgame trainers.</>
                          ) : performanceMetrics?.focusArea?.toLowerCase().includes('opening') ? (
                            <>Focus on understanding opening principles rather than memorizing long variations.</>
                          ) : (
                            <>Study master games focusing on positional understanding and strategic planning.</>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Video Recommendation */}
                <div className="checklist-item">
                  <i className="fab fa-youtube" style={{ color: '#dc2626', fontSize: '1.25rem', marginRight: '1rem', marginTop: '0.25rem' }}></i>
                  <div>
                    <h4 style={{ fontWeight: '600', color: '#1f2937' }}>
                      {personalizedResources?.videoRecommendation || 'Recommended Video'}
                    </h4>
                    <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                      {videoRec?.url && videoRec?.title ? (
                        <a 
                          href={videoRec.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: '#dc2626', textDecoration: 'underline' }}
                        >
                          Watch: {videoRec.title}
                        </a>
                      ) : personalizedResources?.videoUrl ? (
                        <a 
                          href={personalizedResources.videoUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: '#dc2626', textDecoration: 'underline' }}
                        >
                          Watch: {personalizedResources.videoRecommendation}
                        </a>
                      ) : personalizedResources?.videoRecommendation ? (
                        personalizedResources.videoRecommendation
                      ) : (
                        'Search for instructional videos on your primary weakness area'
                      )}
                    </p>
                  </div>
                </div>
                

                
              </div>
            </section>
          </main>
        </motion.div>
        
        {/* Small "Report saved" marker at bottom right */}
        {reportSaved && (
          <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            backgroundColor: '#10b981',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
            opacity: 0.9
          }}>
            <i className="fas fa-check" style={{ marginRight: '6px', fontSize: '10px' }}></i>
            Report saved
          </div>
        )}
      </div>
    </div>
  );
};

export default FullReport;