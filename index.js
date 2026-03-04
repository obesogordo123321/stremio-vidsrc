const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const manifest = {
    id: 'community.vidsrc-to-direct',
    version: '1.0.5-debug',
    name: 'VidSrc.to Direct (Debug)',
    description: 'Debug version to see page HTML',
    resources: ['stream'],
    types: ['movie', 'series'],
    catalogs: [],
    idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

const domains = ['vidsrc.to', 'vidsrc.net', 'vidsrc.me', 'vidsrc.me.ru', 'vidsrc.pro', 'vidsrc.cc', 'vidsrc.xyz'];

async function tryDomains(imdbId, type, season, episode) {
    for (const domain of domains) {
        let embedUrl;
        if (type === 'movie') {
            embedUrl = `https://${domain}/embed/movie/${imdbId}`;
        } else {
            embedUrl = `https://${domain}/embed/tv/${imdbId}/${season}/${episode}`;
        }
        console.log(`Trying ${embedUrl}`);
        const result = await extractVideoUrl(embedUrl);
        if (result && result.url) return result.url;
        // If result has htmlSnippet, log it
        if (result && result.htmlSnippet) {
            console.log('--- HTML snippet (first 2000 chars) ---');
            console.log(result.htmlSnippet);
            console.log('--- end snippet ---');
        }
    }
    return null;
}

async function extractVideoUrl(embedUrl) {
    try {
        const response = await axios.get(embedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://vidsrc.to/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 15000,
            maxRedirects: 5
        });
        const html = response.data;
        const $ = cheerio.load(html);

        // Method 1: video tag
        let videoSrc = $('video source').attr('src') || $('video').attr('src');
        if (videoSrc) {
            console.log('Found video src:', videoSrc);
            return { url: videoSrc };
        }

        // Method 2: search all script tags
        const scripts = $('script').map((i, el) => $(el).html()).get();
        for (let script of scripts) {
            if (!script) continue;

            // Look for common patterns
            const patterns = [
                /["'](?:file|src|url|link|source)["']\s*:\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i,
                /(?:file|src|url|link|source)\s*=\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i,
                /(https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)/
            ];
            for (let pattern of patterns) {
                const match = script.match(pattern);
                if (match) {
                    console.log('Found in script:', match[1] || match[0]);
                    return { url: match[1] || match[0] };
                }
            }

            // Look for sources array
            const jsonMatch = script.match(/sources\s*:\s*(\[[^\]]+\])/i);
            if (jsonMatch) {
                try {
                    const sources = JSON.parse(jsonMatch[1].replace(/'/g, '"'));
                    if (Array.isArray(sources) && sources.length > 0) {
                        const url = sources[0].file || sources[0].src || sources[0];
                        if (typeof url === 'string' && (url.includes('.mp4') || url.includes('.m3u8'))) {
                            console.log('Found from sources array:', url);
                            return { url };
                        }
                    }
                } catch (e) {}
            }
        }

        // Method 3: raw HTML search
        const urlMatch = html.match(/https?:\/\/[^"'\s<>]+\.(?:mp4|m3u8)[^"'\s<>]*/);
        if (urlMatch) {
            console.log('Found raw URL in HTML:', urlMatch[0]);
            return { url: urlMatch[0] };
        }

        // Method 4: iframe recursion
        const iframeSrc = $('iframe').attr('src');
        if (iframeSrc && iframeSrc.startsWith('http') && iframeSrc !== embedUrl) {
            console.log('Found iframe, recursing into:', iframeSrc);
            return await extractVideoUrl(iframeSrc);
        }

        console.log('No video URL found in embed');
        // Return a snippet of the HTML for debugging (first 2000 chars)
        const snippet = html.substring(0, 2000);
        return { htmlSnippet: snippet };
    } catch (error) {
        console.error('Extraction error:', error.message);
        return { htmlSnippet: `Error: ${error.message}` };
    }
}

builder.defineStreamHandler(async (args) => {
    const { id, type } = args;
    console.log(`Request for ${type}: ${id}`);

    let imdbId, season, episode;
    if (type === 'movie') {
        imdbId = id;
    } else {
        const parts = id.split(':');
        if (parts.length !== 3) {
            console.log('Invalid series ID');
            return { streams: [{ name: 'Error', title: 'Invalid series ID', externalUrl: 'https://vidsrc.to' }] };
        }
        [imdbId, season, episode] = parts;
    }

    const videoUrl = await tryDomains(imdbId, type, season, episode);

    const streams = [];
    if (videoUrl) {
        streams.push({
            name: 'VidSrc.to Direct',
            title: 'Direct Play',
            url: videoUrl,
            behaviorHints: { notWebReady: false }
        });
    }

    // Always add browser fallback
    streams.push({
        name: 'VidSrc.to (Web)',
        title: videoUrl ? 'Fallback Browser' : 'Open in Browser',
        externalUrl: `https://vidsrc.to/embed/${type === 'movie' ? 'movie' : 'tv'}/${imdbId}${type === 'series' ? '/' + season + '/' + episode : ''}`
    });

    console.log(`Returning ${streams.length} streams`);
    return { streams };
});

module.exports = builder.getInterface();
