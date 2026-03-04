const axios = require('axios');
const cheerio = require('cheerio');

async function getDirectStream(type, id, s, e) {
    try {
        const baseUrl = "https://vidsrc.to";
        const url = type === 'movie' 
            ? `${baseUrl}/embed/movie/${id}` 
            : `${baseUrl}/embed/tv/${id}/${s}/${e}`;

        const { data: html } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const $ = cheerio.load(html);
        const dataId = $('a[data-id]').attr('data-id');
        if (!dataId) return null;

        // Note: VidSrc uses heavy encryption. This is a fallback to the embed 
        // if direct HLS fails, but Stremio handles many embeds natively.
        return `${baseUrl}/ajax/embed/episode/${dataId}/sources`;
    } catch (err) {
        return null;
    }
}

module.exports = { getDirectStream };
