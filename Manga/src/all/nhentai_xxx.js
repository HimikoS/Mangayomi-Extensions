var mangayomiSources = [{
    name: "nhentai.xxx",
    langs: ["all"],
    baseUrl: "https://nhentai.xxx",
    iconUrl: "https://nhentai.xxx/favicon.ico",
    typeSource: "single",
    itemType: 0,
    isNsfw: true,
    version: "1.0.5",
    pkgPath: "nhentai_xxx.js"
}];

class DefaultExtension extends MProvider {

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36",
            "Referer": this.source.baseUrl + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        };
    }

    async request(url) {
        const res = await new Client().get(url, this.getHeaders());
        if (res && res.statusCode === 403) {
            throw new Error("403 Cloudflare: Abre el WebView para verificar.");
        }
        return res;
    }

    async getPopular(page) {
        const url = page <= 1 ? this.source.baseUrl : `${this.source.baseUrl}/page/${page}/`;
        const res = await this.request(url);
        return this.mangaListFromPage(res.body);
    }

    async getLatestUpdates(page) {
        return this.getPopular(page);
    }

    async search(query, page, filters) {
        // Aseguramos que query sea un string
        let searchTerms = query ? String(query).trim() : "";
        let sortParam = "";
        let activeFilters = { tag: "", artist: "", group: "", language: "" };

        if (filters) {
            for (const filter of filters) {
                const name = String(filter.name);
                const state = filter.state;

                if (state === null || state === undefined || state === "") continue;

                // SelectFilters (Indices numéricos)
                if (filter.values && typeof state === 'number') {
                    const selectedOption = filter.values[state];
                    if (selectedOption && selectedOption.value) {
                        const val = String(selectedOption.value);
                        if (name === "Tags Populares") activeFilters.tag = val;
                        if (name === "Language") activeFilters.language = val;
                        if (name === "Ordenar por") sortParam = val;
                    }
                } 
                // TextFilters (Strings)
                else {
                    const val = String(state).trim();
                    if (val !== "") {
                        if (name === "Tag Manual") activeFilters.tag = val;
                        if (name === "Artist") activeFilters.artist = val;
                        if (name === "Group") activeFilters.group = val;
                    }
                }
            }
        }

        // Función slugify ultra segura
        const toSlug = (text) => {
            if (!text || text === "") return "";
            return String(text)
                .toLowerCase()
                .trim()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '');
        };

        const usedFilters = Object.keys(activeFilters).filter(k => activeFilters[k] !== "");

        // --- LÓGICA DE URL DIRECTA ---
        if (searchTerms === "" && usedFilters.length === 1) {
            const type = usedFilters[0];
            const rawValue = activeFilters[type];
            const slugValue = toSlug(rawValue);
            
            if (slugValue !== "") {
                let url = `${this.source.baseUrl}/${type}/${slugValue}/`;
                if (sortParam) url += `${sortParam}/`;
                if (page > 1) url += `page/${page}/`;

                const res = await this.request(url);
                return this.mangaListFromPage(res.body);
            }
        }

        // --- LÓGICA DE BÚSQUEDA ---
        let q = searchTerms;
        if (activeFilters.tag) q += " " + activeFilters.tag;
        if (activeFilters.artist) q += " " + activeFilters.artist;
        if (activeFilters.group) q += " " + activeFilters.group;
        if (activeFilters.language) q += " " + activeFilters.language;

        q = q.trim();

        if (!q && !sortParam) return this.getPopular(page);

        let url = `${this.source.baseUrl}/search/?q=${encodeURIComponent(q)}`;
        if (sortParam) url += `&sort=${sortParam}`;
        if (page > 1) url += `&page=${page}`;

        const res = await this.request(url);
        return this.mangaListFromPage(res.body);
    }

    mangaListFromPage(html) {
        const doc = new Document(html);
        const list = [];
        const items = doc.select(".gallery_item, .gallery");

        for (const item of items) {
            const a = item.selectFirst("a");
            const img = item.selectFirst("img");
            if (!a || !img) continue;

            const title = item.selectFirst(".caption") || item.selectFirst(".title");
            const image = img.attr("data-src") || img.attr("src") || "";
            const fixedImage = image.startsWith("//") ? "https:" + image : image;

            list.push({
                name: title ? title.text.trim() : "Doujin",
                imageUrl: fixedImage,
                link: a.attr("href")
            });
        }

        return {
            list,
            hasNextPage: doc.selectFirst(".pagination .next") != null || doc.selectFirst("a.next") != null
        };
    }

    async getDetail(url) {
        if (!url.startsWith("http")) url = this.source.baseUrl + url;
        const res = await this.request(url);
        const doc = new Document(res.body);

        const detail = {};
        const titleNode = doc.selectFirst(".info h1") || doc.selectFirst("h1");
        detail.name = titleNode ? titleNode.text.trim() : "Doujin";

        const imgNode = doc.selectFirst(".cover img") || doc.selectFirst("#cover img");
        detail.imageUrl = imgNode ? (imgNode.attr("data-src") || imgNode.attr("src")) : null;

        const genres = [];
        const artists = [];
        const tags = doc.select(".tag");
        
        for (const tag of tags) {
            const href = tag.attr("href") || "";
            const nameNode = tag.selectFirst(".name");
            if (!nameNode) continue;
            const name = nameNode.text.trim();
            
            if (href.includes("/tag/")) genres.push(name);
            if (href.includes("/artist/")) artists.push(name);
        }

        detail.genre = genres;
        detail.author = artists.join(", ") || "Unknown";
        detail.status = 1;
        
        const pagesInput = doc.selectFirst("#pages");
        detail.description = pagesInput ? `Pages: ${pagesInput.attr("value")}` : "";

        detail.chapters = [{ name: "Gallery", url: url }];
        return detail;
    }

    async detectRealExtension(url) {
        // asegurarse que termina en /1/ - debe ser /g/ID/PAGE/
        // Patrón: /g/NUMBER/NUMBER/ o /g/NUMBER/
        const urlMatch = url.match(/\/g\/(\d+)(?:\/(\d+))?\/$/);

        if (urlMatch && !urlMatch[2]) {
            // Tiene /g/ID/ pero NO tiene número de página, agregar /1/
            url = url.replace(/\/$/, "") + "/1/";
        }

        try {
            const res = await new Client().get(url, this.getHeaders(url));
            const html = res.body;

            // Buscar en el atributo src del elemento #fimg primero
            const doc = new Document(html);
            const img = doc.selectFirst("#fimg");
            
            if (img) {
                const src = img.attr("data-src") || img.attr("src") || "";
                
                if (src) {
                    const match = src.match(/\.([a-z0-9]+)(?:\?|$)/i);
                    if (match && match[1]) {
                        return match[1].toLowerCase();
                    }
                }
            }

            // Si no funciona, buscar cualquier URL de imagen completa en el HTML
            const srcMatch = html.match(/src="(https:\/\/i\d+\.nhentaimg\.com\/[^"]+\.([a-z0-9]+))/i);
            if (srcMatch && srcMatch[2]) {
                return srcMatch[2].toLowerCase();
            }

            // Último recurso: buscar data-src
            const dataSrcMatch = html.match(/data-src="(https:\/\/i\d+\.nhentaimg\.com\/[^"]+\.([a-z0-9]+))/i);
            if (dataSrcMatch && dataSrcMatch[2]) {
                return dataSrcMatch[2].toLowerCase();
            }

            return "jpg";

        } catch (error) {
            return "jpg";
        }
    }

    // ✅ PÁGINAS (la parte más importante)
    async getPageList(url) {
        // asegurarse que termina en /1/ - debe ser /g/ID/PAGE/
        // Patrón: /g/NUMBER/NUMBER/ o /g/NUMBER/
        const urlMatch = url.match(/\/g\/(\d+)(?:\/(\d+))?\/$/);

        if (urlMatch && !urlMatch[2]) {
            // Tiene /g/ID/ pero NO tiene número de página, agregar /1/
            url = url.replace(/\/$/, "") + "/1/";
        }

        const res = await new Client().get(url, this.getHeaders(url));
        const html = res.body;

        // 🔍 BÚSQUEDA DE VALORES
        const server = html.match(/id="server_id"[^>]*value="([^"]+)"/)?.[1];
        const dir = html.match(/id="image_dir"[^>]*value="([^"]+)"/)?.[1];
        const id = html.match(/id="gallery_id"[^>]*value="([^"]+)"/)?.[1];
        const total = html.match(/id="pages"[^>]*value="([^"]+)"/)?.[1];

        if (!server || !dir || !id || !total) {
            return [];
        }

        // 👇 EXTENSIÓN REAL
        const ext = await this.detectRealExtension(url);

        const pages = [];
        const headers = { Referer: url };

        for (let i = 1; i <= parseInt(total); i++) {
            pages.push({
                url: `https://i${server}.nhentaimg.com/${dir}/${id}/${i}.${ext}`,
                headers
            });
        }

        return pages;
    }

    getFilterList() {
        return [
            { type_name: "HeaderFilter", name: "Tags Populares" },
            {
                type_name: "SelectFilter",
                name: "Tags Populares",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Ninguno", value: "" },
                    { type_name: "SelectOption", name: "Big Breasts", value: "big-breasts" },
                    { type_name: "SelectOption", name: "Sole Female", value: "sole-female" },
                    { type_name: "SelectOption", name: "Sole Male", value: "sole-male" },
                    { type_name: "SelectOption", name: "Stockings", value: "stockings" },
                    { type_name: "SelectOption", name: "Schoolgirl Uniform", value: "schoolgirl-uniform" },
                    { type_name: "SelectOption", name: "Anal", value: "anal" },
                    { type_name: "SelectOption", name: "Nakadashi", value: "nakadashi" },
                    { type_name: "SelectOption", name: "Glasses", value: "glasses" },
                    { type_name: "SelectOption", name: "Yuri", value: "yuri" },
                    { type_name: "SelectOption", name: "Incest", value: "incest" },
                    { type_name: "SelectOption", name: "Milf", value: "milf" },
                    { type_name: "SelectOption", name: "Full Color", value: "full-color" },
                    { type_name: "SelectOption", name: "Futanari", value: "futanari" },
                    { type_name: "SelectOption", name: "Tentacles", value: "tentacles" },
                    { type_name: "SelectOption", name: "Creampie", value: "creampie" },
                    { type_name: "SelectOption", name: "Bondage", value: "bondage" },
                    { type_name: "SelectOption", name: "Cosplay", value: "cosplay" },
                    { type_name: "SelectOption", name: "Lolicon", value: "lolicon" },
                    { type_name: "SelectOption", name: "Shota", value: "shota" },
                    { type_name: "SelectOption", name: "Blowjob", value: "blowjob" },
                    { type_name: "SelectOption", name: "Masturbation", value: "masturbation" },
                    { type_name: "SelectOption", name: "Group Sex", value: "group-sex" },
                    { type_name: "SelectOption", name: "Cunnilingus", value: "cunnilingus" },
                    { type_name: "SelectOption", name: "Handjob", value: "handjob" },
                    { type_name: "SelectOption", name: "Femdom", value: "femdom" },
                    { type_name: "SelectOption", name: "Foreskin", value: "foreskin" }
                ]
            },
            { type_name: "SeparatorFilter" },
            { type_name: "HeaderFilter", name: "Búsqueda Manual" },
            { type_name: "TextFilter", name: "Artist", state: "" },
            { type_name: "TextFilter", name: "Group", state: "" },
            { type_name: "TextFilter", name: "Tag Manual", state: "" },
            {
                type_name: "SelectFilter",
                name: "Language",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Todos", value: "" },
                    { type_name: "SelectOption", name: "English", value: "english" },
                    { type_name: "SelectOption", name: "Japanese", value: "japanese" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Ordenar por",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Recientes", value: "" },
                    { type_name: "SelectOption", name: "Populares (Todo)", value: "popular" },
                    { type_name: "SelectOption", name: "Populares (Hoy)", value: "popular-today" }
                ]
            }
        ];
    }
}