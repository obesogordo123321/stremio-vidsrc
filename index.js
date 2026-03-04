const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');

const manifest = {
    id: 'community.vidsrc-pro-api',
    version: '1.0.0',
    name: 'VidSrc Pro API',
    description: 'Direct video from vidsrc.pro API',
    resources: ['stream'],
    types: ['movie', 'series'],
    catalogs: [],
    idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

// API base – works on vidsrc.pro and vidsrc.cc
const API_BASE = 'https://vidsrc.pro/api';

async function getVideoUrl(imdbId, type, season, episode) {
    let url;
    if (type === 'movie') {
        url = `${API_BASE}/movie/${imdbId}`;
    } else {
        url = `${API_BASE}/tv/${imdbId}/${season}/${episode}`;
    }
    console.log(`Fetching API: ${url}`);

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://vidsrc.pro/'
            },
            timeout: 10000
        });

        // The API returns JSON like: { "url": "https://...", "sources": [...] }
        const data = response.data;
        if (data.url) {
            console.log('Got video URL:', data.url);
            return data.url;
        }
        if (data.sources && data.sources.length > 0) {
            // Sometimes it's an array of sources
            const source = data.sources[0].file || data.sources[0].url;
            if (source) {
                console.log('Got source URL:', source);
                return source;
            }
        }
        console.log('No URL in API response');
    } catch (err) {
        console.error('API error:', err.message);
    }
    return null;
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
            return { streams: [] };
        }
        [imdbId, season, episode] = parts;
    }

    const videoUrl = await getVideoUrl(imdbId, type, season, episode);

    const streams = [];
    if (videoUrl) {
        streams.push({
            name: 'VidSrc Pro',
            title: 'Direct Play',
            url: videoUrl,
            behaviorHints: { notWebReady: false }
        });
    }

    // Always include a browser fallback (vidsrc.to)
    streams.push({
        name: 'VidSrc.to (Web)',
        title: videoUrl ? 'Fallback Browser' : 'Open in Browser',
        externalUrl: `https://vidsrc.to/embed/${type === 'movie' ? 'movie' : 'tv'}/${imdbId}${type === 'series' ? '/' + season + '/' + episode : ''}`
    });

    return { streams };
});

module.exports = builder.getInterface();
