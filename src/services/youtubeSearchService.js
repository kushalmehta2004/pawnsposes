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