const mangayomiSources = [{
    name: "XVideos",
    lang: "all",
    baseUrl: "https://www.xvideos.com",
    apiUrl: "",
    iconUrl: "https://raw.githubusercontent.com/HimikoS/Mangayomi-Extensions/refs/heads/master/icon/src/all/xvideos.png",
    typeSource: "multi",
    itemType: 0, 
    version: "0.1.3",
    pkgPath: "extensions/xvideos.js"
}];

class DefaultExtension extends MProvider {

    get base() {
        return this.source.baseUrl.endsWith('/') 
            ? this.source.baseUrl.slice(0, -1) 
            : this.source.baseUrl;
    }

    getHeaders(url) {

        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Referer": url || this.base + "/",
            "sec-fetch-dest": "video",
            "sec-fetch-site": "same-origin"
        };
    }

    // ======================
    // Listados (Popular, Latest, Search)
    // ======================
    async getPopular(page) {
        const url = page <= 1 ? `${this.base}/best/2026-01/` : `${this.base}/best/2026-01/${page-1}`;
        const list = await this.parseVideoList(url);
        return { list: list, hasNextPage: list.length > 0 };
    }

    get supportsLatest() { return true; }
    async getLatestUpdates(page) {
        const url = page <= 1 ? `${this.base}/new/` : `${this.base}/new/${page - 1}`;
        const list = await this.parseVideoList(url);
        return { list: list, hasNextPage: list.length > 0 };
    }

    async search(query, page, filters) {
        let url = `${this.base}/`;

        // Prioridad 1: Barra de búsqueda principal de Mangayomi
        if (query && query.trim() !== "") {
            url += page <= 1 ? `?k=${encodeURIComponent(query.trim())}` : `?k=${encodeURIComponent(query.trim())}&p=${page - 1}`;
        }

        if (filters) {
            for (const filter of filters) {
                // Saltamos filtros vacíos o por defecto
                if (filter.state === null || filter.state === undefined || filter.state === "" || filter.state === 0) continue;

                switch (filter.name) {
                    case "Buscar":
                        // Prioridad 2: Filtro de texto manual (si la barra principal está vacía)
                        if (!url.includes("?k=")) {
                            url += page <= 1 ? `?k=${encodeURIComponent(filter.state)}` : `?k=${encodeURIComponent(filter.state)}&p=${page - 1}`;
                        }
                        break;
                    case "Fecha de Publicacion":
                        url += page <= 1 ? `best/${filter.values[filter.state].value}/` : `best/${filter.values[filter.state].value}/${page-1}`;
                        break;
                }
            }
        }

        // Debug para consola de Mangayomi
        console.log("URL de búsqueda final: " + url);
        const list = await this.parseVideoList(url);
        return { list: list, hasNextPage: list.length > 0 };
    }

    async parseVideoList(url) {
        const client = new Client(); 
        const res = await client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const list = [];
        const elements = doc.select("div[id^='video_'], .thumb-block, .mozaique > div");

        for (const el of elements) {
            const titleEl = el.selectFirst(".title a, p.title a, .thumb-under .title a");
            const imgEl = el.selectFirst(".thumb img, img");
            if (titleEl && imgEl) {
                const href = titleEl.attr("href");
                if (href && (href.includes("/video") || href.includes("/video."))) {
                    let name = titleEl.text.trim();
                    if (!name || name.toLowerCase() === "vídeo") name = titleEl.attr("title") || "Video";
                    name = name.split('\n')[0].replace(/\s\d+\smin$/, "").trim();
                    const imageUrl = imgEl.attr("data-src") || imgEl.attr("src") || "";
                    list.push({
                        name: name,
                        link: href.startsWith("http") ? href : `${this.base}${href}`,
                        imageUrl: imageUrl
                    });
                }
            }
        }
        return list;
    }

    // ======================
    // Detail
    // ======================
    async getDetail(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        const body = res.body;
        const doc = new Document(body);

        let genres = [];
        let title = "";
        let description = "";
        let imageUrl = "";

        // Intentar sacar tags de window.xv.conf
        const configMatch = body.match(/window\.xv\.conf\s*=\s*({.+?});/s);
        if (configMatch) {
            try {
                const config = JSON.parse(configMatch[1]);
                genres = (config.dyn && config.dyn.video_tags) || (config.data && config.data.video_tags) || [];
                title = config.dyn ? config.dyn.video_title : "";
            } catch (e) {}
        }

        // Sacar info de JSON-LD
        const jsonLdEl = doc.selectFirst('script[type="application/ld+json"]');
        if (jsonLdEl) {
            try {
                const ld = JSON.parse(jsonLdEl.text);
                if (!title) title = ld.name;
                description = ld.description;
                imageUrl = ld.thumbnailUrl ? ld.thumbnailUrl[0] : "";
            } catch (e) {}
        }

        return {
            name: title || "Video",
            imageUrl: imageUrl,
            description: description,
            genre: genres,
            episodes: [{ name: "Reproducir Video", url: url }]
        };
    }

    // ======================
    // VIDEO LIST (CORREGIDA)
    // ======================
    async getVideoList(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const videos = [];

        // 1. Intentar extraer del JSON-LD
        const scriptEl = doc.selectFirst('script[type="application/ld+json"]');
        if (scriptEl) {
            try {
                const json = JSON.parse(scriptEl.text);
                if (json.contentUrl) {
                    videos.push({
                        url: json.contentUrl,
                        originalUrl: url, // ← IMPORTANTE
                        quality: "Directo (MP4)",
                        headers: this.getHeaders(url)
                    });
                }
            } catch (e) {
                console.log("Error al parsear JSON para getVideoList");
            }
        }

        // 2. Respaldo WebView
        if (videos.length === 0) {
            videos.push({
                url: url,
                originalUrl: url, // ← también aquí
                quality: "WebView",
                headers: this.getHeaders(url),
                type: "webview"
            });
        }

        return videos;
    }

    getFilterList() {
        return [
            { type_name: "TextFilter", name: "Buscar", state: "" },
            {
                type_name: "SelectFilter",
                name: "Fecha de Publicacion",
                state: 0,
                values: this.generateYearOptions()
            }
        ];
    }

    generateYearOptions() {
        const options = [
            { type_name: "SelectOption", name: "Seleccionar", value: "" }
        ];

        const months = [
            "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
        ];

        const startYear = 1999;
        const startMonth = 12; // Diciembre

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // getMonth() es 0-11

        for (let year = startYear; year <= currentYear; year++) {
            // Determinar desde qué mes empezar ese año
            let monthStart = 1;
            let monthEnd = 12;

            if (year === startYear) {
                monthStart = startMonth; // 1999 empieza en diciembre
            }

            if (year === currentYear) {
                monthEnd = currentMonth; // año actual termina en el mes actual
            }

            for (let month = monthStart; month <= monthEnd; month++) {
                options.push({
                    type_name: "SelectOption",
                    name: `${months[month - 1]} ${year}`,
                    value: `${year}-${month.toString().padStart(2, "0")}`
                });
            }
        }

        return options;
    }
}