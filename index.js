const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

const manifest = {
  id: 'community.vidsrc',
  version: '1.3.0',
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

    // Log a snippet to see what we're dealing with
    console.log('HTML snippet (first 2000 chars):');
    console.log(html.substring(0, 2000));

    // 1. Check for iframe and follow it
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeMatch) {
      let iframeSrc = iframeMatch[1];
      if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
      else if (iframeSrc.startsWith('/')) iframeSrc = new URL(iframeSrc, embedUrl).href;
      else if (!iframeSrc.startsWith('http')) iframeSrc = new URL(iframeSrc, embedUrl).href;
      console.log(`Following iframe to: ${iframeSrc}`);
      return await extractVideoUrl(iframeSrc, depth + 1);
    }

    // 2. Look for common patterns in script tags
    const scriptPatterns = [
      // "file":"https://..."
      /"file"\s*:\s*"(https?:[^"]+\.(?:m3u8|mp4)[^"]*)"/,
      // file:"https://..."
      /file\s*:\s*"(https?:[^"]+\.(?:m3u8|mp4)[^"]*)"/,
      // "file":"https:\/\/..." (escaped)
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
        console.log(`Found URL via pattern: ${url}`);
        return url;
      }
    }

    // 3. Look for sources array
    const sourcesMatch = html.match(/sources\s*:\s*(\[[^\]]+\])/);
    if (sourcesMatch) {
      try {
        const sourcesJson = sourcesMatch[1].replace(/'/g, '"');
        const sources = JSON.parse(sourcesJson);
        if (Array.isArray(sources) && sources.length > 0) {
          for (const source of sources) {
            if (source.file) {
              let url = source.file.replace(/\\\//g, '/');
              if (url.startsWith('//')) url = 'https:' + url;
              console.log(`Found URL in sources array: ${url}`);
              return url;
            }
          }
        }
      } catch (e) {
        console.log('Failed to parse sources array:', e.message);
      }
    }

    // 4. Look for video element src
    const videoSrcMatch = html.match(/<video[^>]+src=["']([^"']+)["']/i);
    if (videoSrcMatch) {
      let url = videoSrcMatch[1];
      if (url.startsWith('//')) url = 'https:' + url;
      else if (url.startsWith('/')) url = new URL(url, embedUrl).href;
      console.log(`Found video src: ${url}`);
      return url;
    }

    // 5. Look for any .m3u8 URL
    const m3u8Match = html.match(/"(https?:[^"]+\.m3u8[^"]*)"/);
    if (m3u8Match) {
      let url = m3u8Match[1].replace(/\\\//g, '/');
      console.log(`Found .m3u8 URL: ${url}`);
      return url;
    }

    // 6. Look for player configuration object
    const configMatch = html.match(/playerConfig\s*=\s*({.+?});/);
    if (configMatch) {
      try {
        const config = JSON.parse(configMatch[1]);
        // Explore common keys: file, sources, playlist, etc.
        if (config.file) {
          let url = config.file.replace(/\\\//g, '/');
          if (url.startsWith('//')) url = 'https:' + url;
          console.log(`Found URL in playerConfig.file: ${url}`);
          return url;
        }
        if (config.sources && Array.isArray(config.sources)) {
          for (const source of config.sources) {
            if (source.file) {
              let url = source.file.replace(/\\\//g, '/');
              if (url.startsWith('//')) url = 'https:' + url;
              console.log(`Found URL in playerConfig.sources: ${url}`);
              return url;
            }
          }
        }
      } catch (e) {
        console.log('Failed to parse playerConfig:', e.message);
      }
    }

    // 7. If nothing found, maybe it's a JSON API response? Check if response is JSON
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      try {
        const json = response.data;
        console.log('Response appears to be JSON, attempting to extract URL');
        // Try to find a field containing a video URL
        const jsonStr = JSON.stringify(json);
        const urlMatch = jsonStr.match(/"https?:[^"]+\.(?:m3u8|mp4)[^"]*"/);
        if (urlMatch) {
          let url = urlMatch[0].slice(1, -1).replace(/\\\//g, '/');
          console.log(`Found URL in JSON: ${url}`);
          return url;
        }
      } catch (e) {
        console.log('JSON parsing failed:', e.message);
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

  // Determine if id is IMDb (starts with 'tt') or TMDB (numeric)
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
