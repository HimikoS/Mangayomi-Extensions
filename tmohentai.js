var mangayomiSources = [{
    "name": "TMOHentai",
    "langs": ["es"],
    "baseUrl": "https://tmohentai.com",
    "iconUrl": "https://tmohentai.com/favicon.ico",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": true,
    "version": "1.2.8",
    "pkgPath": "tmohentai.js"
}];

class DefaultExtension extends MProvider {
    getHeaders(url) {
        return {
            "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36",
            "Referer": this.source.baseUrl + "/"
        };
    }

    async request(url) {
        const res = await new Client().get(url, this.getHeaders(url));
        if (res && res.statusCode === 403) {
            throw new Error("403 Cloudflare: Abre el WebView para verificar.");
        }
        return res;
    }

    async getPopular(page) {
        const url = `${this.source.baseUrl}/section/hentai?view=thumbnails&page=${page}&order=popularity&order-dir=desc&type=all`;
        const res = await this.request(url);
        return this.mangaListFromPage(res.body);
    }

    async getLatestUpdates(page) {
        const url = `${this.source.baseUrl}/section/hentai?view=thumbnails&page=${page}&order=publication_date&order-dir=desc&type=all`;
        const res = await this.request(url);
        return this.mangaListFromPage(res.body);
    }
    
    // ✅ BUSCADOR CON RUTA ESPECIAL PARA GROUPS
    async search(query, page, filters) {
        let searchText = query ? String(query).trim() : "";
        let searchBy = "name"; 
        let sortParam = "&order=publication_date&order-dir=desc";
        let section = "hentai"; 
        let genres = [];
        let tagFromList = "";

        if (filters) {
            for (const filter of filters) {
                const name = String(filter.name);
                const state = filter.state;

                if (state === null || state === undefined || state === "") continue;

                if (name === "Sección" && filter.values) {
                    section = filter.values[state].value;
                }
                if (name === "Buscar por" && filter.values) {
                    searchBy = filter.values[state].value;
                }
                if (name === "Filtro de Texto" && typeof state === 'string') {
                    searchText = state.trim();
                }
                if (name === "Tags Populares" && filter.values) {
                    const val = filter.values[state].value;
                    if (val !== "") {
                        tagFromList = val;
                        searchBy = "tag"; 
                    }
                }
                if (name === "Ordenar por" && filter.values) {
                    sortParam = filter.values[state].value;
                }
                if (name === "Géneros" && Array.isArray(state)) {
                    for (const cb of state) {
                        if (cb.state === true) genres.push(encodeURIComponent(cb.name));
                    }
                }
            }
        }

        if (tagFromList !== "") {
            searchText = (searchText !== "") ? `${searchText} ${tagFromList}` : tagFromList;
        }

        // --- CORRECCIÓN DE RUTA ---
        // Si es "groups", la URL es /groups. Si es otra cosa, es /section/nombre
        let basePath = section === "groups" 
            ? `${this.source.baseUrl}/groups` 
            : `${this.source.baseUrl}/section/${section}`;

        let url = `${basePath}?view=thumbnails&page=${page}${sortParam}`;
        url += `&search[searchText]=${encodeURIComponent(searchText)}`;
        url += `&search[searchBy]=${searchBy}`;
        url += `&type=all`; 

        if (genres.length > 0) {
            genres.forEach(g => { url += `&genders[]=${g}`; });
        }

        const res = await this.request(url);
        return this.mangaListFromPage(res.body);
    }

    async getDetail(url) {
        if (!url.startsWith("http")) url = this.source.baseUrl + url;
        const res = await this.request(url);
        const doc = new Document(res.body);
        const detail = {};
    
        const nameElement = doc.selectFirst("h1, .panel-heading h3, .manga-title");
        detail.name = nameElement ? nameElement.text.trim() : "Manga";
    
        const imgElement = doc.selectFirst("img.content-thumbnail-cover, img.img-responsive, .manga-cover");
        detail.imageUrl = imgElement ? imgElement.attr("src") : "";
    
        const artistElement = doc.selectFirst("a[href*='searchBy]=artist']");
        detail.author = artistElement ? artistElement.text.trim() : "Desconocido";
    
        detail.genre = doc.select("a[href*='genders[]'], a[href*='searchBy]=tag']").map(e => e.text.trim());
        
        const descElement = doc.selectFirst("div.panel-body p, #synopsis");
        detail.description = descElement ? descElement.text.trim() : "Manga de TMOHentai";
        detail.status = 1;
    
        const chapters = [];

        // 🔥 detectar tabla uploader / grupo
        const tableRows = doc.select("table.table-hover tbody tr");
        if (tableRows.length > 0) {
            // === modo grupo → lista de mangas ===
            for (const row of tableRows) {
                const link = row.selectFirst("td a");
                if (!link) continue;

                let url = link.attr("href");
                if (!url.startsWith("http")) url = this.source.baseUrl + url;

                chapters.push({
                    name: link.text.trim(),
                    url: url
                });
            }

        } else {
            // === modo manga normal ===
            const readBtn = doc.selectFirst("a.lanzador, a[href*='/reader/']");
            if (readBtn) {
                let chUrl = readBtn.attr("href");
                if (!chUrl.startsWith("http")) chUrl = this.source.baseUrl + chUrl;

                let cleanUrl = chUrl.split("/paginated")[0];
                if (cleanUrl.endsWith("/")) cleanUrl = cleanUrl.slice(0, -1);
                if (!cleanUrl.endsWith("/cascade")) cleanUrl += "/cascade";

                chapters.push({
                    name: "Capítulo Único",
                    url: cleanUrl
                });
            }
        }
        detail.chapters = chapters;
        return detail;
    }

    async getPageList(url) {
        const res = await this.request(url);
        const body = res.body;
        const pages = [];
        const regex = /https?:\/\/[^"'>]+\.(?:jpg|jpeg|png|webp|avif)/gi;
        const matches = body.match(regex) || [];

        for (let src of matches) {
            if (src.includes("/contents/") && !src.includes("cover") && !src.includes("logo")) {
                if (!pages.find(p => p.url === src)) {
                    pages.push({ url: src.trim(), headers: { "Referer": url } });
                }
            }
        }
        return pages;
    }

    mangaListFromPage(html) {
        const doc = new Document(html);

        // 🔥 Detectar si es página de groups
        const groupCards = doc.select("div.group-banner");

        if (groupCards.length > 0) {
            return this.groupListFromPage(doc);
        }

        // === Parser normal de mangas ===
        const elements = doc.select("div.element-thumbnail");
        const list = [];

        for (const element of elements) {
            const titleTag = element.selectFirst("div.content-title a");
            const imgTag = element.selectFirst("img.content-thumbnail-cover");

            if (titleTag && imgTag) {
                let link = titleTag.attr("href");
                if (!link.startsWith("http")) link = this.source.baseUrl + link;

                list.push({
                    name: titleTag.text.trim(),
                    imageUrl: imgTag.attr("src"),
                    link: link
                });
            }
        }

        return {
            list: list,
            hasNextPage: doc.selectFirst("ul.pagination li.active + li") != null
        };
    }

    groupListFromPage(doc) {
        const cards = doc.select("div.col-xs-12.col-sm-6.col-md-4");
        const list = [];

        for (const card of cards) {
            const linkTag = card.selectFirst("a");
            const nameTag = card.selectFirst(".group-title h5");
            const logoTag = card.selectFirst("img.group-thumbnail-logo");

            if (!linkTag || !nameTag || !logoTag) continue;

            let link = linkTag.attr("href");
            if (!link.startsWith("http")) link = this.source.baseUrl + link;

            list.push({
                name: nameTag.text.trim(),
                imageUrl: logoTag.attr("src"),
                link: link
            });
        }

        return {
            list: list,
            hasNextPage: doc.selectFirst("ul.pagination li.active + li") != null
        };
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Buscar por",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Nombre", value: "name" },
                    { type_name: "SelectOption", name: "Artista", value: "artist" },
                    { type_name: "SelectOption", name: "Revista (Magazine)", value: "magazine" },
                    { type_name: "SelectOption", name: "Etiqueta (Tag)", value: "tag" },
                ]
            },
            { type_name: "TextFilter", name: "Filtro de Texto", state: "" },
            { type_name: "SeparatorFilter" },
            {
                type_name: "SelectFilter",
                name: "Tags Populares",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Ninguno", value: "" },
                    { type_name: "SelectOption", name: "Big Breasts", value: "Big Breasts" },
                    { type_name: "SelectOption", name: "Anal", value: "Anal" },
                    { type_name: "SelectOption", name: "Yuri", value: "Yuri" },
                    { type_name: "SelectOption", name: "Incesto", value: "Incesto" },
                    { type_name: "SelectOption", name: "Milf", value: "Milf" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Ordenar por",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Más Recientes", value: "&order=publication_date&order-dir=desc" },
                    { type_name: "SelectOption", name: "Más Antiguos", value: "&order=publication_date&order-dir=asc" },
                    { type_name: "SelectOption", name: "Más Populares", value: "&order=popularity&order-dir=desc" },
                    { type_name: "SelectOption", name: "Menos Populares", value: "&order=popularity&order-dir=asc" },
                    { type_name: "SelectOption", name: "Más Vistos", value: "&order=view_count&order-dir=desc" },
                    { type_name: "SelectOption", name: "Alfabético (A-Z)", value: "&order=alphabetic&order-dir=asc" },
                    { type_name: "SelectOption", name: "Alfabético (Z-A)", value: "&order=alphabetic&order-dir=desc" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Sección",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Hentai", value: "hentai" },
                    { type_name: "SelectOption", name: "Yaoi", value: "yaoi" },
                    { type_name: "SelectOption", name: "Yuri", value: "yuri" },
                    { type_name: "SelectOption", name: "Groups", value: "groups" }
                ]
            }
        ];
    }
}