var mangayomiSources = [{
    "name": "TMOHentai",
    "langs": ["es"],
    "baseUrl": "https://tmohentai.com",
    "apiUrl": "",
    "iconUrl": "https://tmohentai.com/favicon.ico",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": true,
    "version": "1.1.3",
    "pkgPath": "tmohentai.js",
    "notes": "Corregido modo cascada para cargar todas las páginas"
}];

class DefaultExtension extends MProvider {
    getHeaders(url) {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": this.source.baseUrl + "/"
        };
    }

    async getPopular(page) {
        const url = `${this.source.baseUrl}/section/hentai?view=thumbnails&page=${page}&order=popularity&order-dir=desc&type=all`;
        const res = await new Client().get(url, this.getHeaders(url));
        return this.mangaListFromPage(res.body);
    }

    async getLatestUpdates(page) {
        const url = `${this.source.baseUrl}/section/hentai?view=thumbnails&page=${page}&order=publication_date&order-dir=desc&type=all`;
        const res = await new Client().get(url, this.getHeaders(url));
        return this.mangaListFromPage(res.body);
    }
    
    async search(query, page, filters) {
        const url = `${this.source.baseUrl}/search?search=${query}&page=${page}`;
        const res = await new Client().get(url, this.getHeaders(url));
        return this.mangaListFromPage(res.body);
    }

    async getDetail(url) {
        if (!url.startsWith("http")) url = this.source.baseUrl + url;
    
        const res = await new Client().get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const detail = {};
    
        // 1. NOMBRE
        const nameElement = doc.selectFirst("h1, .panel-heading h3, .manga-title");
        detail.name = nameElement ? nameElement.text.trim() : "Manga";
    
        // 2. IMAGEN (PORTADA)
        const imgElement = doc.selectFirst("img.content-thumbnail-cover, img.img-responsive, .manga-cover");
        detail.imageUrl = imgElement ? imgElement.attr("src") : "";
    
        // 3. ARTISTA / AUTOR
        const artistElement = doc.selectFirst("a[href*='searchBy]=artist']");
        const artistName = artistElement ? artistElement.text.trim() : "Desconocido";
        detail.author = artistName;
        detail.artist = artistName;
    
        // 4. GÉNEROS + TAGS
        const genres = doc
            .select("a[href*='genders[]'], a[href*='searchBy]=tag']")
            .map(e => e.text.trim())
            .filter(t => t !== "");
        detail.genre = genres;
    
        // 5. FANSUB / UPLOADER
        const groupElement = doc.selectFirst("a[href*='/groups/']");
        const groupName = groupElement ? groupElement.text.trim() : "No especificado";
    
        // 6. DESCRIPCIÓN
        const descElement = doc.selectFirst("div.panel-body p, #synopsis");
        detail.description = descElement
            ? descElement.text.trim()
            : "Manga de TMOHentai";
    
        // 7. ESTADO (1 = FINALIZADO)
        detail.status = 1;
    
        // 8. CAPÍTULOS (CASCADE)
        const chapters = [];
        const readBtn = doc.selectFirst("a.lanzador, a[href*='/reader/']");
    
        if (readBtn) {
            let chUrl = readBtn.attr("href");
            if (!chUrl.startsWith("http")) chUrl = this.source.baseUrl + chUrl;
    
            let cleanUrl = chUrl.split("/paginated")[0];
            if (cleanUrl.endsWith("/")) cleanUrl = cleanUrl.slice(0, -1);
            if (!cleanUrl.endsWith("/cascade")) cleanUrl += "/cascade";
    
            chapters.push({
                name: "Capítulo Único (Completo)",
                url: cleanUrl,
                scanlator: groupName,
            });
        }
    
        detail.chapters = chapters;
        return detail;
    }

    async getPageList(url) {
        // Aseguramos que la URL sea completa
        if (!url.startsWith("http")) url = this.source.baseUrl + url;
        
        // REFUERZO: Si por alguna razón la URL no trae cascade, se lo ponemos aquí también
        let finalUrl = url.split('/paginated')[0];
        if (finalUrl.endsWith('/')) finalUrl = finalUrl.slice(0, -1);
        if (!finalUrl.endsWith('/cascade')) finalUrl += '/cascade';

        const res = await new Client().get(finalUrl, this.getHeaders(finalUrl));
        const body = res.body;
        const pages = [];

        // MODO 1: Regex (El que te funcionó en el test)
        const regex = /https?:\/\/[^"'>]+\.(?:jpg|jpeg|png|webp|avif)/gi;
        const matches = body.match(regex) || [];

        for (let src of matches) {
            if (src.includes("/contents/") && !src.includes("cover") && !src.includes("logo")) {
                if (!pages.find(p => p.url === src)) {
                    pages.push({ 
                        url: src.trim(), 
                        headers: { "Referer": finalUrl } 
                    });
                }
            }
        }

        // MODO 2: Fallback por selectores
        if (pages.length === 0) {
            const doc = new Document(body);
            const imgElements = doc.select("img.viewer-image, img.img-fluid, .viewer-container img");
            for (const img of imgElements) {
                let src = img.attr("data-src") || img.attr("src");
                if (src && src.includes("/contents/") && !src.includes("logo")) {
                    if (src.startsWith("//")) src = "https:" + src;
                    else if (src.startsWith("/")) src = this.source.baseUrl + src;
                    pages.push({ url: src, headers: { "Referer": finalUrl } });
                }
            }
        }

        return pages;
    }

    mangaListFromPage(html) {
        const doc = new Document(html);
        const elements = doc.select("div.element-thumbnail");
        const list = [];
        for (const element of elements) {
            const titleTag = element.selectFirst("div.content-title a");
            const imgTag = element.selectFirst("img.content-thumbnail-cover");
            if (titleTag && imgTag) {
                let link = titleTag.attr("href");
                if (!link.startsWith("http")) link = this.source.baseUrl + link;
                list.push({ name: titleTag.text.trim(), imageUrl: imgTag.attr("src"), link: link });
            }
        }
        return { list: list, hasNextPage: doc.selectFirst("ul.pagination li.active + li") != null };
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
                    { type_name: "SelectOption", name: "Anal", value: "anal" },
                    { type_name: "SelectOption", name: "Yuri", value: "yuri" },
                    { type_name: "SelectOption", name: "Incest", value: "incest" },
                    { type_name: "SelectOption", name: "Milf", value: "milf" },
                    { type_name: "SelectOption", name: "Lolicon", value: "lolicon" },
                    { type_name: "SelectOption", name: "Shota", value: "shota" },
                    { type_name: "SelectOption", name: "Blowjob", value: "blowjob" },
                    { type_name: "SelectOption", name: "Masturbation", value: "masturbation" },
                    { type_name: "SelectOption", name: "Group Sex", value: "group-sex" }
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
