const mangayomiSources = [{
    name: "Torrentio Anime (Torrent)",
    lang: "all",
    baseUrl: "https://torrentio.strem.fun",
    apiUrl: "",
    iconUrl: "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/all.torrentio.png",
    typeSource: "torrent",
    isManga: false,
    itemType: 1,
    version: "0.0.3",
    pkgPath: "anime/src/all/torrentioanime.js"
}];

const ANILIST_URL = "https://graphql.anilist.co";
const MAPPING_URL = "https://api.ani.zip/mappings?anilist_id=";
const KITSU_META_URL = "https://anime-kitsu.strem.fun/meta/series/kitsu%3A";

class DefaultExtension extends MProvider {

    constructor() {
        super();
        this.client = new Client();
        this.prefs = new SharedPreferences();
    }

    // ======================
    // AniList Queries
    // ======================

    anilistQuery() {
        return `
        query ($page: Int, $perPage: Int, $sort: [MediaSort], $search: String) {
            Page(page: $page, perPage: $perPage) {
                pageInfo { currentPage hasNextPage }
                media(
                    type: ANIME,
                    sort: $sort,
                    search: $search,
                    status_in: [RELEASING, FINISHED, NOT_YET_RELEASED]
                ) {
                    id
                    title { romaji english native }
                    coverImage { extraLarge large }
                    description
                    status
                    tags { name }
                    genres
                    studios { nodes { name } }
                    countryOfOrigin
                    isAdult
                }
            }
        }`.trim();
    }

    anilistLatestQuery() {
        const now = Math.floor(Date.now() / 1000);

        return `
        query ($page: Int, $perPage: Int, $sort: [AiringSort]) {
            Page(page: $page, perPage: $perPage) {
                pageInfo { currentPage hasNextPage }
                airingSchedules(
                    airingAt_greater: 0,
                    airingAt_lesser: ${now - 10000},
                    sort: $sort
                ) {
                    media {
                        id
                        title { romaji english native }
                        coverImage { extraLarge large }
                        description
                        status
                        tags { name }
                        genres
                        studios { nodes { name } }
                        countryOfOrigin
                        isAdult
                    }
                }
            }
        }`.trim();
    }

    async makeGraphQLRequest(query, variables) {
        return await this.client.post(ANILIST_URL, {}, { query, variables });
    }

    // ======================
    // Helpers
    // ======================

    getPreferredTitle(title) {
        const pref = this.prefs.get("pref_title");

        if (pref === "english") {
            return title?.english?.trim() || title?.romaji || "";
        }
        if (pref === "native") {
            return title?.native || "";
        }
        return title?.romaji || "";
    }

    mapStatus(status) {
        const map = {
            RELEASING: 0,
            FINISHED: 1,
            HIATUS: 2,
            NOT_YET_RELEASED: 3
        };
        return map[status] ?? 5;
    }

    cleanDescription(text) {
        return (text || "No Description")
            .replace(/<br><br>/g, "\n")
            .replace(/<.*?>/g, "");
    }

    // ======================
    // Parsing
    // ======================

    parseSearchJson(jsonLine, isLatest = false) {
        const data = JSON.parse(jsonLine);
        const page = data?.data?.Page;

        const mediaList = isLatest
            ? (page?.airingSchedules || []).map(s => s.media)
            : (page?.media || []);

        const list = mediaList
            .filter(m => !(isLatest && (m?.countryOfOrigin === "CN" || m?.isAdult)))
            .map(m => ({
                link: m?.id?.toString() || "",
                name: this.getPreferredTitle(m?.title),
                imageUrl: m?.coverImage?.extraLarge || ""
            }));

        return {
            list,
            hasNextPage: page?.pageInfo?.hasNextPage || false
        };
    }

    // ======================
    // Lists
    // ======================

    async getPopular(page) {
        const variables = JSON.stringify({
            page,
            perPage: 30,
            sort: "TRENDING_DESC"
        });

        const res = await this.makeGraphQLRequest(this.anilistQuery(), variables);
        return this.parseSearchJson(res.body);
    }

    async getLatestUpdates(page) {
        const variables = JSON.stringify({
            page,
            perPage: 30,
            sort: "TIME_DESC"
        });

        const res = await this.makeGraphQLRequest(this.anilistLatestQuery(), variables);
        return this.parseSearchJson(res.body, true);
    }

    async search(query, page) {
        const variables = JSON.stringify({
            page,
            perPage: 30,
            sort: "POPULARITY_DESC",
            search: query
        });

        const res = await this.makeGraphQLRequest(this.anilistQuery(), variables);
        return this.parseSearchJson(res.body);
    }

    // ======================
    // Detail
    // ======================

    async getDetail(id) {

        const query = `
        query($id: Int){
            Media(id: $id){
                id
                title { romaji english native }
                coverImage { extraLarge }
                description
                status
                tags { name }
                genres
                studios { nodes { name } }
            }
        }`.trim();

        const res = await this.makeGraphQLRequest(query, JSON.stringify({ id }));
        const media = JSON.parse(res.body).data.Media;

        const anime = {
            imageUrl: media?.coverImage?.extraLarge || "",
            description: this.cleanDescription(media?.description),
            status: this.mapStatus(media?.status)
        };

        const tags = media?.tags?.map(t => t.name) || [];
        const genres = media?.genres || [];
        anime.genre = [...new Set([...tags, ...genres])].sort();

        const studios = media?.studios?.nodes?.map(s => s.name) || [];
        anime.author = studios.join(", ");

        // Episodes
        const mapRes = await this.client.get(`${MAPPING_URL}${id}`);
        const kitsuId = JSON.parse(mapRes.body)?.mappings?.kitsu_id;

        if (!kitsuId) {
            anime.episodes = [];
            return anime;
        }

        const epiRes = await this.client.get(`${KITSU_META_URL}${kitsuId}.json`);
        const meta = JSON.parse(epiRes.body).meta;

        if (meta?.type === "movie") {
            anime.episodes = [{
                url: `/stream/movie/${meta.kitsuId}.json`,
                name: "Movie"
            }];
            return anime;
        }

        const now = Date.now();

        anime.episodes = (meta?.videos || [])
            .filter(v => v.thumbnail && (!v.released || new Date(v.released).getTime() < now))
            .map(v => ({
                url: `/stream/series/${v.id}.json`,
                dateUpload: (v.released ? new Date(v.released) : new Date()).getTime().toString(),
                name: `Episode ${v.episode}: ${(v.title || "").replace(/^Episode\s*\d*\s*/i, "").trim()}`
            }))
            .reverse();

        return anime;
    }

    // ======================
    // Video List
    // ======================

    appendQueryParam(key, values) {
        if (!values || values.length === 0) return "";
        const filtered = [...values].filter(v => v.trim()).join(",");
        return filtered ? `${key}=${filtered}|` : "";
    }

    async getVideoList(url) {
        let mainURL = `${this.source.baseUrl}/`;
        mainURL += this.appendQueryParam("providers", this.prefs.get("provider_selection"));
        mainURL += this.appendQueryParam("language", this.prefs.get("lang_selection"));
        mainURL += this.appendQueryParam("qualityfilter", this.prefs.get("quality_selection"));
        mainURL += this.appendQueryParam("sort", new Set([this.prefs.get("sorting_link")]));
        mainURL += url;
        mainURL = mainURL.replace(/\|$/, "");

        console.log("===== Torrentio Request URL =====");
        console.log(mainURL);

        const res = await this.client.get(mainURL);

        console.log("===== Raw Response =====");
        console.log(res.body);

        const data = JSON.parse(res.body);
        const streams = data.streams || [];

        console.log("===== Streams =====");
        streams.forEach((s, i) => {
            console.log(`Stream ${i}:`, s);
        });

        const trackers = [
            "udp://tracker.openbittorrent.com:6969/announce",
            "udp://tracker.opentrackr.org:1337/announce"
        ];

        let videos = this.sortVideos(streams.map(s => {
            const magnet = `magnet:?xt=urn:btih:${s.infoHash}&tr=${trackers.join("&tr=")}&index=${s.fileIdx}`;

            const video = {
                url: magnet,
                originalUrl: magnet,
                quality: `${s.name || ""}\n${s.title || ""}`.trim()
            };

            console.log("Video enviado a Dart:", video);

            return video;
        }));

        const limit = this.prefs.get("number_of_links");
        return limit === "all" ? videos : videos.slice(0, parseInt(limit));
    }

    sortVideos(videos) {
        const dub = this.prefs.get("dubbed");
        const efficient = this.prefs.get("efficient");

        return videos.sort((a, b) => {
            const isDubA = dub && !a.quality.toLowerCase().includes("dubbed");
            const isDubB = dub && !b.quality.toLowerCase().includes("dubbed");

            const isEffA = efficient && !/(hevc|265|av1)/i.test(a.quality);
            const isEffB = efficient && !/(hevc|265|av1)/i.test(b.quality);

            return (isDubA - isDubB) || (isEffA - isEffB);
        });
    }

        getSourcePreferences() {
        return [
            {
                "key": "number_of_links",
                "listPreference": {
                    "title": "Number of links to load for video list",
                    "summary": "⚠️ Increasing the number of links will increase the loading time of the video list",
                    "valueIndex": 1,
                    "entries": [
                        "2",
                        "4",
                        "8",
                        "12",
                        "all"],
                    "entryValues": [
                        "2",
                        "4",
                        "8",
                        "12",
                        "all"],
                }
            },
            {
                "key": "provider_selection",
                "multiSelectListPreference": {
                    "title": "Enable/Disable Providers",
                    "summary": "",
                    "entries": [
                        "YTS",
                        "EZTV",
                        "RARBG",
                        "1337x",
                        "ThePirateBay",
                        "KickassTorrents",
                        "TorrentGalaxy",
                        "MagnetDL",
                        "HorribleSubs",
                        "NyaaSi",
                        "TokyoTosho",
                        "AniDex",
                        "🇷🇺 Rutor",
                        "🇷🇺 Rutracker",
                        "🇵🇹 Comando",
                        "🇵🇹 BluDV",
                        "🇫🇷 Torrent9",
                        "🇪🇸 MejorTorrent",
                        "🇲🇽 Cinecalidad"],
                    "entryValues": [
                        "yts",
                        "eztv",
                        "rarbg",
                        "1337x",
                        "thepiratebay",
                        "kickasstorrents",
                        "torrentgalaxy",
                        "magnetdl",
                        "horriblesubs",
                        "nyaasi",
                        "tokyotosho",
                        "anidex",
                        "rutor",
                        "rutracker",
                        "comando",
                        "bludv",
                        "torrent9",
                        "mejortorrent",
                        "cinecalidad"],
                    "values": [
                        "nyaasi",]
                }
            },
            {
                "key": "quality_selection",
                "multiSelectListPreference": {
                    "title": "Exclude Qualities/Resolutions",
                    "summary": "",
                    "entries": [
                        "BluRay REMUX",
                        "HDR/HDR10+/Dolby Vision",
                        "Dolby Vision",
                        "4k",
                        "1080p",
                        "720p",
                        "480p",
                        "Other (DVDRip/HDRip/BDRip...)",
                        "Screener",
                        "Cam",
                        "Unknown"],
                    "entryValues": [
                        "brremux",
                        "hdrall",
                        "dolbyvision",
                        "4k",
                        "1080p",
                        "720p",
                        "480p",
                        "other",
                        "scr",
                        "cam",
                        "unknown"],
                    "values": [
                        "720p",
                        "480p",
                        "other",
                        "scr",
                        "cam",
                        "unknown"]
                }
            },
            {
                "key": "lang_selection",
                "multiSelectListPreference": {
                    "title": "Priority foreign language",
                    "summary": "",
                    "entries": [
                        "🇯🇵 Japanese",
                        "🇷🇺 Russian",
                        "🇮🇹 Italian",
                        "🇵🇹 Portuguese",
                        "🇪🇸 Spanish",
                        "🇲🇽 Latino",
                        "🇰🇷 Korean",
                        "🇨🇳 Chinese",
                        "🇹🇼 Taiwanese",
                        "🇫🇷 French",
                        "🇩🇪 German",
                        "🇳🇱 Dutch",
                        "🇮🇳 Hindi",
                        "🇮🇳 Telugu",
                        "🇮🇳 Tamil",
                        "🇵🇱 Polish",
                        "🇱🇹 Lithuanian",
                        "🇱🇻 Latvian",
                        "🇪🇪 Estonian",
                        "🇨🇿 Czech",
                        "🇸🇰 Slovakian",
                        "🇸🇮 Slovenian",
                        "🇭🇺 Hungarian",
                        "🇷🇴 Romanian",
                        "🇧🇬 Bulgarian",
                        "🇷🇸 Serbian",
                        "🇭🇷 Croatian",
                        "🇺🇦 Ukrainian",
                        "🇬🇷 Greek",
                        "🇩🇰 Danish",
                        "🇫🇮 Finnish",
                        "🇸🇪 Swedish",
                        "🇳🇴 Norwegian",
                        "🇹🇷 Turkish",
                        "🇸🇦 Arabic",
                        "🇮🇷 Persian",
                        "🇮🇱 Hebrew",
                        "🇻🇳 Vietnamese",
                        "🇮🇩 Indonesian",
                        "🇲🇾 Malay",
                        "🇹🇭 Thai",],
                    "entryValues": [
                        "japanese",
                        "russian",
                        "italian",
                        "portuguese",
                        "spanish",
                        "latino",
                        "korean",
                        "chinese",
                        "taiwanese",
                        "french",
                        "german",
                        "dutch",
                        "hindi",
                        "telugu",
                        "tamil",
                        "polish",
                        "lithuanian",
                        "latvian",
                        "estonian",
                        "czech",
                        "slovakian",
                        "slovenian",
                        "hungarian",
                        "romanian",
                        "bulgarian",
                        "serbian",
                        "croatian",
                        "ukrainian",
                        "greek",
                        "danish",
                        "finnish",
                        "swedish",
                        "norwegian",
                        "turkish",
                        "arabic",
                        "persian",
                        "hebrew",
                        "vietnamese",
                        "indonesian",
                        "malay",
                        "thai"],
                    "values": []
                }
            },
            {
                "key": "sorting_link",
                "listPreference": {
                    "title": "Sorting",
                    "summary": "",
                    "valueIndex": 0,
                    "entries": [
                        "By quality then seeders",
                        "By quality then size",
                        "By seeders",
                        "By size"],
                    "entryValues": [
                        "quality",
                        "qualitysize",
                        "seeders",
                        "size"],
                }
            },
            {
                "key": "pref_title",
                "listPreference": {
                    "title": "Preferred Title",
                    "summary": "",
                    "valueIndex": 0,
                    "entries": [
                        "Romaji",
                        "English",
                        "Native"],
                    "entryValues": [
                        "romaji",
                        "english",
                        "native"],
                }
            },
            {
                "key": "dubbed",
                "switchPreferenceCompat": {
                    "title": "Dubbed Video Priority",
                    "summary": "",
                    "value": false
                }
            },
            {
                "key": "efficient",
                "switchPreferenceCompat": {
                    "title": "Efficient Video Priority",
                    "summary": "Codec: (HEVC / x265)  & AV1. High-quality video with less data usage.",
                    "value": false
                }
            }
        ];
    }
}
