const { serveHTTP } = require("stremio-addon-sdk");
const addonInterface = require("./addon");

// Railway provides the PORT environment variable automatically
serveHTTP(addonInterface, { port: process.env.PORT || 7000 });
