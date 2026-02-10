import 'package:mangayomi/bridge_lib.dart';
import 'dart:convert';

class NHentaiSource extends MProvider {
  NHentaiSource({required this.source});

  MSource source;
  final Client client = Client();

  Map<String, String> get headers => {
    "User-Agent":
        "Mozilla/5.0 (Linux; Android 13; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36",
    "Referer": "${source.baseUrl}/",
    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  };

  @override
  Future<MPages> getPopular(int page) async {
    final url = page <= 1
        ? "${source.baseUrl}/"
        : "${source.baseUrl}/?page=$page";
    final res = await client.get(Uri.parse(url), headers: headers);
    return mangaListFromHtml(parseHtml(res.body));
  }

  @override
  Future<MPages> getLatestUpdates(int page) async {
    return getPopular(page);
  }

  @override
  Future<MPages> search(String query, int page, FilterList filterList) async {
    final url =
        "${source.baseUrl}/search/?q=${Uri.encodeComponent(query)}&page=$page";
    final res = await client.get(Uri.parse(url), headers: headers);
    return mangaListFromHtml(parseHtml(res.body));
  }

  MPages mangaListFromHtml(MDocument doc) {
    List<MManga> mangaList = [];
    final items = doc.select(".gallery");

    for (final el in items) {
      final a = el.selectFirst("a");
      final img = el.selectFirst("img");
      final titleElement = el.selectFirst(
        ".caption",
      ); // CORRECCIÓN 1: Definir el elemento del título

      if (a == null || img == null) continue;

      // CORRECCIÓN 2: Lógica para la URL de la imagen
      final thumbUrl = img.attr("data-src") ?? img.attr("src") ?? "";
      final imageUrl = thumbUrl.startsWith("//") ? "https:$thumbUrl" : thumbUrl;

      MManga manga = MManga();
      manga.name =
          titleElement?.text.trim() ??
          "Doujin"; // CORRECCIÓN 3: Usar titleElement
      manga.imageUrl = imageUrl;
      manga.link = a.getHref;
      mangaList.add(manga);
    }

    final hasNext = doc.selectFirst(".pagination a.next") != null;
    return MPages(mangaList, hasNext);
  }

  @override
  Future<MManga> getDetail(String url) async {
    final id = RegExp(r'/g/(\d+)').firstMatch(url)?.group(1);
    if (id == null) throw "No se pudo obtener el ID";

    final apiUrl = "${source.baseUrl}/api/gallery/$id";
    final res = await client.get(Uri.parse(apiUrl), headers: headers);
    final json = jsonDecode(res.body);

    MManga manga = MManga();
    manga.name =
        json['title']['pretty'] ?? json['title']['english'] ?? "Doujin";

    final mediaId = json['media_id'];
    final coverType = json['images']['cover']['t'] == 'p' ? 'png' : 'jpg';
    manga.imageUrl =
        "https://t3.nhentai.net/galleries/$mediaId/cover.$coverType";

    List<String> tags = [];
    List<String> artists = [];
    for (var tag in json['tags']) {
      if (tag['type'] == 'artist') artists.add(tag['name']);
      if (tag['type'] == 'tag') tags.add(tag['name']);
    }

    manga.author = artists.join(", ");
    manga.genre = tags;
    manga.status = MStatus.completed;

    // --- SOLUCIÓN DEFINITIVA AL ERROR DE CAST ---
    // 1. Creamos el objeto capítulo
    MChapter chapter = MChapter();
    chapter.name = "Gallery";
    chapter.url = url;

    // 2. CREAMOS UNA LISTA EXPLÍCITA DE MCHAPTER (Esto es lo más importante)
    List<MChapter> chaptersList = [];
    chaptersList.add(chapter);

    // 3. Asignamos la lista ya tipada
    manga.chapters = chaptersList;
    // ---------------------------------------------

    return manga;
  }

  @override
  Future<List<String>> getPageList(String url) async {
    final id = RegExp(r'/g/(\d+)').firstMatch(url)?.group(1);
    final apiUrl = "${source.baseUrl}/api/gallery/$id";
    final res = await client.get(Uri.parse(apiUrl), headers: headers);
    final json = jsonDecode(res.body);

    final mediaId = json['media_id'];
    final List pagesData = json['images']['pages'];
    List<String> pages = [];

    for (int i = 0; i < pagesData.length; i++) {
      final type = pagesData[i]['t'];
      String ext = 'jpg';
      if (type == 'p') ext = 'png';
      if (type == 'w') ext = 'webp';

      pages.add("https://i.nhentai.net/galleries/$mediaId/${i + 1}.$ext");
    }

    return pages;
  }

  @override
  List<dynamic> getFilterList() => [];
  @override
  List<dynamic> getSourcePreferences() => [];
}

NHentaiSource main(MSource source) {
  return NHentaiSource(source: source);
}
