const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const manifest = {
    id: 'community.vidsrc-to-direct',
    version: '1.0.0',
    name: 'VidSrc.to Direct',
    description: 'Play videos from vidsrc.to directly in Stremio',
    resources: ['stream'],
    types: ['movie', 'series'],
    catalogs: [],
    idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

// Helper function to extract direct video URL from vidsrc.to embed page
async function extractVideoUrl(embedUrl) {
    try {
        const response = await axios.get(embedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const html = response.data;
        const $ = cheerio.load(html);

        // Try to find video source in a <source> tag
        let videoSrc = $('video source').attr('src');
        if (videoSrc) return videoSrc;

        // Look inside scripts for "file":"URL" or "src":"URL"
        const scripts = $('script').map((i, el) => $(el).html()).get();
        for (let script of scripts) {
            const match = script.match(/["'](?:file|src)["']\s*:\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/);
            if (match) return match[1];
        }

        // Fallback: search entire HTML for any .mp4 or .m3u8 URL
        const urlMatch = html.match(/https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*/);
        if (urlMatch) return urlMatch[0];

        return null;
    } catch (error) {
        console.error('Extraction error:', error.message);
        return null;
    }
}

builder.defineStreamHandler(async (args) => {
    const { id, type } = args;

    let embedUrl;
    if (type === 'movie') {
        embedUrl = `https://vidsrc.to/embed/movie/${id}`;
    } else if (type === 'series') {
        const [imdbId, season, episode] = id.split(':');
        if (!season || !episode) return { streams: [] };
        embedUrl = `https://vidsrc.to/embed/tv/${imdbId}/${season}/${episode}`;
    } else {
        return { streams: [] };
    }

    const videoUrl = await extractVideoUrl(embedUrl);
    if (!videoUrl) return { streams: [] };

    return {
        streams: [
            {
                name: 'VidSrc.to Direct',
                title: 'Play in Stremio',
                url: videoUrl,          // direct .mp4 or .m3u8 URL
                externalUrl: embedUrl,   // fallback if direct fails
            }
        ]
    };
});

module.exports = builder.getInterface();
