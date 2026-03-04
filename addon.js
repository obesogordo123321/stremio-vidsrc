const { addonBuilder } = require("stremio-addon-sdk");

const manifest = {
    id: "community.vidsrc.internal",
    version: "1.2.0",
    name: "VidSrc Direct HQ",
    description: "Internal playback for VidSrc",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async (args) => {
    const [imdbId, season, episode] = args.id.split(":");
    
    // We use vidsrc.pm or vidsrc.xyz mirrors as they are more 'embed-friendly' 
    // for mobile app players.
    const baseUrl = "https://vidsrc.xyz/embed"; 
    const directUrl = args.type === 'movie' 
        ? `${baseUrl}/movie?imdb=${imdbId}`
        : `${baseUrl}/tv?imdb=${imdbId}&season=${season}&episode=${episode}`;

    return {
        streams: [
            {
                title: "🚀 VidSrc - Internal Player",
                // We use 'url' for internal, but we add a 'proxy' hint
                url: directUrl, 
                behaviorHints: {
                    notWebReady: false, 
                    proxyHeaders: {
                        "Referer": "https://vidsrc.xyz/",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
                    }
                }
            },
            {
                title: "🌐 VidSrc - Open in Browser (Backup)",
                // If internal fails, this button will always work
                externalUrl: directUrl 
            }
        ]
    };
});

module.exports = builder.getInterface();
