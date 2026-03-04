const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const manifest = {
    id: 'community.vidsrc-to-direct',
    version: '1.0.1', // updated version
    name: 'VidSrc.to Direct',
    description: 'Play videos from vidsrc.to directly in Stremio',
    resources: ['stream'],
    types: ['movie', 'series'],
    catalogs: [],
    idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

// More comprehensive extraction
async function extractVideoUrl(embedUrl) {
    try {
        console.log(`Fetching embed: ${embedUrl}`);
        const response = await axios.get(embedUrl, {
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
        const html = response.data;
        const $ = cheerio.load(html);

        // Method 1: Look for video element source
        let videoSrc = $('video source').attr('src') || $('video').attr('src');
        if (videoSrc) {
            console.log('Found video src:', videoSrc);
            return videoSrc;
        }

        // Method 2: Search in script tags for various patterns
        const scripts = $('script').map((i, el) => $(el).html()).get();
        for (let script of scripts) {
            if (!script) continue;
            // Common patterns: "file":"https://...", "src":"https://...", "url":"https://..."
            const patterns = [
                /["'](?:file|src|url)["']\s*:\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/,
                /(https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)/
            ];
            for (let pattern of patterns) {
                const match = script.match(pattern);
                if (match) {
                    console.log('Found in script:', match[1] || match[0]);
                    return match[1] || match[0];
                }
            }
        }

        // Method 3: Look for iframe and recurse (some sources are inside another iframe)
        const iframeSrc = $('iframe').attr('src');
        if (iframeSrc && iframeSrc.startsWith('http')) {
            console.log('Found iframe, recursing into:', iframeSrc);
            return await extractVideoUrl(iframeSrc); // recursive call
        }

        console.log('No video URL found in embed');
        return null;
    } catch (error) {
        console.error('Extraction error:', error.message);
        return null;
    }
}

builder.defineStreamHandler(async (args) => {
    const { id, type } = args;
    console.log(`Request for ${type}: ${id}`);

    let embedUrl;
    if (type === 'movie') {
        embedUrl = `https://vidsrc.to/embed/movie/${id}`;
    } else if (type === 'series') {
        const parts = id.split(':');
        if (parts.length !== 3) {
            console.log('Invalid series ID format');
            return { streams: [] };
        }
        const [imdbId, season, episode] = parts;
        embedUrl = `https://vidsrc.to/embed/tv/${imdbId}/${season}/${episode}`;
    } else {
        return { streams: [] };
    }

    console.log(`Embed URL: ${embedUrl}`);

    // Try to extract direct video URL
    const videoUrl = await extractVideoUrl(embedUrl);

    const streams = [];

    // If direct URL found, add it as a playable stream
    if (videoUrl) {
        streams.push({
            name: 'VidSrc.to Direct',
            title: 'Direct Play',
            url: videoUrl,
            behaviorHints: {
                notWebReady: false  // allow Stremio to play directly
            }
        });
    }

    // Always add a fallback stream that opens the embed in browser (so user gets something)
    streams.push({
        name: 'VidSrc.to (Web)',
        title: 'Open in Browser (fallback)',
        externalUrl: embedUrl
    });

    console.log(`Returning ${streams.length} streams`);
    return { streams };
});

module.exports = builder.getInterface();
