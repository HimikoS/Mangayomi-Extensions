const mangayomiSources = [{
    name: "Hentaila",
    lang: "es",
    baseUrl: "https://hentaila.com",
    apiUrl: "",
    iconUrl: "https://raw.githubusercontent.com/HimikoS/Mangayomi-Extensions/refs/heads/master/icon/src/es/hentaila.png",
    typeSource: "single",
    itemType: 1,
    isNsfw: true,
    version: "1.1.0",
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
        const url = `${this.getBaseUrl()}/catalogo?order=popular&page=${page}`;
        const doc = await this.fetchPage(url);
        return doc ? this.parseAnimeList(doc) : { list: [], hasNextPage: false };
    }

    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}/catalogo?order=latest_added&page=${page}`;
        const doc = await this.fetchPage(url);
        return doc ? this.parseAnimeList(doc) : { list: [], hasNextPage: false };
    }

    async search(query, page, filters) {
        let url = `${this.getBaseUrl()}/catalogo?page=${page}`;

        // Prioridad 1: Barra de búsqueda principal de Mangayomi
        if (query && query.trim() !== "") {
            url += `&search=${encodeURIComponent(query.trim())}`;
        }

        if (filters) {
            for (const filter of filters) {
                // Saltamos filtros vacíos o por defecto
                if (filter.state === null || filter.state === undefined || filter.state === "" || filter.state === 0) continue;

                switch (filter.name) {
                    case "Buscar Hentai":
                        // Prioridad 2: Filtro de texto manual (si la barra principal está vacía)
                        if (!url.includes("&search=")) {
                            url += `&search=${encodeURIComponent(filter.state)}`;
                        }
                        break;
                    case "Desde":
                        url += `&minYear=${filter.values[filter.state].value}`;
                        break;
                    case "Hasta":
                        url += `&maxYear=${filter.values[filter.state].value}`;
                        break;
                    case "Genero":
                        url += `&genre=${filter.values[filter.state].value}`;
                        break;
                    case "solo por Letra Inicial":
                        url += `&letter=${filter.values[filter.state].value}`;
                        break;
                    case "Ordenar por":
                        url += `&order=${filter.values[filter.state].value}`;
                        break;
                    case "Estado":
                        url += `&status=${filter.values[filter.state].value}`;
                        break;
                    case "Sin Censura":
                        if (filter.state === true) {
                            url += `&uncensored=`;
                        }
                        break;
                }
            }
        }

        // Debug para consola de Mangayomi
        console.log("URL de búsqueda final: " + url);

        const doc = await this.fetchPage(url);
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
            // "Netu": /https?:\/\/(?:hqq\.ac|netu\.tv)\/e\/[^\s"\'<>]+/g,
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
                    console.log("Hvidserv URL: " + videoUrl);

                    let idMatch = videoUrl.match(/\/play\/([a-f0-9]{32})/i);

                    if (!idMatch) {
                        idMatch = videoUrl.match(/hvidserv\.com\/([a-f0-9]{32})/i);
                    }

                    if (idMatch) {
                        const id = idMatch[1];
                        const m3u8 = `https://cdn.hvidserv.com/m3u8/${id}`;

                        console.log("Hvidserv ID: " + id);
                        console.log("Hvidserv m3u8: " + m3u8);

                        videos.push({
                            url: m3u8,
                            quality: "Vip Hentaila (HLS)",
                            originalUrl: videoUrl,
                            headers: {
                                Referer: m3u8,
                                Origin: "https://hvidserv.com",
                                "User-Agent": "Mozilla/5.0",
                                "sec-fetch-dest": "video",
                                "sec-fetch-site": "same-origin"
                            }
                        });

                        continue;
                    }

                    console.log("Hvidserv: No se pudo extraer ID");

                } catch (e) {
                    console.log("Error Hvidserv: " + e.toString());
                }
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

            // // --- CASO Netu (HQQ) - REPLICACIÓN SEGÚN CAPTURA DE RED (FIX 0.00) ---
            // if (videoUrl.includes("hqq.ac") || videoUrl.includes("hqq.tv")) {
            //     try {
            //         console.log("HQQ: Iniciando proceso de activación...");
            //         const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            //         // 1. Headers "Espejo" del navegador
            //         const browserHeaders = {
            //             "Accept": "application/json, text/javascript, */*; q=0.01",
            //             "Accept-Language": "es-419,es;q=0.7",
            //             "Cache-Control": "no-cache",
            //             "Pragma": "no-cache",
            //             "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
            //             "X-Requested-With": "XMLHttpRequest",
            //             "Origin": "https://hqq.ac",
            //             "Referer": videoUrl, // La URL /e/L0xre...
            //             "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Brave";v="144"',
            //             "sec-ch-ua-mobile": "?0",
            //             "sec-ch-ua-platform": '"Windows"',
            //             "sec-gpc": "1",
            //             "Sec-Fetch-Dest": "empty",
            //             "Sec-Fetch-Mode": "cors",
            //             "Sec-Fetch-Site": "same-origin"
            //         };

            //         // PASO 1: Cargar la página inicial
            //         const resPage = await this.client.get(videoUrl, { 
            //             headers: { ...browserHeaders, "Accept": "text/html" } 
            //         });
            //         const html = resPage.body;

            //         // EXTRAER VARIABLES
            //         const videoid = (html.match(/videoid['"]?\s*[:=]\s*['"](\d+)['"]/i) || [])[1];
            //         const internalKey = (html.match(/videokey['"]?\s*[:=]\s*['"]([^"']+)["']/) || [])[1];
            //         const userId = (html.match(/userid\s*=\s*["'](\d+)["']/i) || ["", "108451"])[1];

            //         // EXTRAER SH (El ID del div en el embed_code)
            //         let secretSh = "";
            //         const embedMatch = html.match(/embed_code\s*=\s*["']([^"']+)["']/);
            //         if (embedMatch) {
            //             const decodedEmbed = decodeURIComponent(embedMatch[1].replace(/\+/g, " "));
            //             const idMatch = decodedEmbed.match(/id=["']([^"']+)["']/i);
            //             secretSh = idMatch ? idMatch[1] : "";
            //         }

            //         if (!videoid || !internalKey) return;

            //         console.log(`HQQ Validado -> ID: ${videoid}, RealKey: ${internalKey}, SH: ${secretSh}`);

            //         // --- PASO CLAVE: CALENTAMIENTO DE IP ---
            //         // Esto vincula nuestra IP con las cookies generadas en el paso 1
            //         await this.client.get("https://hqq.ac/player/ip.php", { headers: browserHeaders }).catch(() => {});

            //         // --- PASO 2: ACTIVACIÓN (get_player_image.php) ---
            //         // Forzamos JSON y nos aseguramos de que no se envíe como text/plain
            //         const resImg = await this.client.post("https://hqq.ac/player/get_player_image.php", {
            //             headers: browserHeaders,
            //             json: { // Usar la propiedad 'json' del cliente suele forzar el content-type correcto
            //                 videoid: videoid,
            //                 videokey: internalKey,
            //                 width: 1920,
            //                 height: 1080
            //             },
            //             responseType: 'json'
            //         });

            //         let dataImg = resImg.body;
            //         // Si el cliente no parseó el JSON automáticamente:
            //         if (typeof dataImg === 'string') {
            //             if (dataImg.includes("0.00") || dataImg === "0.00") {
            //                 console.log("HQQ Error: El servidor devolvió 0.00 (El servidor detectó el bot)");
            //                 //return;
            //             }
            //             try { dataImg = JSON.parse(dataImg); } catch(e) {}
            //         }

            //         const clickHash = dataImg.hash_image;
            //         const waitSec = (dataImg.isec ? parseInt(dataImg.isec) : 5);

            //         if (!clickHash) {
            //             console.log("HQQ Error: No se obtuvo click_hash. Respuesta: " + JSON.stringify(dataImg));
            //             //return;
            //         }

            //         console.log(`HQQ: Hash obtenido. Esperando ${waitSec}s...`);
            //         await sleep((waitSec + 1) * 1000);

            //         // --- PASO 3: OBTENER EL MD5 (Link firmado) ---
            //         const apiRes = await this.client.post("https://hqq.ac/player/get_md5.php", {
            //             headers: { 
            //                 ...browserHeaders, 
            //                 "Content-Type": "application/json" 
            //             },
            //             json: {
            //                 htoken: "",
            //                 sh: secretSh,
            //                 ver: "4",
            //                 secure: "0",
            //                 adb: userId,
            //                 v: internalKey,
            //                 token: "",
            //                 gt: "",
            //                 embed_from: "0",
            //                 wasmcheck: 2,
            //                 adscore: "",
            //                 click_hash: clickHash,
            //                 clickx: Math.floor(Math.random() * 50) + 200,
            //                 clicky: Math.floor(Math.random() * 50) + 250
            //             }
            //         });

            //         let finalData = apiRes.body;
            //         if (typeof finalData !== 'string') finalData = JSON.stringify(finalData);

            //         // Decodificar Base64 (atob) y parsear URL
            //         if (finalData.includes('atob("')) {
            //             const b64 = finalData.match(/atob\("([^"]+)"\)/)[1];
            //             finalData = Buffer.from(b64, 'base64').toString();
            //         }

            //         if (finalData.startsWith("{")) {
            //             const json = JSON.parse(finalData);
            //             let signedUrl = json.file || json.url || json.obf_link;

            //             if (signedUrl) {
            //                 if (signedUrl.startsWith("//")) signedUrl = "https:" + signedUrl;
            //                 console.log("¡ÉXITO! URL Encontrada: " + signedUrl);
            //                 videos.push({
            //                     url: signedUrl,
            //                     quality: "Netu (Signed HLS)",
            //                     originalUrl: videoUrl,
            //                     headers: { "Referer": "https://hqq.ac/", "User-Agent": browserHeaders["User-Agent"] }
            //                 });
            //             }
            //         } else {
            //             console.log("HQQ Error: Respuesta final no es JSON -> " + finalData);
            //         }

            //     } catch (e) {
            //         console.log("Error detallado en HQQ: " + e.message);
            //     }
            // }

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

            // 1) Buscar URL absoluta
            let url = decoded.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
            if (url) return url[0];

            // 2) Buscar ruta relativa
            const rel = decoded.match(/"(\/[^"']+\.m3u8[^"']*)"/);
            if (rel) return "https://ryderjet.com" + rel[1];

            // 3) Fallback: buscar dentro del objeto var n = {...}
            const objMatch = decoded.match(/var\s+n\s*=\s*(\{[\s\S]*?\});/);
            if (objMatch) {
                try {
                    const data = JSON.parse(objMatch[1]);

                    // posibles nombres que usan los clones
                    return (
                        data.hls ||
                        data.source ||
                        data.file ||
                        data["1a"] ||
                        data["16"] ||
                        data["1f"] ||
                        null
                    );
                } catch (e) {
                    console.log("JSON parse error en fallback:", e.message);
                }
            }

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
            console.log("Longitud eval: " + match[0].length);
            console.log("Final: " + match[0].slice(-50));

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

    getSourcePreferences() {
        return [
            {
                key: "preferred_quality",
                listPreference: {
                    title: "Preferred quality",
                    summary: "",
                    valueIndex: 0,
                    entries: [
                        "Auto",
                        "1080p",
                        "720p",
                        "480p",
                        "360p"
                    ],
                    entryValues: [
                        "",
                        "1080",
                        "720",
                        "480",
                        "360"
                    ]
                }
            },
            {
                key: "preferred_server",
                listPreference: {
                    title: "Preferred server",
                    summary: "",
                    valueIndex: 0,
                    entries: [
                        "Auto",
                        "Vip HentaiLA",
                        "Voe",
                        "VidHide",
                        "YourUpload",
                        "MP4Upload",
                        "Mega"
                    ],
                    entryValues: [
                        "",
                        "Vip HentaiLA",
                        "Voe",
                        "VidHide",
                        "YourUpload",
                        "MP4Upload",
                        "Mega"
                    ]
                }
            }
        ];
    }

    getFilterList() {
        return [
            { type_name: "TextFilter", name: "Buscar Hentai", state: "" },
            {
                type_name: "SelectFilter",
                name: "Desde",
                state: 0,
                values: this.generateYearOptions()
            },
            {
                type_name: "SelectFilter",
                name: "Hasta",
                state: 0,
                values: this.generateYearOptions()
            },
            { type_name: "SeparatorFilter" },
            {
                type_name: "SelectFilter",
                name: "solo por Letra Inicial",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Seleccionar", value: "" },
                    { type_name: "SelectOption", name: "#", value: "0" },
                    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l => ({ type_name: "SelectOption", name: l, value: l })),
                ]
            },
            { type_name: "SeparatorFilter" },
            {
                type_name: "SelectFilter",
                name: "Genero",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Seleccionar", value: "" },
                    { type_name: "SelectOption", name: "3D", value: "3d" },
                    { type_name: "SelectOption", name: "Ahegao", value: "ahegao" },
                    { type_name: "SelectOption", name: "Anal", value: "anal" },
                    { type_name: "SelectOption", name: "Casadas", value: "casadas" },
                    { type_name: "SelectOption", name: "Chikan", value: "chikan" },
                    { type_name: "SelectOption", name: "Ecchi", value: "ecchi" },
                    { type_name: "SelectOption", name: "Enfermeras", value: "enfermeras" },
                    { type_name: "SelectOption", name: "Escolares", value: "escolares" },
                    { type_name: "SelectOption", name: "Futanari", value: "futanari" },
                    { type_name: "SelectOption", name: "Gore", value: "gore" },
                    { type_name: "SelectOption", name: "Hardcore", value: "hardcore" },
                    { type_name: "SelectOption", name: "Harem", value: "harem" },
                    { type_name: "SelectOption", name: "Incesto", value: "incesto" },
                    { type_name: "SelectOption", name: "Juegos Sexuales", value: "juegos-sexuales" },
                    { type_name: "SelectOption", name: "Suspenso", value: "suspenso" },
                    { type_name: "SelectOption", name: "Milfs", value: "milfs" },
                    { type_name: "SelectOption", name: "Maids", value: "maids" },
                    { type_name: "SelectOption", name: "Netorare", value: "netorare" },
                    { type_name: "SelectOption", name: "Ninfomania", value: "ninfomania" },
                    { type_name: "SelectOption", name: "Ninjas", value: "ninjas" },
                    { type_name: "SelectOption", name: "Orgias", value: "orgias" },
                    { type_name: "SelectOption", name: "Romance", value: "romance" },
                    { type_name: "SelectOption", name: "Shota", value: "shota" },
                    { type_name: "SelectOption", name: "Softcore", value: "softcore" },
                    { type_name: "SelectOption", name: "Succubus", value: "succubus" },
                    { type_name: "SelectOption", name: "Teacher", value: "teacher" },
                    { type_name: "SelectOption", name: "Tentaculos", value: "tentaculos" },
                    { type_name: "SelectOption", name: "Tetonas", value: "tetonas" },
                    { type_name: "SelectOption", name: "Vanilla", value: "vanilla" },
                    { type_name: "SelectOption", name: "Violacion", value: "violacion" },
                    { type_name: "SelectOption", name: "Virgenes", value: "virgenes" },
                    { type_name: "SelectOption", name: "Yaoi", value: "yaoi" },
                    { type_name: "SelectOption", name: "Yuri", value: "yuri" },
                    { type_name: "SelectOption", name: "Bondage", value: "bondage" },
                    { type_name: "SelectOption", name: "Elfas", value: "elfas" },
                    { type_name: "SelectOption", name: "Petit", value: "petit" },
                    { type_name: "SelectOption", name: "Threesome", value: "threesome" },
                    { type_name: "SelectOption", name: "Paizuri", value: "paizuri" },
                    { type_name: "SelectOption", name: "Gal", value: "gal" },
                    { type_name: "SelectOption", name: "Oyakodon", value: "oyakodon" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Ordenar por",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Predeterminado", value: "" },
                    { type_name: "SelectOption", name: "Puntuación", value: "score" },
                    { type_name: "SelectOption", name: "Populares", value: "popular" },
                    { type_name: "SelectOption", name: "Titulo", value: "title" },
                    { type_name: "SelectOption", name: "Últimos Agregados", value: "latest_added" },
                    { type_name: "SelectOption", name: "Últiumos Estrenos", value: "latest_released" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Estado",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Seleccionar", value: "" },
                    { type_name: "SelectOption", name: "Finalizado", value: "finalizado" },
                    { type_name: "SelectOption", name: "Próximamente", value: "proximamente" },
                    { type_name: "SelectOption", name: "En emisión", value: "emision" }
                ]
            },
            {
                type_name: "CheckBox",
                type: "SinCensura",
                name: "Sin Censura",
                value: "",
            }
        ];
    }

    generateYearOptions() {
        const years = [{ type_name: "SelectOption", name: "Seleccionar", value: "" }];
        for (let i = 1990; i <= 2026; i++) {
            years.push({ type_name: "SelectOption", name: i.toString(), value: i.toString() });
        }
        return years;
    }
}