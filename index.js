const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');

const manifest = {
    id: 'community.2embed-direct',
    version: '1.0.0',
    name: '2Embed Direct',
    description: 'Play videos from 2embed.cc directly in Stremio',
    resources: ['stream'],
    types: ['movie', 'series'],
    catalogs: [],
    idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

// List of 2embed mirrors (all should work)
const mirrors = [
    'https://www.2embed.cc',
    'https://www.2embed.si',
    'https://www.2embed.to'
];

async function tryMirrors(imdbId, type, season, episode) {
    for (const base of mirrors) {
        let embedUrl;
        if (type === 'movie') {
            embedUrl = `${base}/embed/${imdbId}`;
        } else {
            embedUrl = `${base}/embed/${imdbId}/${season}/${episode}`;
        }
        console.log(`Trying ${embedUrl}`);
        try {
            // 2embed usually redirects to the direct video file
            const response = await axios.get(embedUrl, {
                maxRedirects: 0,  // we want to catch the redirect
                validateStatus: status => status >= 200 && status < 400,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 8000
            });

            // If redirect (3xx), Location header contains the video URL
            if (response.status >= 300 && response.status < 400 && response.headers.location) {
                const videoUrl = response.headers.location;
                console.log('Redirect video URL:', videoUrl);
                return videoUrl;
            }

            // Sometimes the video URL is in the HTML (fallback)
            const html = response.data;
            const match = html.match(/https?:\/\/[^"'\s<>]+\.(?:mp4|m3u8)[^"'\s<>]*/);
            if (match) {
                console.log('Found in HTML:', match[0]);
                return match[0];
            }
        } catch (err) {
            console.log(`${base} failed:`, err.message);
        }
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

    const videoUrl = await tryMirrors(imdbId, type, season, episode);

    const streams = [];
    if (videoUrl) {
        streams.push({
            name: '2Embed Direct',
            title: 'Direct Play',
            url: videoUrl,
            behaviorHints: { notWebReady: false }
        });
    }

    // Fallback to browser (vidsrc.to)
    streams.push({
        name: 'VidSrc.to (Web)',
        title: videoUrl ? 'Fallback Browser' : 'Open in Browser',
        externalUrl: `https://vidsrc.to/embed/${type === 'movie' ? 'movie' : 'tv'}/${imdbId}${type === 'series' ? '/' + season + '/' + episode : ''}`
    });

    return { streams };
});

module.exports = builder.getInterface();
