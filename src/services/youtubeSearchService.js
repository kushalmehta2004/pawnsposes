// Robust YouTube search using official Data API v3
// Requirements: REACT_APP_YOUTUBE_API_KEY in .env
// Returns the best-matching, reputable, non-Shorts video: { title, url }

const fetchJson = async (url) => {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// Convert ISO 8601 YouTube duration (e.g., PT15M45S) to seconds
const durationToSeconds = (iso) => {
  if (!iso || typeof iso !== 'string') return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = parseInt(m[1] || '0', 10);
  const mi = parseInt(m[2] || '0', 10);
  const s = parseInt(m[3] || '0', 10);
  return h * 3600 + mi * 60 + s;
};

// Base search with robust filtering
export const searchFirstYouTubeVideo = async (query) => {
  try {
    const key = process.env.REACT_APP_YOUTUBE_API_KEY;
    if (!key || key === 'your_youtube_api_key_here') {
      console.warn('REACT_APP_YOUTUBE_API_KEY is missing');
      return null;
    }

    // Fetch more results and filter locally to avoid Shorts and low-quality videos
    const buildSearchUrl = (q) =>
      `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&type=video&videoEmbeddable=true&relevanceLanguage=en&safeSearch=moderate&order=relevance&videoSyndicated=true&q=${encodeURIComponent(
        q
      )}&key=${key}`;

    const buildVideosUrl = (ids) =>
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet,status&id=${ids}&key=${key}`;

    // Try provided query; fallback with appended "chess"
    const queries = [query, `${query} chess`];

    for (const q of queries) {
      try {
        const data = await fetchJson(buildSearchUrl(q));
        const items = Array.isArray(data?.items) ? data.items : [];
        const videoIds = items.map((it) => it?.id?.videoId).filter(Boolean);
        if (videoIds.length === 0) continue;

        const details = await fetchJson(buildVideosUrl(videoIds.join(',')));
        const videos = Array.isArray(details?.items) ? details.items : [];

        // Apply filters: not live, not Shorts (duration >= 120s), reputable (views >= 10k), embeddable
        const filtered = videos
          .map((v) => {
            const title = v?.snippet?.title || '';
            const description = v?.snippet?.description || '';
            const durationSec = durationToSeconds(v?.contentDetails?.duration);
            const viewCount = parseInt(v?.statistics?.viewCount || '0', 10);
            const live = (v?.snippet?.liveBroadcastContent || 'none') !== 'none';
            const shortsLike = /#shorts|shorts/i.test(title) || (durationSec > 0 && durationSec < 120);
            const embeddable = v?.status?.embeddable !== false; // default true if not present
            const url = v?.id ? `https://www.youtube.com/watch?v=${v.id}` : null;
            const channelTitle = v?.snippet?.channelTitle || '';
            return { v, title, description, durationSec, viewCount, live, shortsLike, embeddable, url, channelTitle };
          })
          .filter((x) => x.url && !x.live && !x.shortsLike && x.embeddable && x.durationSec >= 120)
          .filter((x) => x.viewCount >= 10000); // reputation threshold

        if (filtered.length === 0) {
          // Relaxed fallback: allow >= 60s and >= 1000 views if nothing passed the strict filter
          const relaxed = videos
            .map((v) => {
              const title = v?.snippet?.title || '';
              const description = v?.snippet?.description || '';
              const durationSec = durationToSeconds(v?.contentDetails?.duration);
              const viewCount = parseInt(v?.statistics?.viewCount || '0', 10);
              const live = (v?.snippet?.liveBroadcastContent || 'none') !== 'none';
              const shortsLike = /#shorts|shorts/i.test(title) || (durationSec > 0 && durationSec < 60);
              const embeddable = v?.status?.embeddable !== false;
              const url = v?.id ? `https://www.youtube.com/watch?v=${v.id}` : null;
              const channelTitle = v?.snippet?.channelTitle || '';
              return { v, title, description, durationSec, viewCount, live, shortsLike, embeddable, url, channelTitle };
            })
            .filter((x) => x.url && !x.live && !x.shortsLike && x.embeddable && x.durationSec >= 60)
            .filter((x) => x.viewCount >= 1000);

          if (relaxed.length === 0) continue;

          // Rank relaxed set
          const rankedRelaxed = relaxed
            .map((x) => ({
              ...x,
              score:
                (q || '')
                  .toLowerCase()
                  .split(/\s+/)
                  .filter(Boolean)
                  .reduce((acc, w) => acc + (x.title.toLowerCase().includes(w) ? 2 : x.description.toLowerCase().includes(w) ? 1 : 0), 0) +
                Math.log10(x.viewCount + 1) +
                (x.durationSec >= 300 && x.durationSec <= 1800 ? 0.5 : 0),
            }))
            .sort((a, b) => b.score - a.score);

          const best = rankedRelaxed[0];
          if (best) return { title: best.title, url: best.url };
          continue;
        }

        // Rank strict set
        const ranked = filtered
          .map((x) => ({
            ...x,
            score:
              (q || '')
                .toLowerCase()
                .split(/\s+/)
                .filter(Boolean)
                .reduce((acc, w) => acc + (x.title.toLowerCase().includes(w) ? 2 : x.description.toLowerCase().includes(w) ? 1 : 0), 0) +
              Math.log10(x.viewCount + 1) +
              (x.durationSec >= 300 && x.durationSec <= 1800 ? 0.5 : 0),
          }))
          .sort((a, b) => b.score - a.score);

        const best = ranked[0];
        if (best) {
          return { title: best.title, url: best.url };
        }
      } catch (_) {
        // try next query
      }
    }

    return null;
  } catch (e) {
    console.warn('searchFirstYouTubeVideo failed:', e.message);
    return null;
  }
};

// Build targeted queries from weakness title and prioritize reputable channels
export const searchBestYouTubeForWeakness = async (weaknessTitleRaw) => {
  const key = process.env.REACT_APP_YOUTUBE_API_KEY;
  if (!key || key === 'your_youtube_api_key_here') {
    console.warn('REACT_APP_YOUTUBE_API_KEY is missing');
    return null;
  }

  const preferredChannels = new Set([
    'GothamChess',
    'agadmator',
    'Saint Louis Chess Club',
    'ChessNetwork',
    'Chess.com',
    'Hanging Pawns',
    'Eric Rosen',
    'thechesswebsite',
    'NM Robert Ramirez',
    'GM Igor Smirnov',
    'Chess Vibes',
  ]);

  const normalize = (s) => (s || '').toString().replace(/weakness\s*:\s*/i, '').trim();
  const base = normalize(weaknessTitleRaw);
  const topic = base.toLowerCase();

  const openings = ['sicilian', 'caro', 'caro-kann', 'french', 'ruy', 'lopez', "queen's gambit", 'queens gambit', "king's indian", 'kings indian', 'scandinavian', 'nimzo', 'grunfeld', 'benoni', 'pirc', 'alekhine'];
  const tactics = ['fork', 'pin', 'skewer', 'discovered attack', 'double attack', 'x-ray', 'zwischenzug', 'back rank', 'removal of the defender', 'overload'];
  const endgames = ['rook endgame', 'king and pawn', 'opposition', 'triangulation', 'zugzwang', 'minor piece endgame'];

  const q = [];
  q.push(`${base} chess`);
  q.push(`${base} chess lesson`);
  q.push(`how to ${base} in chess`);
  q.push(`${base} explained chess`);

  if (openings.some((o) => topic.includes(o))) {
    q.push(`${base} explained`);
    q.push(`${base} basics`);
    q.push(`${base} traps`);
  }
  if (tactics.some((t) => topic.includes(t))) {
    const tword = tactics.find((t) => topic.includes(t));
    q.push(`${tword} tactics chess`);
    q.push(`${tword} in chess explained`);
  }
  if (endgames.some((e) => topic.includes(e))) {
    const eword = endgames.find((e) => topic.includes(e));
    q.push(`${eword} chess basics`);
    q.push(`${eword} essential principles chess`);
  }

  // De-duplicate queries while preserving order
  const queries = Array.from(new Set(q));

  const buildSearchUrl = (qq) =>
    `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&type=video&videoEmbeddable=true&relevanceLanguage=en&safeSearch=moderate&order=relevance&videoSyndicated=true&q=${encodeURIComponent(
      qq
    )}&key=${key}`;

  const buildVideosUrl = (ids) =>
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet,status&id=${ids}&key=${key}`;

  // Accumulate candidate videos from all queries
  const byId = new Map();
  for (const qq of queries) {
    try {
      const data = await fetchJson(buildSearchUrl(qq));
      const items = Array.isArray(data?.items) ? data.items : [];
      const videoIds = items.map((it) => it?.id?.videoId).filter(Boolean);
      if (videoIds.length === 0) continue;
      const details = await fetchJson(buildVideosUrl(videoIds.join(',')));
      const videos = Array.isArray(details?.items) ? details.items : [];
      for (const v of videos) {
        const id = v?.id;
        if (!id || byId.has(id)) continue;
        const title = v?.snippet?.title || '';
        const description = v?.snippet?.description || '';
        const durationSec = durationToSeconds(v?.contentDetails?.duration);
        const viewCount = parseInt(v?.statistics?.viewCount || '0', 10);
        const live = (v?.snippet?.liveBroadcastContent || 'none') !== 'none';
        const shortsLike = /#shorts|shorts/i.test(title) || (durationSec > 0 && durationSec < 120);
        const embeddable = v?.status?.embeddable !== false;
        const url = `https://www.youtube.com/watch?v=${id}`;
        const channelTitle = v?.snippet?.channelTitle || '';
        const publishedAt = new Date(v?.snippet?.publishedAt || 0).getTime();
        byId.set(id, { id, title, description, durationSec, viewCount, live, shortsLike, embeddable, url, channelTitle, publishedAt });
      }
    } catch (_) {
      // ignore this query and continue
    }
  }

  const all = Array.from(byId.values())
    .filter((x) => x.url && !x.live && !x.shortsLike && x.embeddable && x.durationSec >= 120)
    .filter((x) => x.viewCount >= 5000); // slightly relaxed to broaden pool

  if (all.length === 0) return null;

  // Rank with channel preference and textual relevance
  const ranked = all
    .map((x) => ({
      ...x,
      score:
        // text relevance across all query words
        queries.join(' ').toLowerCase().split(/\s+/).filter(Boolean).reduce(
          (acc, w) => acc + (x.title.toLowerCase().includes(w) ? 2 : x.description.toLowerCase().includes(w) ? 1 : 0),
          0
        ) +
        Math.log10(x.viewCount + 1) +
        (x.durationSec >= 300 && x.durationSec <= 2400 ? 0.5 : 0) +
        (preferredChannels.has(x.channelTitle) ? 3 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  return best ? { title: best.title, url: best.url } : null;
};

// Verify that a specific video from Gemini actually exists on YouTube and is accessible
export const verifyGeminiVideoSuggestion = async (geminiTitle, geminiCreator) => {
  try {
    const key = process.env.REACT_APP_YOUTUBE_API_KEY;
    if (!key || key === 'your_youtube_api_key_here') {
      console.warn('REACT_APP_YOUTUBE_API_KEY is missing - cannot verify video');
      return null;
    }

    if (!geminiTitle || !geminiCreator) {
      console.warn('Missing gemini title or creator');
      return null;
    }

    console.log(`🔍 Verifying Gemini video suggestion: "${geminiTitle}" by ${geminiCreator}`);

    // Build search URL for exact match: search for the exact title AND channel name
    const searchQuery = `${geminiTitle.trim()} ${geminiCreator.trim()}`;
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&type=video&videoEmbeddable=true&relevanceLanguage=en&safeSearch=moderate&order=relevance&videoSyndicated=true&q=${encodeURIComponent(
      searchQuery
    )}&key=${key}`;

    const buildVideosUrl = (ids) =>
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet,status&id=${ids}&key=${key}`;

    // Search for the video
    const searchData = await fetchJson(searchUrl);
    const items = Array.isArray(searchData?.items) ? searchData.items : [];
    const videoIds = items.map((it) => it?.id?.videoId).filter(Boolean);

    if (videoIds.length === 0) {
      console.warn(`❌ No videos found for: "${geminiTitle}" by ${geminiCreator}`);
      return null;
    }

    // Get detailed info about found videos
    const videosUrl = buildVideosUrl(videoIds.join(','));
    const videosData = await fetchJson(videosUrl);
    const videos = Array.isArray(videosData?.items) ? videosData.items : [];

    // Filter for accessible, verified videos
    const candidates = videos
      .map((v) => {
        const title = v?.snippet?.title || '';
        const channelTitle = v?.snippet?.channelTitle || '';
        const description = v?.snippet?.description || '';
        const durationSec = durationToSeconds(v?.contentDetails?.duration);
        const viewCount = parseInt(v?.statistics?.viewCount || '0', 10);
        const live = (v?.snippet?.liveBroadcastContent || 'none') !== 'none';
        const embeddable = v?.status?.embeddable !== false;
        const regionRestricted = v?.contentDetails?.regionRestriction ? true : false;
        const url = `https://www.youtube.com/watch?v=${v.id}`;

        // Calculate title similarity (basic check if title contains key words from gemini suggestion)
        const geminiBits = geminiTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const titleBits = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const commonWords = geminiBits.filter(w => titleBits.some(t => t.includes(w) || w.includes(t)));
        const titleSimilarity = commonWords.length / Math.max(geminiBits.length, 1);

        return {
          id: v.id,
          title,
          channelTitle,
          description,
          durationSec,
          viewCount,
          live,
          embeddable,
          regionRestricted,
          url,
          titleSimilarity,
          channelMatch: channelTitle.toLowerCase().includes(geminiCreator.toLowerCase()) || 
                       geminiCreator.toLowerCase().includes(channelTitle.toLowerCase())
        };
      })
      .filter((x) => {
        // Must have URL and be accessible
        if (!x.url || x.live) return false;
        
        // Must be embeddable
        if (!x.embeddable) {
          console.warn(`⚠️ Video "${x.title}" is not embeddable (restricted)`);
          return false;
        }

        // Should NOT be region restricted
        if (x.regionRestricted) {
          console.warn(`⚠️ Video "${x.title}" has region restrictions`);
          return false;
        }

        // Must be at least 120 seconds (2 minutes) for educational content
        if (x.durationSec < 120) {
          console.warn(`⚠️ Video "${x.title}" is too short (${x.durationSec}s)`);
          return false;
        }

        // Should have reasonable view count (at least 1000 views)
        if (x.viewCount < 1000) {
          console.warn(`⚠️ Video "${x.title}" has low view count (${x.viewCount})`);
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Prioritize channel match, then title similarity, then view count
        if (a.channelMatch !== b.channelMatch) {
          return a.channelMatch ? -1 : 1;
        }
        if (a.titleSimilarity !== b.titleSimilarity) {
          return b.titleSimilarity - a.titleSimilarity;
        }
        return b.viewCount - a.viewCount;
      });

    if (candidates.length === 0) {
      console.warn(`❌ No accessible videos found matching: "${geminiTitle}" by ${geminiCreator}`);
      return null;
    }

    const best = candidates[0];
    console.log(`✅ Verified Gemini video: "${best.title}" by ${best.channelTitle}`);
    console.log(`   URL: ${best.url} | Views: ${best.viewCount} | Duration: ${best.durationSec}s`);
    console.log(`   Channel Match: ${best.channelMatch} | Title Similarity: ${(best.titleSimilarity * 100).toFixed(0)}%`);

    return {
      title: best.title,
      creator: best.channelTitle,
      url: best.url,
      viewCount: best.viewCount,
      duration: best.durationSec,
      verified: true
    };

  } catch (e) {
    console.error('❌ Video verification failed:', e.message);
    return null;
  }
};

// Fallback search: Find best verified video for a weakness topic
export const searchFallbackVideo = async (weaknessTopic) => {
  try {
    const key = process.env.REACT_APP_YOUTUBE_API_KEY;
    if (!key || key === 'your_youtube_api_key_here') {
      console.warn('REACT_APP_YOUTUBE_API_KEY is missing - cannot search videos');
      return null;
    }

    if (!weaknessTopic || typeof weaknessTopic !== 'string' || weaknessTopic.trim().length === 0) {
      console.warn('Invalid weakness topic provided');
      return null;
    }

    console.log(`🔍 Searching fallback video for weakness: "${weaknessTopic}"`);

    // Search with the weakness topic + "chess tutorial" to get educational videos
    const searchQuery = `${weaknessTopic.trim()} chess tutorial`;
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=25&type=video&videoEmbeddable=true&relevanceLanguage=en&safeSearch=moderate&order=viewCount&videoSyndicated=true&q=${encodeURIComponent(
      searchQuery
    )}&key=${key}`;

    const buildVideosUrl = (ids) =>
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet,status&id=${ids}&key=${key}`;

    // Search for videos
    const searchData = await fetchJson(searchUrl);
    const items = Array.isArray(searchData?.items) ? searchData.items : [];
    const videoIds = items.map((it) => it?.id?.videoId).filter(Boolean);

    if (videoIds.length === 0) {
      console.warn(`❌ No fallback videos found for: "${weaknessTopic}"`);
      return null;
    }

    // Get detailed info
    const videosUrl = buildVideosUrl(videoIds.join(','));
    const videosData = await fetchJson(videosUrl);
    const videos = Array.isArray(videosData?.items) ? videosData.items : [];

    // Apply same strict quality filters
    const candidates = videos
      .map((v) => {
        const title = v?.snippet?.title || '';
        const channelTitle = v?.snippet?.channelTitle || '';
        const durationSec = durationToSeconds(v?.contentDetails?.duration);
        const viewCount = parseInt(v?.statistics?.viewCount || '0', 10);
        const live = (v?.snippet?.liveBroadcastContent || 'none') !== 'none';
        const embeddable = v?.status?.embeddable !== false;
        const videoId = v?.id;

        return {
          videoId,
          title,
          channelTitle,
          durationSec,
          viewCount,
          live,
          embeddable,
          url: `https://www.youtube.com/watch?v=${videoId}`
        };
      })
      .filter((v) => {
        // Apply same strict verification filters
        if (!v.embeddable) {
          console.warn(`⚠️ Fallback video "${v.title}" is not embeddable (restricted)`);
          return false;
        }
        if (v.live) {
          console.warn(`⚠️ Fallback video "${v.title}" is a live stream`);
          return false;
        }
        if (v.durationSec < 120) {
          console.warn(`⚠️ Fallback video "${v.title}" is too short (${v.durationSec}s)`);
          return false;
        }
        if (v.viewCount < 1000) {
          console.warn(`⚠️ Fallback video "${v.title}" has low view count (${v.viewCount})`);
          return false;
        }
        return true;
      })
      .sort((a, b) => b.viewCount - a.viewCount); // Sort by view count (already ordered by API)

    if (candidates.length === 0) {
      console.warn(`❌ No accessible fallback videos found for: "${weaknessTopic}"`);
      return null;
    }

    const best = candidates[0];
    console.log(`✅ Found fallback video: "${best.title}" by ${best.channelTitle}`);
    console.log(`   URL: ${best.url} | Views: ${best.viewCount} | Duration: ${best.durationSec}s`);

    return {
      title: best.title,
      creator: best.channelTitle,
      url: best.url,
      viewCount: best.viewCount,
      duration: best.durationSec,
      verified: true,
      isFallback: true
    };

  } catch (e) {
    console.error('❌ Fallback video search failed:', e.message);
    return null;
  }
};