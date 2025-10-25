import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import reportService from '../services/reportService';
import pdfService from '../services/pdfService';
import toast from 'react-hot-toast';

// Simple in-memory cache to persist across route toggles within the same session
// Resets naturally when the app reloads or user leaves these pages
let FULL_REPORT_CACHE = { key: null, videoRec: null, positionalStudy: null, actionPlan: null, recurringWeaknesses: null };

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
  const [actionPlan, setActionPlan] = React.useState(null);
  const [isLoadingActionPlan, setIsLoadingActionPlan] = React.useState(false);

  // Gemini-suggested YouTube video for primary weakness
  const [videoRec, setVideoRec] = React.useState({ title: null, creator: null });
  const [isLoadingVideo, setIsLoadingVideo] = React.useState(false);

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

  const topicFromWeakness = React.useMemo(() => {
    const t = (recurringWeaknesses?.[0]?.title || performanceMetrics?.focusArea || '').toString().trim().toLowerCase();
    return t;
  }, [recurringWeaknesses, performanceMetrics]);

  // Ask Gemini to suggest a specific YouTube video for the primary weakness
  React.useEffect(() => {
    let cancelled = false;

    const getGeminiVideoSuggestion = async () => {
      if (!topicFromWeakness || topicFromWeakness.trim().length === 0) {
        setVideoRec({ title: null, creator: null });
        return;
      }

      setIsLoadingVideo(true);
      try {
        const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
        if (!apiKey || apiKey === 'your_gemini_api_key_here') {
          setVideoRec({ title: null, creator: null });
          setIsLoadingVideo(false);
          return;
        }

        const prompt = `You are a chess coach recommending a YouTube video to help improve a player's chess skills.

The player's primary weakness is: "${topicFromWeakness}"

Suggest ONE specific, real, and highly relevant YouTube video that teaches about this weakness.

Return ONLY a JSON object with exactly this format (no markdown, no extra text):
{
  "title": "Exact video title as it appears on YouTube",
  "creator": "Channel creator name"
}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
          })
        });

        if (!response.ok) {
          console.error('Gemini API error:', response.status);
          if (!cancelled) setVideoRec({ title: null, creator: null });
          return;
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Parse JSON response
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart < 0 || jsonEnd <= jsonStart) {
          console.warn('Could not parse Gemini response');
          if (!cancelled) setVideoRec({ title: null, creator: null });
          return;
        }

        const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
        
        if (!cancelled) {
          if (parsed?.title && parsed?.creator) {
            console.log('✅ Video suggestion from Gemini:', parsed.title);
            setVideoRec({
              title: parsed.title,
              creator: parsed.creator
            });
          } else {
            console.warn('Invalid video data from Gemini');
            setVideoRec({ title: null, creator: null });
          }
        }
      } catch (error) {
        console.error('Error getting Gemini video suggestion:', error);
        if (!cancelled) {
          setVideoRec({ title: null, creator: null });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingVideo(false);
        }
      }
    };

    getGeminiVideoSuggestion();
    return () => { cancelled = true; };
  }, [topicFromWeakness]);



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

  // Check if all content has finished loading
  const isAllContentLoaded = React.useMemo(() => {
    const hasVideoContent = !recurringWeaknesses || recurringWeaknesses.length === 0 || (!isLoadingVideo && videoRec?.title !== undefined);
    const hasPositionalStudy = !recurringWeaknesses || recurringWeaknesses.length === 0 || (!isLoadingStudy && positionalStudy !== null);
    const hasActionPlan = !recurringWeaknesses || recurringWeaknesses.length === 0 || (!isLoadingActionPlan && actionPlan !== null);
    
    return hasVideoContent && hasPositionalStudy && hasActionPlan;
  }, [recurringWeaknesses, videoRec, positionalStudy, isLoadingStudy, actionPlan, isLoadingActionPlan, isLoadingVideo]);

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
          isLoadingActionPlan: isLoadingActionPlan
        },
        contentStates: {
          hasVideoRec: !!videoRec?.url,
          hasPositionalStudy: !!positionalStudy,
          hasActionPlan: !!actionPlan
        }
      });

      // Only save if:
      // 1. User is authenticated
      // 2. We have complete analysis data
      // 3. This specific analysis hasn't been saved before
      // 4. Data source indicates this is from a fresh analysis
      // 5. ALL content has finished loading (including async components)
      if (
        user &&
        analysis &&
        performanceMetrics &&
        recurringWeaknesses &&
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

          const username = analysis?.username || analysis?.formData?.username || 'Unknown';
          const platform = analysis?.platform || analysis?.formData?.platform || 'Unknown';
          const gameCount = analysis?.games?.length || analysis?.gameData?.length || 0;
          const title = `${username}'s Chess Analysis Report - ${gameCount} games`;

          // Generate PDF from current page
          const pdfBlob = await pdfService.generatePDFFromCurrentPage(title);

          // Upload PDF to storage
          const pdfUrl = await pdfService.uploadPDFToStorage(pdfBlob, title, user.id);

          // ✅ PHASE 3: Get user's subscription tier
          const subscriptionService = (await import('../services/subscriptionService')).default;
          const subscription = await subscriptionService.getUserSubscription(user.id);
          const subscriptionTier = subscription?.tier || 'free';

        let savedReport;
          
          // ✅ Check if an early report was already created (reportId exists)
          if (reportId) {
            console.log(`🔄 Updating existing report ${reportId} with full analysis data...`);
            
            // Prepare full analysis data
            const fullAnalysisData = {
              analysis,
              performanceMetrics,
              recurringWeaknesses,
              engineInsights,
              improvementRecommendations,
              personalizedResources,
              username,
                platform,
              games: analysis?.games || analysis?.gameData || []
            };
            
            // Update existing report with full data
            savedReport = await reportService.updateReportWithAnalysis(
              reportId,
              fullAnalysisData,
              pdfUrl,
              gameCount
            );
            console.log('✅ Existing report updated with full analysis data');
          } else {
            console.log('🔄 Creating new report (no early report found)...');
            
            // Create new report (fallback for cases where early report wasn't created)
            savedReport = await reportService.saveReport(
              user.id, 
              pdfUrl, 
              platform, 
              username, 
              title, 
              gameCount,
              subscriptionTier
            );
            console.log('✅ New report created');
          }
          
          setReportSaved(true);
          setSavedReportId(savedReport.id);
          SAVED_ANALYSIS_IDS.add(analysisId);
          hasSavedRef.current = true;

          console.log('✅ PDF Report auto-saved successfully:', savedReport.id);

          // ✅ Save puzzles from IndexedDB to Supabase with the reportId
          try {
            console.log('💾 Loading puzzles from IndexedDB and saving to Supabase...');
            console.log('🔍 DEBUG: Username for puzzle loading:', username);
            const { initializePuzzleDatabase, getPuzzleDatabase } = await import('../utils/puzzleDatabase');
            const puzzleAccessService = (await import('../services/puzzleAccessService')).default;
            
            await initializePuzzleDatabase();
            const db = getPuzzleDatabase();
            const version = 'v11-adaptive-4to16plies';
            const keyFor = (type) => `pawnsposes:puzzles:${username}:${type}:${version}`;
            
            console.log('🔍 DEBUG: IndexedDB keys being used:');
            console.log('  - Weakness:', keyFor('fix-weaknesses'));
            console.log('  - Mistakes:', keyFor('learn-mistakes'));
            console.log('  - Openings:', keyFor('master-openings'));
            console.log('  - Endgame:', keyFor('sharpen-endgame'));
            
            // Load all 4 categories from IndexedDB
            const [cachedWeakness, cachedMistakes, cachedOpenings, cachedEndgame] = await Promise.all([
              db.getSetting(keyFor('fix-weaknesses'), null),
              db.getSetting(keyFor('learn-mistakes'), null),
              db.getSetting(keyFor('master-openings'), null),
              db.getSetting(keyFor('sharpen-endgame'), null)
            ]);
            
            console.log('🔍 DEBUG: Loaded from IndexedDB:');
            console.log('  - Weakness puzzles:', cachedWeakness?.puzzles?.length || 0);
            console.log('  - Mistake puzzles:', cachedMistakes?.puzzles?.length || 0);
            console.log('  - Opening puzzles:', cachedOpenings?.puzzles?.length || 0);
            console.log('  - Endgame puzzles:', cachedEndgame?.puzzles?.length || 0);
            
            // Extract puzzles and add category field
            const weaknessWithCategory = (cachedWeakness?.puzzles || []).map(p => ({
              ...p,
              category: 'weakness',
              fen: p.fen || p.position
            }));
            
            const mistakesWithCategory = (cachedMistakes?.puzzles || []).map(p => ({
              ...p,
              category: 'mistake',
              fen: p.fen || p.position
            }));
            
            const openingWithCategory = (cachedOpenings?.puzzles || []).map(p => ({
              ...p,
              category: 'opening',
              fen: p.fen || p.position
            }));
            
            const endgameWithCategory = (cachedEndgame?.puzzles || []).map(p => ({
              ...p,
              category: 'endgame',
              fen: p.fen || p.position
            }));
            
            // Combine all puzzles
            const allPuzzles = [
              ...weaknessWithCategory,
              ...mistakesWithCategory,
              ...openingWithCategory,
              ...endgameWithCategory
            ];
            
            if (allPuzzles.length > 0) {
              console.log(`📊 Found ${allPuzzles.length} puzzles in IndexedDB:`, {
                weakness: weaknessWithCategory.length,
                mistake: mistakesWithCategory.length,
                opening: openingWithCategory.length,
                endgame: endgameWithCategory.length
              });
              
              // Save to Supabase with the reportId
              await puzzleAccessService.storePuzzlesBatchWithFullData(
                allPuzzles,
                user.id,
                savedReport.id, // Use the saved report ID
                1 // Number of teaser puzzles per category
              );
              
              console.log(`✅ Saved ${allPuzzles.length} puzzles to Supabase with report_id: ${savedReport.id}`);
              
              // Mark puzzles as weekly for subscription tracking
              await subscriptionService.markPuzzlesAsWeekly(savedReport.id);
              console.log('✅ Puzzles marked as weekly for subscription tracking');
            } else {
              console.warn('⚠️ No puzzles found in IndexedDB to save');
            }
          } catch (puzzleSaveError) {
            console.error('❌ Failed to save puzzles from IndexedDB to Supabase:', puzzleSaveError);
            // Don't block the flow if puzzle save fails
          }

          // ✅ Increment reports generated counter
          await subscriptionService.incrementReportsGenerated(user.id);
          console.log('✅ Reports generated counter incremented');

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
  }, [user, analysis, performanceMetrics, recurringWeaknesses, engineInsights, improvementRecommendations, personalizedResources, reportId, analysisId, dataSource, isAllContentLoaded, videoRec, positionalStudy, actionPlan]);

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
          display: block;
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
                        const { explanation, example } = weakness;
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
                                  
                                  {/* Mistake with Justification */}
                                  <p style={{ fontSize: '0.875rem', color: '#1f2937', lineHeight: '1.5', margin: 0 }}>
                                    <strong>Mistake:</strong> {move ? `After ${move}, ` : ''}{exampleExplanation}
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

                              let mistakeSentence = '';
                              if (mistakeLM) {
                                mistakeSentence = mistakeLM[1].trim();
                                if (!/[.!?]$/.test(mistakeSentence)) mistakeSentence += '.';
                              } else if (moveNo && sanPlayed && mistakeClause) {
                                mistakeSentence = `After ${moveNo}. ${sanPlayed}, ${mistakeClause}${/[.!?]$/.test(mistakeClause) ? '' : '.'}`;
                              } else if (mistakeClause) {
                                mistakeSentence = `${mistakeClause}${/[.!?]$/.test(mistakeClause) ? '' : '.'}`;
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
                                    </p>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      }

                      // ✅ NEW FORMAT: Check if weakness has new structure (gameInfo, mistake)
                      if (weakness.gameInfo && weakness.mistake) {
                        // Use new format directly - no parsing needed!
                        const mainDescription = weakness.subtitle || weakness.description || '';
                        const gameExamples = [{
                          gameInfo: weakness.gameInfo,
                          mistake: weakness.mistake
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
                          
                          // Extract mistake
                          let mistake = content;
                          
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
                            mistake: `After ${moveNum}. ${move}, ${mistake}`
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
                          
                          // Extract context around the game reference for better analysis
                          const context = match[0];
                          const pawnLoss = context.match(/([\d.]+)\s+pawns/)?.[1];
                          const weaknessTitle = weakness.title.toLowerCase();
                          
                          // Provide context-specific analysis based on weakness type
                          if (weaknessTitle.includes('tactical') || weaknessTitle.includes('hidden')) {
                            mistake = `The move ${move} overlooks a critical tactical sequence. In this complex position, you missed forcing moves that could have exploited your opponent's piece coordination weaknesses.`;
                          } else if (weaknessTitle.includes('positional') || weaknessTitle.includes('prophylaxis')) {
                            mistake = `The move ${move} fails to address the positional imbalances in the position. You're focusing on immediate tactics while neglecting long-term strategic factors like pawn structure and piece coordination.`;
                          } else if (weaknessTitle.includes('calculation') || weaknessTitle.includes('depth')) {
                            mistake = `The move ${move} shows insufficient calculation depth. You're not seeing the full consequences of this move, particularly your opponent's strongest responses 3-4 moves ahead.`;
                          } else {
                            mistake = `The move ${move} doesn't align with the position's requirements. ${pawnLoss ? `This oversight costs approximately ${pawnLoss} pawns in evaluation.` : 'The move lacks strategic purpose.'}`;
                          }
                          
                          gameExamples.push({
                            gameInfo: `vs. ${opponent} (Move ${moveNum})`,
                            mistake: mistake
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
                            
                            if (weaknessTitle.includes('tactical')) {
                              mistake = `The move ${move} misses a tactical opportunity in a sharp position. Your calculation didn't go deep enough to spot the winning combination available.`;
                            } else if (weaknessTitle.includes('positional')) {
                              mistake = `The move ${move} ignores the positional demands of the position. You're not addressing key structural weaknesses or improving your piece coordination.`;
                            } else {
                              mistake = `The move ${move} doesn't capitalize on the position's potential. You're missing the critical point of this position type.`;
                            }
                            
                            gameExamples.push({
                              gameInfo: `vs. ${opponent} (Move ${moveNum})`,
                              mistake: mistake
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
                              mistake: san ? `After ${moveNum}. ${san}, this position reflects the weakness: ${(weakness.title || '').toLowerCase()}.` : `This position reflects the weakness: ${(weakness.title || '').toLowerCase()}.`
                            });
                          }
                        } catch (e) {
                          // As a last resort, create a generic example card
                          gameExamples.push({
                            gameInfo: `Example`,
                            mistake: `This position illustrates the theme: ${(weakness.title || '').toLowerCase()}.`
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

                                {/* Mistake Explanation - 2-line justification */}
                                {example.explanation && (
                                  <div style={{ 
                                    marginBottom: '0.75rem'
                                  }}>
                                    <p style={{ 
                                      fontSize: '0.8rem', 
                                      fontWeight: '600', 
                                      color: '#7f1d1d',
                                      marginBottom: '0.375rem'
                                    }}>
                                      Why this move was inferior:
                                    </p>
                                    <p style={{ 
                                      fontSize: '0.875rem', 
                                      color: '#1f2937',
                                      marginBottom: '0',
                                      lineHeight: '1.6',
                                      whiteSpace: 'pre-wrap',
                                      wordWrap: 'break-word',
                                      paddingLeft: '0.75rem',
                                      borderLeft: '3px solid #fecaca'
                                    }}>
                                      {example.explanation}
                                    </p>
                                  </div>
                                )}

                                {/* FEN Position and View on Lichess Button */}
                                {example.fen && (
                                  <div style={{
                                    marginTop: '0.75rem',
                                    paddingTop: '0.75rem',
                                    borderTop: '1px solid #e5e7eb'
                                  }}>
                                    <p style={{
                                      fontSize: '0.7rem',
                                      color: '#9ca3af',
                                      marginBottom: '0.5rem',
                                      fontFamily: 'monospace',
                                      wordBreak: 'break-all'
                                    }}>
                                      <strong>Position:</strong> {example.fen}
                                    </p>
                                    <button
                                      className="pdf-link"
                                      onClick={() => {
                                        // Open position on Lichess analysis board
                                        // Lichess expects FEN with spaces replaced by underscores
                                        const fenForLichess = example.fen.replace(/ /g, '_');
                                        const lichessUrl = `https://lichess.org/analysis/${fenForLichess}`;
                                        window.open(lichessUrl, '_blank', 'noopener,noreferrer');
                                      }}
                                      data-href={`https://lichess.org/analysis/${(example.fen || '').replace(/ /g, '_')}`}
                                      style={{
                                        backgroundColor: '#3b82f6',
                                        color: 'white',
                                        padding: '0.5rem 1rem',
                                        borderRadius: '0.375rem',
                                        border: 'none',
                                        fontSize: '0.875rem',
                                        fontWeight: '500',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem'
                                      }}
                                      onMouseEnter={(e) => e.target.style.backgroundColor = '#2563eb'}
                                      onMouseLeave={(e) => e.target.style.backgroundColor = '#3b82f6'}
                                    >
                                      <i className="fas fa-external-link-alt"></i>
                                      Analyze on Lichess
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Superior Plan / Better Move Explanation */}
                        {weakness.superiorPlan && (
                          <div style={{
                            backgroundColor: '#f0fdf4',
                            padding: '0.875rem',
                            borderRadius: '0.375rem',
                            marginTop: '1rem',
                            border: '1px solid #bbf7d0',
                            borderLeft: '4px solid #22c55e'
                          }}>
                            <p style={{ 
                              fontSize: '0.8rem', 
                              fontWeight: '600', 
                              color: '#166534',
                              marginBottom: '0.375rem'
                            }}>
                              ✓ Better approach:
                            </p>
                            <p style={{ 
                              fontSize: '0.875rem', 
                              color: '#1b5e20',
                              margin: 0,
                              lineHeight: '1.6'
                            }}>
                              {weakness.superiorPlan}
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


            {/* Section 3: Action Plan - Mental Checklist */}
            <section className="action-plan" style={{ marginBottom: '2rem' }}>
              <h2 className="section-header">
                <i className="fas fa-bullseye"></i>Actionable Improvement Plan
              </h2>
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ 
                  fontSize: '1rem', 
                  fontWeight: '600', 
                  color: '#1f2937',
                  marginBottom: '0.75rem'
                }}>
                  Your 3-Step Mental Checklist For Every Game:
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {actionPlan?.items?.length > 0 ? (
                  actionPlan.items.map((item, index) => (
                    <div key={index} className="checklist-item" style={{ 
                      padding: '1rem',
                      borderLeft: '4px solid #10b981',
                      backgroundColor: '#f9fafb'
                    }}>
                      <div style={{ marginBottom: '0.5rem' }}>
                        <strong style={{ 
                          fontWeight: '700', 
                          color: '#059669',
                          fontSize: '1rem'
                        }}>
                          {item.title || `Rule ${index + 1}`}
                        </strong>
                      </div>
                      <div style={{ 
                        color: '#374151',
                        fontSize: '0.95rem',
                        lineHeight: '1.6'
                      }}>
                        {item.plan || item.advice || item.summary || 'Apply this mental rule during your games.'}
                      </div>
                    </div>
                  ))
                ) : isLoadingActionPlan ? (
                  <div className="checklist-item">
                    <span style={{ color: '#6b7280', fontWeight: '700', fontSize: '1.125rem', marginRight: '1rem' }}>…</span>
                    <div>
                      <strong style={{ fontWeight: '600', color: '#1f2937' }}>Generating:</strong> Creating your personalized 3-step mental checklist…
                    </div>
                  </div>
                ) : (recurringWeaknesses && recurringWeaknesses.length > 0) ? (
                  <div className="checklist-item">
                    <span style={{ color: '#6b7280', fontWeight: '700', fontSize: '1.125rem', marginRight: '1rem' }}>⏳</span>
                    <div>
                      <strong style={{ fontWeight: '600', color: '#1f2937' }}>Mental Checklist Pending:</strong> Your personalized mental checklist will be generated based on your weaknesses.
                    </div>
                  </div>
                ) : performanceMetrics?.focusArea ? (
                  <div className="checklist-item">
                    <span style={{ color: '#6b7280', fontWeight: '700', fontSize: '1.125rem', marginRight: '1rem' }}>⏳</span>
                    <div>
                      <strong style={{ fontWeight: '600', color: '#1f2937' }}>Mental Checklist Pending:</strong> Your personalized mental checklist will be generated once weakness analysis is complete.
                    </div>
                  </div>
                ) : (
                  <div className="checklist-item">
                    <span style={{ color: '#6b7280', fontWeight: '700', fontSize: '1.125rem', marginRight: '1rem' }}>PENDING</span>
                    <div>
                      <strong style={{ fontWeight: '600', color: '#1f2937' }}>Position Analysis in Progress:</strong> Your personalized mental checklist will be generated once the FEN-based weakness analysis is complete.
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
                
      

                {/* Video Recommendation - Gemini-Suggested YouTube Video */}
                {videoRec?.title && (
                  <div className="checklist-item">
                    <i className="fab fa-youtube" style={{ color: '#ff0000', fontSize: '1.25rem', marginRight: '1rem', marginTop: '0.25rem' }}></i>
                    <div style={{ width: '100%' }}>
                      <h4 style={{ fontWeight: '600', color: '#1f2937', margin: '0 0 0.5rem 0' }}>
                        Recommended Video
                      </h4>
                      <p style={{ fontSize: '0.875rem', color: '#4b5563', margin: 0 }}>
                        <span style={{ fontWeight: '600', display: 'block', marginBottom: '0.25rem' }}>
                          ▶ {videoRec.title}
                        </span>
                        {videoRec.creator && (
                          <span style={{ color: '#6b7280', fontSize: '0.8125rem' }}>
                            by {videoRec.creator}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                
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