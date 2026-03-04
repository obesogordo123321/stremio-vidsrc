const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');

const manifest = {
    id: 'community.embed-su-direct',
    version: '1.0.0',
    name: 'Embed.su Direct',
    description: 'Play videos from embed.su directly in Stremio',
    resources: ['stream'],
    types: ['movie', 'series'],
    catalogs: [],
    idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

// Reliable sources that return direct video URLs
const sources = [
    { name: 'Embed.su', url: 'https://embed.su/embed' },
    { name: 'MultiEmbed', url: 'https://multiembed.mov/directstream' },
    { name: 'VidBinge', url: 'https://vidbinge.dev/embed' }  // backup
];

async function trySources(imdbId, type, season, episode) {
    for (const source of sources) {
        let embedUrl;
        if (type === 'movie') {
            embedUrl = `${source.url}/movie/${imdbId}`;
        } else {
            embedUrl = `${source.url}/tv/${imdbId}/${season}/${episode}`;
        }
        console.log(`Trying ${source.name}: ${embedUrl}`);

        try {
            // Some sources redirect, some return the video URL in JSON or HTML
            const response = await axios.get(embedUrl, {
                maxRedirects: 0,  // catch redirects
                validateStatus: status => status >= 200 && status < 400,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            });

            // Case 1: Redirect (3xx) – video URL is in Location header
            if (response.status >= 300 && response.status < 400 && response.headers.location) {
                const videoUrl = response.headers.location;
                console.log(`Redirect from ${source.name}:`, videoUrl);
                return videoUrl;
            }

            // Case 2: Look for video URL in HTML (e.g., iframe src or direct link)
            const html = response.data;
            const patterns = [
                /<iframe[^>]+src="([^"]+\.(?:m3u8|mp4)[^"]*)"/i,
                /<video[^>]+src="([^"]+\.(?:m3u8|mp4)[^"]*)"/i,
                /(https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*)/
            ];
            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match) {
                    console.log(`Found in HTML from ${source.name}:`, match[1] || match[0]);
                    return match[1] || match[0];
                }
            }

            // Case 3: Some sources return JSON with the video URL
            try {
                const json = JSON.parse(html);
                if (json.stream?.file) return json.stream.file;
                if (json.sources?.[0]?.file) return json.sources[0].file;
                if (json.url) return json.url;
            } catch (e) {}

        } catch (err) {
            console.log(`${source.name} failed:`, err.message);
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

    const videoUrl = await trySources(imdbId, type, season, episode);

    const streams = [];
    if (videoUrl) {
        streams.push({
            name: 'Direct Stream',
            title: 'Play in Stremio',
            url: videoUrl,
            behaviorHints: { notWebReady: false }
        });
    }

    // Always include vidsrc.to as browser fallback
    streams.push({
        name: 'VidSrc.to (Web)',
        title: videoUrl ? 'Fallback Browser' : 'Open in Browser',
        externalUrl: `https://vidsrc.to/embed/${type === 'movie' ? 'movie' : 'tv'}/${imdbId}${type === 'series' ? '/' + season + '/' + episode : ''}`
    });

    return { streams };
});

module.exports = builder.getInterface();
