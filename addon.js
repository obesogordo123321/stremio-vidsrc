const { addonBuilder } = require("stremio-addon-sdk");

const manifest = {
    id: "community.vidsrc.internal",
    version: "1.0.0",
    name: "VidSrc Direct",
    description: "Watch VidSrc.to directly in Stremio",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: [] // This was missing and caused the crash
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async (args) => {
    const [imdbId, season, episode] = args.id.split(":");
    
    // Construct the VidSrc Embed URL
    const streamUrl = args.type === 'movie' 
        ? `https://vidsrc.to/embed/movie/${imdbId}`
        : `https://vidsrc.to/embed/tv/${imdbId}/${season}/${episode}`;

    return {
        streams: [{
            title: "VidSrc HQ Player",
            url: streamUrl 
        }]
    };
});

module.exports = builder.getInterface();
