const mangayomiSources = [{
    name: "Hentaila",
    lang: "es",
    baseUrl: "https://hentaila.com",
    apiUrl: "",
    iconUrl: "https://hentaila.com/img/logo-dark.svg",
    typeSource: "single",
    itemType: 1,
    isNsfw: true,
    version: "1.0.1",
    pkgPath: "Anime/src/es/hentaila.js"
}];

class DefaultExtension extends MProvider {

    constructor() {
        super();
        this.client = new Client();
    }

    // ======================
    // Helpers
    // ======================

    getBaseUrl() {
        return this.source.baseUrl.replace(/\/+$/, "");
    }

    absoluteUrl(url) {
        if (!url) return "";
        if (url.startsWith("http")) return url;
        if (!url.startsWith("/")) url = "/" + url;
        return this.getBaseUrl() + url;
    }

    async fetchPage(url) {
        try {
            const res = await this.client.get(url);
            return new Document(res.body);
        } catch (e) {
            return null;
        }
    }

    getBrowseUrl(page, query = "") {
        const base = this.getBaseUrl();
        if (query) return `${base}/catalogo?q=${encodeURIComponent(query)}&page=${page}`;
        return `${base}/catalogo?page=${page}`;
    }

    // ======================
    // Popular / Latest / Search
    // ======================

    async getPopular(page) {
        const doc = await this.fetchPage(this.getBrowseUrl(page));
        return doc ? this.parseAnimeList(doc) : { list: [], hasNextPage: false };
    }

    async getLatestUpdates(page) {
        const doc = await this.fetchPage(this.getBrowseUrl(page));
        return doc ? this.parseAnimeList(doc) : { list: [], hasNextPage: false };
    }

    async search(query, page) {
        const doc = await this.fetchPage(this.getBrowseUrl(page, query));
        return doc ? this.parseAnimeList(doc) : { list: [], hasNextPage: false };
    }

    // ======================
    // List Parser
    // ======================

    parseAnimeList(document) {
        const elements = document.select("article");
        const list = [];
        for (const el of elements) {
            try {
                const a = el.selectFirst("a");
                if (!a) continue;
                const name = el.selectFirst("h3")?.text || a.attr("title") || a.text.trim();
                const img = el.selectFirst("img");
                const imageUrl = img?.attr("src") || img?.attr("data-src") || img?.attr("data-cfsrc") || "";
                const link = this.absoluteUrl(a.attr("href"));
                if (name && link) {
                    list.push({ name: name.trim(), imageUrl, link });
                }
            } catch (_) {}
        }
        return { list, hasNextPage: elements.length >= 20 };
    }

    // ======================
    // Detail
    // ======================

    async getDetail(url) {
        const doc = await this.fetchPage(this.absoluteUrl(url));
        if (!doc) return { description: "", genre: [], status: 5, episodes: [] };

        const description = doc.selectFirst("div.entry")?.text?.trim() || "";
        const genre = doc.select("a[href*='genre']").map(e => e.text.trim());
        
        let status = 5;
        const metaText = doc.select("header span").map(e => e.text).join(" ");
        if (metaText.includes("Finalizado")) status = 1;
        else if (metaText.includes("Emisión")) status = 0;

        const episodes = this.parseEpisodes(doc);
        return { description, genre, status, episodes };
    }

    parseEpisodes(document) {
        const episodes = [];
        const base = this.getBaseUrl();
        const items = document.select("section article");
        for (const item of items) {
            const link = item.selectFirst("a[href*='/media/']")?.attr("href");
            if (!link) continue;
            const numberText = item.selectFirst("div:contains('Episodio')")?.text || "";
            const epNumber = parseFloat(numberText.replace(/[^\d.]/g, "")) || 0;
            episodes.push({
                name: `Episodio ${epNumber}`,
                url: link.startsWith("http") ? link : base + link,
                episodeNumber: epNumber
            });
        }
        return episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
    }

    // ======================
    // MÉTODOS DE APOYO (Sustituyen funciones faltantes)
    // ======================

    base64Decode(input) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        let str = input.replace(/[=]+$/, '');
        let output = '';
        for (let bc = 0, bs, buffer, idx = 0; (buffer = str.charAt(idx++)); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
            buffer = chars.indexOf(buffer);
        }
        return output;
    }

    decryptVoeF7(encodedString) {
        try {
            // 1. ROT13
            let v = encodedString.replace(/[a-zA-Z]/g, function(c) {
                return String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
            });
            
            // 2. replacePatterns + 3. removeUnderscores
            const patterns = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];
            patterns.forEach(p => { v = v.split(p).join("_"); });
            v = v.split("_").join("");

            // 4. base64Decode (Manual)
            v = this.base64Decode(v);

            // 5. charShift (-3)
            let shifted = "";
            for (let i = 0; i < v.length; i++) {
                shifted += String.fromCharCode(v.charCodeAt(i) - 3);
            }

            // 6. reverse
            let reversed = shifted.split("").reverse().join("");

            // 7. base64Decode final (Manual)
            let finalJson = this.base64Decode(reversed);
            
            return JSON.parse(finalJson);
        } catch (e) {
            console.log("Voe Decryption error: " + e.message);
            return null;
        }
    }

    // ======================
    // Videos
    // ======================
    async getVideoList(url) {
        const res = await this.client.get(this.absoluteUrl(url));
        const html = res.body;
        const videos = [];

        const cleanContent = html.replace(/\\\//g, "/");
        const serverPatterns = {
            "Hentaila": /https?:\/\/cdn\.hvidserv\.com\/play\/[\w-]+/g,
            "YourUpload": /https?:\/\/(?:www\.)?yourupload\.com\/embed\/[\w-]+/g,
            "Voe": /https?:\/\/voe\.sx\/e\/[\w-]+/g,
            "JKVoe": /https?:\/\/jkanime\.net\/jkplayer\/c1\?u=[a-zA-Z0-9+/=]+&s=voe/g,
            "MP4Upload": /https?:\/\/(?:www\.)?mp4upload\.com\/embed-[\w-.]+/g,
            "Mega": /https?:\/\/mega\.nz\/embed[!#][\w-]+/g,
            "Netu": /https?:\/\/(?:hqq\.ac|netu\.tv)\/e\/[^\s"\'<>]+/g,
            "VidHide": /https?:\/\/(?:cdn\.)?ryderjet\.com\/[^\s"\'<>]+/g
        };

        const foundUrls = new Set();
        for (const [name, regex] of Object.entries(serverPatterns)) {
            const matches = cleanContent.match(regex);
            if (matches) {
                matches.forEach(link => foundUrls.add(link.split("'")[0].split('"')[0]));
            }
        }

        for (const videoUrl of Array.from(foundUrls)) {
            
            // --- PASO PREVIO: Decodificar el wrapper de JK si existe ---
            if (videoUrl.includes("u=") && videoUrl.includes("s=voe")) {
                try {
                    const base64Part = videoUrl.split("u=")[1].split("&")[0];
                    videoUrl = this.base64Decode(base64Part); 
                } catch (e) {}
            }

            // --- CASO VOE (Lógica F7) ---
            if (videoUrl.includes("voe.sx")) {
                try {
                    let vRes = await this.client.get(videoUrl);
                    let vHtml = vRes.body;

                    const redirMatch = vHtml.match(/window\.location\.href\s*=\s*'([^']+)';/);
                    if (redirMatch) {
                        vRes = await this.client.get(redirMatch[1]);
                        vHtml = vRes.body;
                    }

                    const encodedMatch = vHtml.match(/<script type="application\/json">[\s\S]*?\[\s*"([^"]+)"\s*\][\s\S]*?<\/script>/);
                    
                    if (encodedMatch) {
                        const decrypted = this.decryptVoeF7(encodedMatch[1]);
                        if (decrypted) {
                            const m3u8 = decrypted["source"];
                            const mp4 = decrypted["direct_access_url"];
                            if (m3u8) videos.push({ url: m3u8, quality: "Voe (HLS)", originalUrl: videoUrl });
                            if (mp4) videos.push({ url: mp4, quality: "Voe (MP4)", originalUrl: videoUrl });
                            if (m3u8 || mp4) continue;
                        }
                    }
                } catch (e) {}
            }

            // --- CASO HENTAILA (Hvidserv) ---
            if (videoUrl.includes("hvidserv.com")) {
                try {
                    let vRes = await this.client.get(videoUrl);
                    let vHtml = vRes.body;

                    const redirMatch = vHtml.match(/window\.location\.href\s*=\s*'([^']+)';/);
                    if (redirMatch) {
                        vRes = await this.client.get(redirMatch[1]);
                        vHtml = vRes.body;
                    }

                    const encodedMatch = vHtml.match(/<script type="application\/json">[\s\S]*?\[\s*"([^"]+)"\s*\][\s\S]*?<\/script>/);
                    
                    if (encodedMatch) {
                        const decrypted = this.decryptVoeF7(encodedMatch[1]);
                        if (decrypted) {
                            const m3u8 = decrypted["source"];
                            const mp4 = decrypted["direct_access_url"];
                            if (m3u8) videos.push({ url: m3u8, quality: "Vip HentaiLA (HLS)", originalUrl: videoUrl });
                            if (mp4) videos.push({ url: mp4, quality: "Vip HentaiLA (MP4)", originalUrl: videoUrl });
                            if (m3u8 || mp4) continue;
                        }
                    }
                } catch (e) {}
            }

            // --- CASO VidHide (ryderjet) ---
            if (videoUrl.includes("ryderjet.com")) {
                try {
                    const vRes = await this.client.get(videoUrl);
                    const vHtml = vRes.body;

                    // Extraer link real usando el unpacker
                    const realUrl = this.extraerVideoDesdeHtml(vHtml, videoUrl);

                    if (realUrl) {
                        videos.push({
                            url: realUrl,
                            quality: "VidHide (HLS)",
                            originalUrl: videoUrl,
                            headers: {
                                "Referer": "https://ryderjet.com/",
                                "User-Agent": "Mozilla/5.0"
                            }
                        });
                        continue;
                    }
                } catch (e) {
                    console.log("VidHide error: " + e.message);
                }
            }

            // --- FALLBACK (Extractores de la App) ---
            try {
                const extracted = await this.extractFromUrl(videoUrl);
                if (extracted && extracted.length > 0) {
                    videos.push(...extracted);
                } else {
                    let label = "Servidor";
                    if (videoUrl.includes("mega")) label = "Mega";
                    else if (videoUrl.includes("yourupload")) label = "YourUpload";
                    else if (videoUrl.includes("mp4upload")) label = "MP4Upload";
                    else if (videoUrl.includes("hqq.ac")) label = "Netu";
                    
                    videos.push({ url: videoUrl, quality: label + " (Embed)", originalUrl: videoUrl });
                }
            } catch (e) {}
        }

        return this.sortVideos(videos);
    }

    async extractFromUrl(url) {
        try {
            if (url.includes("streamwish")) return await streamWishExtractor(url, "StreamWish:");
            if (url.includes("streamtape")) return await streamTapeExtractor(url);
            if (url.includes("ok.ru")) return await okruExtractor(url);
            if (url.includes("yourupload")) return await yourUploadExtractor(url);
            if (url.includes("voe")) return await voeExtractor(url);
            if (url.includes("mp4upload")) return await mp4UploadExtractor(url);
            return [];
        } catch (e) {
            return [];
        }
    }

    /**
     * NIVEL 3: El Traductor (Unpacker)
     * Procesa la lógica de sustitución de palabras.
     */
    unpack(p, a, c, k) {
        while (c--) {
            if (k[c]) {
                // Reemplaza los índices por las palabras reales del diccionario
                p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
            }
        }
        return p;
    }

    /**
     * NIVEL 2: El Resolutor (Extrae p, a, c, k y busca la URL)
     * Recibe el contenido que está dentro del eval() y lo descifra.
     */
    resolverPacker(scriptContent) {
        try {
            const paramsRegex =
            /eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\(\s*(['"])([\s\S]+?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]+?)\5\.split\(['"]\|['"]\)\)\)/;

            const match = scriptContent.match(paramsRegex);

            console.log(`match: ${match ? "✅ Encontrado" : "❌ No encontrado"}`);
            if (!match) return null;

            const p = match[2];
            const a = parseInt(match[3]);
            const c = parseInt(match[4]);
            const k = match[6].split('|');

            console.log(`p=${p.length}, a=${a}, c=${c}, k=${k.length}`);

            const decoded = this.unpack(p, a, c, k);
            if (!decoded) return null;

            const url = decoded.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
            if (url) return url[0];

            const rel = decoded.match(/"(\/[^"']+\.m3u8[^"']*)"/);
            if (rel) return "https://ryderjet.com" + rel[1];

            return null;

        } catch (e) {
            console.log("Error resolverPacker:", e.message);
            return null;
        }
    }


    /**
     * NIVEL 1: El Extractor (Busca el script en el HTML)
     * Esta es la función que invocas con el 'response.body' de Mangayomi.
     */
    extraerVideoDesdeHtml(html, originalUrl) {

        const evalRegex =
        /eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\(['"]\|['"]\)\)\)/i;

        const match = html.match(evalRegex);

        if (match) {
            console.log("Eval encontrado para " + originalUrl);
            console.log("Longitud eval:", match[0].length);
            console.log("Final:", match[0].slice(-50));

            return this.resolverPacker(match[0]);
        }

        console.log("No se encontró eval completo para " + originalUrl);

        // Debug
        console.log("Contiene inicio:", html.includes("eval(function(p,a,c,k,e,d)"));
        console.log("Contiene split:", html.includes(".split('|')"));

        return null;
    }

    sortVideos(videos) {
        const prefs = new SharedPreferences();
        const preferredServer = prefs.get("preferred_server") || "";
        const preferredQuality = prefs.get("preferred_quality") || "";
        return videos.sort((a, b) => {
            const score = v => (v.quality.includes(preferredServer) ? 1 : 0) + (v.quality.includes(preferredQuality) ? 1 : 0);
            return score(b) - score(a);
        });
    }
}