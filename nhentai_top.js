var mangayomiSources = [{
    name: "nhentai.top",
    langs: ["es"],
    baseUrl: "https://nhentai.top",
    iconUrl: "https://nhentai.top/favicon.ico",
    typeSource: "single",
    itemType: 0,
    isNsfw: true,
    version: "1.0.0",
    pkgPath: "nhentai_top.js"
}];

class DefaultExtension extends MProvider {

    getHeaders(url) {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": this.source.baseUrl + "/"
        };
    }

    // 🔥 Popular = Latest (nhentai.top no separa bien)
    async getPopular(page) {
        return this.getLatestUpdates(page);
    }

    // 🕒 Latest
    async getLatestUpdates(page) {
        const url = page === 1
            ? this.source.baseUrl
            : `${this.source.baseUrl}/page/${page}`;

        const res = await new Client().get(url, this.getHeaders(url));
        return this.mangaListFromPage(res.body);
    }

    async search(query, page, filters) {
        let searchTerms = query.trim();
        let sortParam = "";
        
        let activeFilters = {
            tag: "",
            artist: "",
            group: ""
        };

        if (filters) {
            for (const filter of filters) {
                if (filter.name === "Tags Populares" && filter.values) {
                    activeFilters.tag = filter.values[filter.state].value;
                }
                if (filter.name === "Tag Manual" && filter.state) {
                    activeFilters.tag = filter.state.trim();
                }
                if (filter.name === "Artist" && filter.state) {
                    activeFilters.artist = filter.state.trim();
                }
                if (filter.name === "Group" && filter.state) {
                    activeFilters.group = filter.state.trim();
                }
                if (filter.name === "Ordenar por" && filter.values) {
                    sortParam = filter.values[filter.state].value;
                }
            }
        }

        const slugify = (t) => t.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const usedFilters = Object.keys(activeFilters).filter(k => activeFilters[k] !== "");

        // --- LÓGICA DE URL DIRECTA (Para nhentai.top es más efectivo) ---
        if (searchTerms === "" && usedFilters.length === 1) {
            const type = usedFilters[0]; // tag, artist o group
            const value = slugify(activeFilters[type]);
            
            // Estructura: baseUrl/tag/nombre/popular/page/2
            let url = `${this.source.baseUrl}/${type}/${value}/`;
            if (sortParam) url += `${sortParam}/`;
            if (page > 1) url += `page/${page}/`;

            const res = await new Client().get(url, this.getHeaders(url));
            return this.mangaListFromPage(res.body);
        }

        // --- BÚSQUEDA GENERAL ---
        if (activeFilters.tag) searchTerms += ` ${activeFilters.tag}`;
        if (activeFilters.artist) searchTerms += ` ${activeFilters.artist}`;
        if (activeFilters.group) searchTerms += ` ${activeFilters.group}`;

        if (searchTerms === "" && sortParam === "") return this.getPopular(page);

        // nhentai.top usa /search/?q=...&page=2
        let url = `${this.source.baseUrl}/search/?q=${encodeURIComponent(searchTerms)}`;
        if (sortParam) url += `&sort=${sortParam}`;
        if (page > 1) url += `&page=${page}`;

        const res = await new Client().get(url, this.getHeaders(url));
        return this.mangaListFromPage(res.body);
    }

    // 📚 Listado
    mangaListFromPage(html) {
        const doc = new Document(html);
        const list = [];

        const items = doc.select(".gallery");

        for (const item of items) {
            const a = item.selectFirst("a");
            const img = item.selectFirst("img");
            const title = item.selectFirst(".caption");

            if (!a || !img) continue;

            list.push({
                name: title?.text?.trim() || "Doujin",
                imageUrl: img.attr("src"),
                link: a.attr("href")
            });
        }

        return {
            list,
            hasNextPage: doc.selectFirst("a.next") != null
        };
    }

    // 📘 Detalle
    async getDetail(url) {
        if (!url.startsWith("http")) url = this.source.baseUrl + url;
    
        const res = await new Client().get(url, this.getHeaders(url));
        const doc = new Document(res.body);
    
        const detail = {};
    
        // ✅ Título
        const titleNode = doc.selectFirst("h1.title span.pretty");
        detail.name = titleNode ? titleNode.text.trim() : "Doujin";
    
        // ✅ Portada segura
        const imgNode = doc.selectFirst("#cover img");
        if (imgNode) {
            let src = imgNode.attr("src");
            detail.imageUrl = src.startsWith("http")
                ? src
                : this.source.baseUrl + src;
        } else {
            detail.imageUrl = null;
        }
    
        // ✅ Géneros + Artistas + Pages
        const genres = [];
        const artists = [];
        let pagesCount = "";
    
        const fields = doc.select("#tags > div");
    
        for (const field of fields) {
            const label = field.text.split(":")[0].trim();
            const nodes = field.select(".tag .name");
    
            if (label === "Tags" || label === "Groups") {
                for (const node of nodes) {
                    const text = node.text.trim();
                    if (text) genres.push(text);
                }
            }
    
            if (label === "Artists") {
                for (const node of nodes) {
                    const text = node.text.trim();
                    if (text) artists.push(text);
                }
            }
    
            // ✅ Pages
            if (label === "Pages") {
                const pageNode = field.selectFirst(".name");
                pagesCount = pageNode ? pageNode.text.trim() : "";
            }
        }
    
        detail.genre = genres;
        detail.author = artists.join(", ");
        detail.artist = artists.join(", ");
    
        // ✅ Descripción + Pages
        const descNode = doc.selectFirst("section#content p");
        const baseDesc = descNode ? descNode.text.trim() : "";
    
        detail.description = pagesCount
            ? `Pages: ${pagesCount}\n${baseDesc}`
            : baseDesc;
    
        detail.status = 1;
    
        detail.chapters = [{
            name: detail.name,
            url: url
        }];
    
        return detail;
    }

    // 📖 Páginas
    async getPageList(url) {
        if (!url.startsWith("http")) url = this.source.baseUrl + url;
    
        const res = await new Client().get(url, this.getHeaders(url));
        const doc = new Document(res.body);
    
        const pages = [];
    
        const thumbs = doc.select("#thumbnail-container .thumb-container img");
    
        for (const img of thumbs) {
            let src = img.attr("src");
    
            if (!src.startsWith("http")) {
                src = this.source.baseUrl + src;
            }
    
            // convertir miniatura → imagen real
            src = src
                .replace(/-\d+x\d+/, "") // quitar tamaño 200x280
                .replace("/uploads/", "/uploads/");
    
            pages.push({
                url: src,
                headers: { Referer: url }
            });
        }
    
        return pages;
    }

    getFilterList() {
        return [
            { type_name: "HeaderFilter", name: "Búsqueda por Tags Populares" },
            {
                type_name: "SelectFilter",
                name: "Tags Populares",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Acción Action", value: "accion-action" },
                    { type_name: "SelectOption", name: "Acoso Bullying", value: "acoso-bullying" },
                    { type_name: "SelectOption", name: "Ahegao", value: "ahegao" },
                    { type_name: "SelectOption", name: "Alas Wings", value: "alas-wings" },
                    { type_name: "SelectOption", name: "Albina", value: "albina" },
                    { type_name: "SelectOption", name: "Anal", value: "anal" },
                    { type_name: "SelectOption", name: "Anciana Old Lady", value: "anciana-old-lady" },
                    { type_name: "SelectOption", name: "BBW", value: "bbw" },
                    { type_name: "SelectOption", name: "Bikini", value: "bikini" },
                    { type_name: "SelectOption", name: "Bronceado Tanlines", value: "bronceado-tanlines" },
                    { type_name: "SelectOption", name: "Bruja Witch", value: "bruja-witch" },
                    { type_name: "SelectOption", name: "CG", value: "cg" },
                    { type_name: "SelectOption", name: "Chantaje Blackmail", value: "chantaje-blackmail" },
                    { type_name: "SelectOption", name: "Chica Magica Magical Girl", value: "chica-magica-magical-girl" },
                    { type_name: "SelectOption", name: "Chica Monstruo Monster Girl", value: "chica-monstruo-monster-girl" },
                    { type_name: "SelectOption", name: "Coleta Ponytail", value: "coleta-ponytail" },
                    { type_name: "SelectOption", name: "Coletas Twintail", value: "coletas-twintail" },
                    { type_name: "SelectOption", name: "Com", value: "com" },
                    { type_name: "SelectOption", name: "Comedia Funny", value: "comedia-funny" },
                    { type_name: "SelectOption", name: "Condón Condom", value: "condon-condom" },
                    { type_name: "SelectOption", name: "Control Mental Mind Control", value: "control-mental-mind-control" },
                    { type_name: "SelectOption", name: "Cosplay", value: "cosplay" },
                    { type_name: "SelectOption", name: "Creampie", value: "creampie" },
                    { type_name: "SelectOption", name: "Cuernos Horns", value: "cuernos-horns" },
                    { type_name: "SelectOption", name: "Culonas Big Ass", value: "culonas-big-ass" },
                    { type_name: "SelectOption", name: "Defloration", value: "defloration" },
                    { type_name: "SelectOption", name: "Demonios Demon", value: "demonios-demon" },
                    { type_name: "SelectOption", name: "Dientes Inusuales Unusual Teeth", value: "dientes-inusuales-unusual-teeth" },
                    { type_name: "SelectOption", name: "DILF", value: "dilf" },
                    { type_name: "SelectOption", name: "Doble Penetración Double Penetration", value: "doble-penetracion-double-penetration" },
                    { type_name: "SelectOption", name: "Drogas Drugs", value: "drogas-drugs" },
                    { type_name: "SelectOption", name: "Embarazada Pregnant", value: "embarazada-pregnant" },
                    { type_name: "SelectOption", name: "Escuela School", value: "escuela-school" },
                    { type_name: "SelectOption", name: "Femdom", value: "femdom" },
                    { type_name: "SelectOption", name: "Full Color", value: "full-color" },
                    { type_name: "SelectOption", name: "Futanari DickGirl", value: "futanari-dickgirl" },
                    { type_name: "SelectOption", name: "Gordos Feos Ugly Bastard", value: "gordos-feos-ugly-bastard" },
                    { type_name: "SelectOption", name: "Grabación Filming", value: "grabacion-filming" },
                    { type_name: "SelectOption", name: "Grupo Group", value: "grupo-group" },
                    { type_name: "SelectOption", name: "Gyaru", value: "gyaru" },
                    { type_name: "SelectOption", name: "Harem", value: "harem" },
                    { type_name: "SelectOption", name: "Hija Daughter", value: "hija-daughter" },
                    { type_name: "SelectOption", name: "Hipnosis", value: "hipnosis" },
                    { type_name: "SelectOption", name: "Impregnation", value: "impregnation" },
                    { type_name: "SelectOption", name: "Incesto Incest", value: "incesto-incest" },
                    { type_name: "SelectOption", name: "Inserciones Large Insertions", value: "inserciones-large-insertions" },
                    { type_name: "SelectOption", name: "Juguetes Sexuales Sex Toys", value: "juguetes-sexuales-sex-toys" },
                    { type_name: "SelectOption", name: "Kimono", value: "kimono" },
                    { type_name: "SelectOption", name: "Legal Loli", value: "legal-loli" },
                    { type_name: "SelectOption", name: "Lencería Lingerie", value: "lenceria-lingerie" },
                    { type_name: "SelectOption", name: "Loli", value: "loli" },
                    { type_name: "SelectOption", name: "Loli Baba", value: "loli-baba" },
                    { type_name: "SelectOption", name: "Loli Tetona Oppai Loli", value: "loli-tetona-oppai-loli" },
                    { type_name: "SelectOption", name: "Madre Mother", value: "madre-mother" },
                    { type_name: "SelectOption", name: "Maid", value: "maid" },
                    { type_name: "SelectOption", name: "Mamada Blowjob", value: "mamada-blowjob" },
                    { type_name: "SelectOption", name: "Masturbación Masturbation", value: "masturbacion-masturbation" },
                    { type_name: "SelectOption", name: "Medias Stockings", value: "medias-stockings" },
                    { type_name: "SelectOption", name: "MILF", value: "milf" },
                    { type_name: "SelectOption", name: "Mind Break", value: "mind-break" },
                    { type_name: "SelectOption", name: "Multiples Penes Multiple Penises", value: "multiples-penes-multiple-penises" },
                    { type_name: "SelectOption", name: "Multiples Tetas Multiple Breats", value: "multiples-tetas-multiple-breats" },
                    { type_name: "SelectOption", name: "Músculos Muscle", value: "musculos-muscle" },
                    { type_name: "SelectOption", name: "Nakadashi", value: "nakadashi" },
                    { type_name: "SelectOption", name: "Negros Dark Skin", value: "negros-dark-skin" },
                    { type_name: "SelectOption", name: "Netorare NTR", value: "netorare-ntr" },
                    { type_name: "SelectOption", name: "No Penetration", value: "no-penetration" },
                    { type_name: "SelectOption", name: "No Sex", value: "no-sex" },
                    { type_name: "SelectOption", name: "Orgía Orgy", value: "orgia-orgy" },
                    { type_name: "SelectOption", name: "Paizuri", value: "paizuri" },
                    { type_name: "SelectOption", name: "Peinado Follador", value: "peinado-follador" },
                    { type_name: "SelectOption", name: "Pelo Corto Short Hair", value: "pelo-corto-short-hair" },
                    { type_name: "SelectOption", name: "Pelo largo Very Long Hair", value: "pelo-largo-very-long-hair" },
                    { type_name: "SelectOption", name: "Pene Grande Big Dick", value: "pene-grande-big-dick" },
                    { type_name: "SelectOption", name: "Pezones Invertidos Inverted Nipples", value: "pezones-invertidos-inverted-nipples" },
                    { type_name: "SelectOption", name: "Posesión", value: "posesion" },
                    { type_name: "SelectOption", name: "Profesor Teacher", value: "profesor-teacher" },
                    { type_name: "SelectOption", name: "Prostitución Prostitution", value: "prostitucion-prostitution" },
                    { type_name: "SelectOption", name: "Rubias Blonde", value: "rubias-blonde" },
                    { type_name: "SelectOption", name: "Selfcest", value: "selfcest" },
                    { type_name: "SelectOption", name: "Sexo a escondidas Hidden Sex", value: "sexo-a-escondidas-hidden-sex" },
                    { type_name: "SelectOption", name: "Shota Shotacon", value: "shota-shotacon" },
                    { type_name: "SelectOption", name: "Sin censura Uncensored", value: "sin-censura-uncensored" },
                    { type_name: "SelectOption", name: "Súcubo Succubus", value: "sucubo-succubus" },
                    { type_name: "SelectOption", name: "Tatuajes Tattoo", value: "tatuajes-tattoo" },
                    { type_name: "SelectOption", name: "Tentaculos Tentacle", value: "tentaculos-tentacle" },
                    { type_name: "SelectOption", name: "Tetas enormes Huge Breast", value: "tetas-enormes-huge-breast" },
                    { type_name: "SelectOption", name: "Tetas pequeñas Small Breasts", value: "tetas-pequenas-small-breasts" },
                    { type_name: "SelectOption", name: "Tetonas Big Breast", value: "tetonas-big-breast" },
                    { type_name: "SelectOption", name: "Tomboy", value: "tomboy" },
                    { type_name: "SelectOption", name: "Tortura Torture", value: "tortura-torture" },
                    { type_name: "SelectOption", name: "Traje de baño Swimsuit", value: "traje-de-bano-swimsuit" },
                    { type_name: "SelectOption", name: "Trío Threesome", value: "trio-threesome" },
                    { type_name: "SelectOption", name: "Uniforme escolar Schoolgirl Uniform", value: "uniforme-escolar-schoolgirl-uniform" },
                    { type_name: "SelectOption", name: "Vanilla", value: "vanilla" },
                    { type_name: "SelectOption", name: "Variant Set", value: "variant-set" },
                    { type_name: "SelectOption", name: "Vestido de Novia Bride", value: "vestido-de-novia-bride" },
                    { type_name: "SelectOption", name: "Viaje en el tiempo Time Travel", value: "viaje-en-el-tiempo-time-travel" },
                    { type_name: "SelectOption", name: "Violación Rape", value: "violacion-rape" },
                    { type_name: "SelectOption", name: "Viuda Widow", value: "viuda-widow" },
                    { type_name: "SelectOption", name: "Vomito Vomit", value: "vomito-vomit" },
                    { type_name: "SelectOption", name: "x-ray", value: "x-ray" },
                    { type_name: "SelectOption", name: "Yandere", value: "yandere" },
                    { type_name: "SelectOption", name: "Yuri Lesbian", value: "yuri-lesbian" }
                ]
            },
            { type_name: "SeparatorFilter" },
            { type_name: "HeaderFilter", name: "Búsqueda Manual (Escribir)" },
            { type_name: "TextFilter", name: "Artist", state: "" },
            { type_name: "TextFilter", name: "Group", state: "" },
            { type_name: "TextFilter", name: "Tag Manual", state: "" },
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
