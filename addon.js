const { addonBuilder } = require("stremio-addon-sdk");

const manifest = {
    id: "community.vidsrc.internal",
    version: "1.0.0",
    name: "VidSrc Direct",
    description: "Watch VidSrc.to directly in Stremio",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"]
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async (args) => {
    const [imdbId, season, episode] = args.id.split(":");
    const streamUrl = `https://vidsrc.to/embed/${args.type === 'movie' ? 'movie' : 'tv'}/${imdbId}${args.type === 'series' ? `/${season}/${episode}` : ''}`;

    return {
        streams: [{
            title: "VidSrc HQ Player",
            url: streamUrl // Stremio's internal player will attempt to resolve this
        }]
    };
});

module.exports = builder.getInterface();
