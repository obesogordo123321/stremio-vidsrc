const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

const manifest = {
  id: 'community.vidsrc',
  version: '1.4.0',
  name: 'Vidsrc.to',
  description: 'Watch movies and TV shows from vidsrc.to',
  resources: ['stream'],
  types: ['movie', 'series'],
  catalogs: [],
  idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

async function fetchWithHeaders(url, referer = 'https://vidsrc.to/') {
  console.log(`Fetching: ${url}`);
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': referer,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    },
    timeout: 15000,
    maxRedirects: 5
  });
  console.log(`Status: ${response.status}, Content-Type: ${response.headers['content-type']}`);
  return response;
}

async function extractVideoUrl(embedUrl, depth = 0) {
  if (depth > 5) {
    console.log('Max recursion depth reached');
    return null;
  }

  try {
    const response = await fetchWithHeaders(embedUrl, embedUrl);
    const html = response.data;

    // Check for iframe
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeMatch) {
      let iframeSrc = iframeMatch[1];
      if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
      else if (iframeSrc.startsWith('/')) iframeSrc = new URL(iframeSrc, embedUrl).href;
      else if (!iframeSrc.startsWith('http')) iframeSrc = new URL(iframeSrc, embedUrl).href;
      console.log(`Following iframe to: ${iframeSrc}`);
      return await extractVideoUrl(iframeSrc, depth + 1);
    }

    // If we're on cloudnestra.com with /rcp/ path, try API
    if (embedUrl.includes('cloudnestra.com/rcp/')) {
      const tokenMatch = embedUrl.match(/\/rcp\/([^\/]+)/);
      if (tokenMatch) {
        const token = tokenMatch[1];
        console.log(`Found cloudnestra token: ${token}`);

        // Try API endpoint (common pattern)
        const apiUrl = `https://cloudnestra.com/api/source/${token}`;
        try {
          console.log(`Trying API: ${apiUrl}`);
          const apiResponse = await axios.post(apiUrl, {}, {
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Referer': embedUrl,
              'X-Requested-With': 'XMLHttpRequest'
            },
            timeout: 10000
          });

          if (apiResponse.data && apiResponse.data.sources) {
            const sources = apiResponse.data.sources;
            if (Array.isArray(sources) && sources.length > 0) {
              // Pick the first source (could sort by quality)
              const videoUrl = sources[0].file;
              console.log(`Found video URL from API: ${videoUrl}`);
              return videoUrl;
            }
          }
        } catch (apiError) {
          console.log(`API request failed: ${apiError.message}`);
        }
      }
    }

    // Fallback to previous patterns (just in case)
    const patterns = [
      /"file"\s*:\s*"(https?:[^"]+\.(?:m3u8|mp4)[^"]*)"/,
      /file\s*:\s*"(https?:[^"]+\.(?:m3u8|mp4)[^"]*)"/,
      /"file"\s*:\s*"(https?:\\\/\\\/[^"]+\.(?:m3u8|mp4)[^"]*)"/,
      /"src"\s*:\s*"(https?:[^"]+\.(?:m3u8|mp4)[^"]*)"/,
      /"(https?:[^"]+\.m3u8[^"]*)"/
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        let url = match[1].replace(/\\\//g, '/');
        if (url.startsWith('//')) url = 'https:' + url;
        console.log(`Found URL via pattern: ${url}`);
        return url;
      }
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

  const isImdb = id.startsWith('tt');
  const lookupId = isImdb ? id : id;

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
          behaviorHints: { notWebReady: false }
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
