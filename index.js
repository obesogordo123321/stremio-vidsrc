const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

const manifest = {
  id: 'community.vidsrc',
  version: '1.1.0',
  name: 'Vidsrc.to',
  description: 'Watch movies and TV shows from vidsrc.to',
  resources: ['stream'],
  types: ['movie', 'series'],
  catalogs: [],
  idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

// Helper to extract video URL from the embed page HTML
async function extractVideoUrl(embedUrl) {
  try {
    // Fetch the embed page with a browser-like User-Agent
    const response = await axios.get(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://vidsrc.to/'
      }
    });

    const html = response.data;

    // Common patterns for video URLs in vidsrc.to pages
    const patterns = [
      // "file":"https://..." (JSON inside script)
      /"file"\s*:\s*"(https?:[^"]+\.(?:m3u8|mp4)[^"]*)"/,
      // file:"https://..."
      /file\s*:\s*"(https?:[^"]+\.(?:m3u8|mp4)[^"]*)"/,
      // "file":"https:\/\/..." (escaped slashes)
      /"file"\s*:\s*"(https?:\\\/\\\/[^"]+\.(?:m3u8|mp4)[^"]*)"/,
      // direct .m3u8 URL
      /"(https?:[^"]+\.m3u8[^"]*)"/,
      // <video src="...">
      /<video[^>]+src="([^"]+)"/
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        // Unescape slashes if needed
        let url = match[1].replace(/\\\//g, '/');
        // If relative, prepend embed URL base
        if (url.startsWith('//')) url = 'https:' + url;
        else if (url.startsWith('/')) url = new URL(url, embedUrl).href;
        return url;
      }
    }

    // If no direct match, look for a "sources" array in JSON
    const sourcesMatch = html.match(/sources\s*:\s*(\[[^\]]+\])/);
    if (sourcesMatch) {
      try {
        const sources = JSON.parse(sourcesMatch[1].replace(/'/g, '"'));
        if (Array.isArray(sources) && sources.length > 0) {
          // Pick the first source (or you could sort by quality)
          const firstSource = sources[0];
          if (firstSource.file) return firstSource.file.replace(/\\\//g, '/');
        }
      } catch (e) {
        // ignore parse error
      }
    }

    return null;
  } catch (error) {
    console.error('Extraction error:', error.message);
    return null;
  }
}

builder.defineStreamHandler(async (args) => {
  const { type, id } = args;
  let embedUrl;

  // Determine if id is IMDb (starts with 'tt') or TMDB (numeric)
  const isImdb = id.startsWith('tt');
  const lookupId = isImdb ? id : id; // TMDB IDs are passed as-is

  if (type === 'movie') {
    embedUrl = `https://vidsrc.to/embed/movie/${lookupId}`;
  } else if (type === 'series') {
    const { season, episode } = args;
    if (season && episode) {
      embedUrl = `https://vidsrc.to/embed/tv/${lookupId}/${season}/${episode}`;
    } else {
      return { streams: [] };
    }
  } else {
    return { streams: [] };
  }

  try {
    const videoUrl = await extractVideoUrl(embedUrl);
    if (videoUrl) {
      return {
        streams: [{
          url: videoUrl,
          title: 'Vidsrc.to',
          // Hint that this is a direct stream (not a webpage)
          behaviorHints: { notWebReady: false }
        }]
      };
    }
    return { streams: [] };
  } catch (error) {
    console.error('Stream handler error:', error);
    return { streams: [] };
  }
});

const port = process.env.PORT || 3000;
serveHTTP(builder.getInterface(), { port });
