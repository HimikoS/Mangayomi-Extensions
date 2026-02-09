var mangayomiSources = [{
    name: "nhentai.net",
    langs: ["all"],
    baseUrl: "https://nhentai.net",
    iconUrl: "https://nhentai.net/favicon.ico",
    typeSource: "single",
    itemType: 0,
    isNsfw: true,
    version: "1.0.5",
    pkgPath: "nhentai_net.js"
}];

class DefaultExtension extends MProvider {

    getHeaders(url) {
        return {
            "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36",
            "Referer": this.source.baseUrl + "/",
            "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        };
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async request(url, retryCount = 0) {
        const headers = this.getHeaders(url);
        
        // Añadir delay antes de reintentos (Cloudflare rate limiting)
        if (retryCount > 0) {
            await this.sleep(500 * retryCount);
        }

        try {
            const res = await new Client().get(url, headers);

            if (res && (res.statusCode === 403 || res.status === 403)) {
                // Reintentar hasta 3 veces
                if (retryCount < 3) {
                    return this.request(url, retryCount + 1);
                } else {
                    throw new Error("Failed to bypass Cloudflare.\n\nYou can try to bypass it manually in the webview\n\nstatusCode: 403");
                }
            }

            return res;
        } catch (error) {
            if (retryCount < 3) {
                return this.request(url, retryCount + 1);
            }
            throw error;
        }
    }

    async getPopular(page) {
        return this.getLatestUpdates(page);
    }

    async getLatestUpdates(page) {
        const url = page === 1
            ? `${this.source.baseUrl}/`
            : `${this.source.baseUrl}/?page=${page}`;

        const res = await this.request(url);
        return this.mangaListFromPage(res.body);
    }

    async search(query, page, filters) {
        let searchTerms = query.trim();
        let sortParam = "";
        let filterParts = [];

        if (filters) {
            for (const filter of filters) {
                // Tag Seleccionado de la lista
                if (filter.name === "Tags Populares" && filter.values) {
                    const val = filter.values[filter.state].value;
                    if (val) filterParts.push(`tag:"${val}"`);
                }

                // Tag Escrito manualmente
                if (filter.name === "Tag Manual" && filter.state) {
                    filterParts.push(`tag:"${filter.state.trim()}"`);
                }

                // Artista y Grupo
                if (filter.type_name === "TextFilter" && filter.state) {
                    if (filter.name === "Artist") filterParts.push(`artist:"${filter.state.trim()}"`);
                    if (filter.name === "Group") filterParts.push(`group:"${filter.state.trim()}"`);
                }

                // Idioma
                if (filter.name === "Language" && filter.values) {
                    const lang = filter.values[filter.state].value;
                    if (lang) filterParts.push(`language:"${lang}"`);
                }

                // Orden
                if (filter.name === "Ordenar por" && filter.values) {
                    sortParam = filter.values[filter.state].value;
                }
            }
        }

        if (filterParts.length > 0) {
            searchTerms += (searchTerms ? " " : "") + filterParts.join(" ");
        }

        if (searchTerms === "" && sortParam === "") return this.getPopular(page);

        let url = `${this.source.baseUrl}/search/?q=${encodeURIComponent(searchTerms)}&page=${page}`;
        if (sortParam !== "") url += `&sort=${sortParam}`;

        const res = await this.request(url);
        return this.mangaListFromPage(res.body);
    }

    // ✅ LISTADO
    mangaListFromPage(html) {
        const doc = new Document(html);
        const list = [];

        // En nhentai las galerías están en <div class="gallery">
        const items = doc.select(".gallery");

        for (const item of items) {
            const a = item.selectFirst("a");
            const img = item.selectFirst("img");
            const title = item.selectFirst(".caption");

            if (!a || !img) continue;

            // Obtener URL de imagen original
            const image = img.attr("data-src") || img.attr("src");

            // ✅ Corregir URL: https + forzar t3.nhentai.net
            const fixedImage = image
                ? image.replace(/^\/\//, "https://").replace(/t\d\.nhentai\.net/, "t3.nhentai.net")
                : null;

            list.push({
                name: title?.text?.trim() || "Doujin",
                imageUrl: fixedImage,
                link: a.attr("href")
            });
        }

        return {
            list,
            hasNextPage: doc.selectFirst(".pagination a.next") != null
        };
    }

    // ✅ DETALLE
    async getDetail(url) {
        console.log(" getDetail Url = " + url);
        
        const idMatch = url.match(/\/g\/(\d+)/);
        if (!idMatch) throw new Error("No se pudo obtener el ID de: " + url);
        const id = idMatch[1];

        const apiUrl = `${this.source.baseUrl}/api/gallery/${id}`;
        const res = await this.request(apiUrl);
        const json = JSON.parse(res.body);

        // 1. Extraer ID de medios (media_id)
        const mediaId = json.media_id;
        if (!mediaId) throw new Error("No se encontró media_id en la API");

        // 2. Función para convertir el tipo de la API ('j', 'p', 'w') a extensión real
        const getExtension = (t) => {
            switch (t) {
                case 'p': return 'png';
                case 'w': return 'webp';
                case 'g': return 'gif';
                case 'j':
                default: return 'jpg';
            }
        };

        // 3. Obtener extensión de la portada con seguridad
        const coverData = json.images.cover;
        const coverExt = getExtension(coverData ? coverData.t : 'j');

        // 4. Construir URL final de la imagen
        const coverUrl = `https://t3.nhentai.net/galleries/${mediaId}/cover.${coverExt}`;

        // Procesar Tags
        const tags = [];
        const artists = [];
        if (json.tags) {
            json.tags.forEach(tag => {
                if (tag.type === 'artist') artists.push(tag.name);
                else if (tag.type === 'tag') tags.push(tag.name);
            });
        }

        return {
            name: json.title.pretty || json.title.english || "Doujin",
            imageUrl: coverUrl, // Ahora ya no debería quedar vacía
            genre: tags,
            author: artists.join(", ") || "Unknown",
            status: 1, // MStatus.completed
            description: `Pages: ${json.num_pages || ""}\nMedia ID: ${mediaId}`,
            chapters: [{
                name: "Gallery",
                url: url
            }]
        };
    }

    // ✅ PÁGINAS
    async getPageList(url) {
        console.log(" getPageList Url = " + url);
        // ¡Aquí también podemos usar la API para ser más precisos!
        const idMatch = url.match(/\/g\/(\d+)/);
        if (!idMatch) return [];
        const id = idMatch[1];

        const apiUrl = `${this.source.baseUrl}/api/gallery/${id}`;
        const res = await this.request(apiUrl);
        const json = JSON.parse(res.body);
        
        const mediaId = json.media_id;
        
        return json.images.pages.map((page, index) => {
            let ext = 'jpg';
            if (page.t === 'p') ext = 'png';
            if (page.t === 'w') ext = 'webp';

            return {
                url: `https://i.nhentai.net/galleries/${mediaId}/${index + 1}.${ext}`
            };
        });
    }

    getFilterList() {
        return [
            { type_name: "HeaderFilter", name: "Búsqueda por Tags Populares" },
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
                    { type_name: "SelectOption", name: "Loli", value: "loli" },
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
            { type_name: "HeaderFilter", name: "Búsqueda Manual (Escribir)" },
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
                    { type_name: "SelectOption", name: "Japonés", value: "japanese" },
                    { type_name: "SelectOption", name: "Chino", value: "chinese" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Ordenar por",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Recientes", value: "" },
                    { type_name: "SelectOption", name: "Populares (Todo)", value: "popular" },
                    { type_name: "SelectOption", name: "Populares (Hoy)", value: "popular-today" },
                    { type_name: "SelectOption", name: "Populares (Semana)", value: "popular-week" }
                ]
            }
        ];
    }
}