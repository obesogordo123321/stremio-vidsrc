const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

const manifest = {
  id: 'community.vidsrc',
  version: '1.2.0',
  name: 'Vidsrc.to',
  description: 'Watch movies and TV shows from vidsrc.to',
  resources: ['stream'],
  types: ['movie', 'series'],
  catalogs: [],
  idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

// Helper to fetch URL with browser headers
async function fetchWithHeaders(url) {
  return axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://vidsrc.to/',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    },
    timeout: 10000
  });
}

// Recursively extract video URL from embed page, following iframes
async function extractVideoUrl(embedUrl, depth = 0) {
  if (depth > 3) return null; // Prevent infinite loops
  try {
    console.log(`Fetching embed URL: ${embedUrl}`);
    const response = await fetchWithHeaders(embedUrl);
    const html = response.data;

    // 1. Check for iframe and follow it
    const iframeMatch = html.match(/<iframe[^>]+src="([^"]+)"/i);
    if (iframeMatch) {
      let iframeSrc = iframeMatch[1];
      if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
      else if (iframeSrc.startsWith('/')) iframeSrc = new URL(iframeSrc, embedUrl).href;
      else if (!iframeSrc.startsWith('http')) iframeSrc = new URL(iframeSrc, embedUrl).href;
      console.log(`Following iframe: ${iframeSrc}`);
      return await extractVideoUrl(iframeSrc, depth + 1);
    }

    // 2. Look for video URL in script tags
    const scriptPatterns = [
      // "file":"https://..."
      /"file"\s*:\s*"(https?:[^"]+\.(?:m3u8|mp4)[^"]*)"/,
      // file:"https://..."
      /file\s*:\s*"(https?:[^"]+\.(?:m3u8|mp4)[^"]*)"/,
      // "file":"https:\/\/..." (escaped slashes)
      /"file"\s*:\s*"(https?:\\\/\\\/[^"]+\.(?:m3u8|mp4)[^"]*)"/,
      // "file":"\/\/..." (protocol-relative)
      /"file"\s*:\s*"(\\\/\\\/[^"]+\.(?:m3u8|mp4)[^"]*)"/,
      // "src":"https://..."
      /"src"\s*:\s*"(https?:[^"]+\.(?:m3u8|mp4)[^"]*)"/,
      // "playlist_url":"https://..."
      /"playlist_url"\s*:\s*"(https?:[^"]+\.m3u8[^"]*)"/
    ];

    for (const pattern of scriptPatterns) {
      const match = html.match(pattern);
      if (match) {
        let url = match[1].replace(/\\\//g, '/');
        if (url.startsWith('//')) url = 'https:' + url;
        console.log(`Found video URL: ${url}`);
        return url;
      }
    }

    // 3. Look for sources array (common in vidsrc)
    const sourcesMatch = html.match(/sources\s*:\s*(\[[^\]]+\])/);
    if (sourcesMatch) {
      try {
        // Replace single quotes with double quotes for valid JSON
        const sourcesJson = sourcesMatch[1].replace(/'/g, '"');
        const sources = JSON.parse(sourcesJson);
        if (Array.isArray(sources) && sources.length > 0) {
          // Find the first source with a file (could also pick highest quality)
          for (const source of sources) {
            if (source.file) {
              let url = source.file.replace(/\\\//g, '/');
              if (url.startsWith('//')) url = 'https:' + url;
              console.log(`Found source from sources array: ${url}`);
              return url;
            }
          }
        }
      } catch (e) {
        console.log('Failed to parse sources array:', e.message);
      }
    }

    // 4. Look for video element with src
    const videoSrcMatch = html.match(/<video[^>]+src="([^"]+)"/i);
    if (videoSrcMatch) {
      let url = videoSrcMatch[1];
      if (url.startsWith('//')) url = 'https:' + url;
      else if (url.startsWith('/')) url = new URL(url, embedUrl).href;
      console.log(`Found video src: ${url}`);
      return url;
    }

    // 5. Look for any .m3u8 URL in the whole HTML
    const m3u8Match = html.match(/"(https?:[^"]+\.m3u8[^"]*)"/);
    if (m3u8Match) {
      let url = m3u8Match[1].replace(/\\\//g, '/');
      console.log(`Found .m3u8 URL: ${url}`);
      return url;
    }

    console.log('No video URL found in this page.');
    return null;
  } catch (error) {
    console.error(`Error fetching ${embedUrl}:`, error.message);
    return null;
  }
}

builder.defineStreamHandler(async (args) => {
  const { type, id } = args;
  console.log(`Stream request: type=${type}, id=${id}, args=${JSON.stringify(args)}`);

  // Determine if id is IMDb (starts with 'tt') or TMDB (numeric)
  const isImdb = id.startsWith('tt');
  const lookupId = isImdb ? id : id; // TMDB IDs are passed as-is

  let embedUrl;
  if (type === 'movie') {
    embedUrl = `https://vidsrc.to/embed/movie/${lookupId}`;
  } else if (type === 'series') {
    const { season, episode } = args;
    if (!season || !episode) {
      console.log('Missing season/episode for series');
      return { streams: [] };
    }
    embedUrl = `https://vidsrc.to/embed/tv/${lookupId}/${season}/${episode}`;
  } else {
    return { streams: [] };
  }

  console.log(`Constructed embed URL: ${embedUrl}`);

  try {
    const videoUrl = await extractVideoUrl(embedUrl);
    if (videoUrl) {
      return {
        streams: [{
          url: videoUrl,
          title: 'Vidsrc.to',
          behaviorHints: { notWebReady: false } // direct stream
        }]
      };
    } else {
      console.log('No video stream found');
      return { streams: [] };
    }
  } catch (error) {
    console.error('Stream handler error:', error);
    return { streams: [] };
  }
});

const port = process.env.PORT || 3000;
serveHTTP(builder.getInterface(), { port });
