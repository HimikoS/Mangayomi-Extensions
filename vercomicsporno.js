var mangayomiSources = [{
    name: "VerComicsPorno",
    langs: ["es"],
    baseUrl: "https://vercomicsporno.xxx",
    iconUrl: "https://vercomicsporno.xxx/favicon.ico",
    typeSource: "single",
    itemType: 0,
    isNsfw: true,
    version: "1.0.0",
    pkgPath: "vercomicsporno.js"
}];

class DefaultExtension extends MProvider {

    getHeaders(url) {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Referer": this.source.baseUrl + "/"
        };
    }

    // 🔥 Popular = Latest (la web no tiene popular real)
    async getPopular(page) {
        return this.getLatestUpdates(page);
    }

    // 🕒 Últimos subidos
    async getLatestUpdates(page) {
        const url = page === 1
            ? this.source.baseUrl
            : `${this.source.baseUrl}/page/${page}`;

        const res = await new Client().get(url, this.getHeaders(url));
        return this.mangaListFromPage(res.body);
    }

    // 🔍 Búsqueda
    async search(query, page) {
        const url = `${this.source.baseUrl}/?s=${encodeURIComponent(query)}&paged=${page}`;
        const res = await new Client().get(url, this.getHeaders(url));
        return this.mangaListFromPage(res.body);
    }

    // 📘 Detalles
    async getDetail(url) {
        if (!url.startsWith("http")) url = this.source.baseUrl + url;

        const res = await new Client().get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const detail = {};

        detail.name =
            doc.selectFirst("h2.item-title")?.text?.trim() ?? "Comic";

        // ⚠️ NO tocar imageUrl
        // Mangayomi usará la miniatura del listado

        detail.genre = doc
            .select(".tagcloud a")
            .map(e => e.text.trim());

        detail.description = "Comic de VerComicsPorno";
        detail.status = 1;

        detail.chapters = [{
            name: detail.name,
            url: url
        }];

        return detail;
    }

    // 📖 Lectura (imágenes)
    async getPageList(url) {
        if (!url.startsWith("http")) url = this.source.baseUrl + url;

        const res = await new Client().get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const pages = [];

        const imgs = doc.select(".entry-content img");

        for (const img of imgs) {
            const src = img.attr("src");
            if (!src) continue;

            // filtro fuerte: solo imágenes del cómic
            if (!src.includes("/images/")) continue;

            pages.push({
                url: src,
                headers: { Referer: url }
            });
        }

        return pages;
    }

    // 📚 Listado principal
    mangaListFromPage(html) {
        const doc = new Document(html);
        const list = [];

        const items = doc.select("div.post");

        for (const item of items) {
            const a = item.selectFirst("h4.heading a");
            const img = item.selectFirst(".c-blog__thumbnail img");

            if (!a || !img) continue;

            const image =
                img.attr("data-src") ||
                img.attr("data-lazy-src") ||
                (img.attr("srcset") ? img.attr("srcset").split(" ")[0] : null) ||
                img.attr("src");

            if (!image) continue;

            list.push({
                name: a.text?.trim() || "Comic",
                imageUrl: image,
                link: a.attr("href")
            });
        }

        return {
            list,
            hasNextPage: doc.selectFirst(".pagination .next, a.next") != null
        };
    }

    getFilterList() {
        return [];
    }
}
