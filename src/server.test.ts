import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { parseResults, app } from "./server.ts";

// --- HTML Fixtures (from actual OPAC responses) ---

const RESULTS_HTML = `
<p class="info">Gesucht wurde mit: "Freie Suche = Harry Potter" in Neuperlach, Treffer:  1-22 von 80</p>
<ul class="rList">
<li class="rList_li rList_even rList_cover_active rList_cover_right" data-ajax="AK04640054"><div class="rList_cover"><div class="rList_col rList_img"><img data-err="/aDISWeb/images/placeholder.gif" class="img-delayed" alt="" title="" src="https://ssl.muenchen.de/vlb/cover/9783551559258/s"></div></div><div class="rList_grid_wrapper"><div class="rList_grid"><div class="rList_col rList_num" style="width: 06%">1</div><div class="rList_col rList_availability" style="width: 06%"><span><img class="icon" src="/aDISWeb_kopac86/img/icons/availability-green.svg?v=cd0bfd220260326" alt="Verfügbar" title="Verfügbar"></span></div><div class="rList_col rList_titel" style="width: 70%"><a href="#" id="idfn17">Harry Potter und der Feuerkelch</a></div><div class="rList_col rList_jahr" style="width: 18%">2025</div></div><div class="rList_grid"><div class="rList_col rList_medium" style="width: 12%"><img class="icon" src="/aDISWeb_kopac86/img/medien/buch.svg?v=cd0bfd220260326" alt="Band" title="Band"></div><div class="rList_col rList_name" style="width: 70%">J. K. Rowling ; illustriert von George Caltsoudas ; aus dem Englischen von Klaus Fritz. - 1. Auflage. - Carlsen</div><div class="rList_col rList_sig" style="width: 18%">u ROW</div></div></div></li>
<li class="rList_li rList_odd rList_cover_active rList_cover_right" data-ajax="AK04640046"><div class="rList_cover"><div class="rList_col rList_img"><img data-err="/aDISWeb/images/placeholder.gif" class="img-delayed" alt="" title="" src="https://ssl.muenchen.de/vlb/cover/9783551559241/s"></div></div><div class="rList_grid_wrapper"><div class="rList_grid"><div class="rList_col rList_num" style="width: 06%">2</div><div class="rList_col rList_availability" style="width: 06%"><span><img class="icon" src="/aDISWeb_kopac86/img/icons/availability-no-red.svg?v=cd0bfd220260326" alt="Zurzeit nicht verfügbar" title="Zurzeit nicht verfügbar"></span></div><div class="rList_col rList_titel" style="width: 70%"><a href="#" id="idfn18">Harry Potter und der Gefangene von Askaban</a></div><div class="rList_col rList_jahr" style="width: 18%">2025</div></div><div class="rList_grid"><div class="rList_col rList_medium" style="width: 12%"><img class="icon" src="/aDISWeb_kopac86/img/medien/buch.svg?v=cd0bfd220260326" alt="Band" title="Band"></div><div class="rList_col rList_name" style="width: 70%">J. K. Rowling ; illustriert von George Caltsoudas ; aus dem Englischen von Klaus Fritz. - 1. Auflage. - Carlsen</div><div class="rList_col rList_sig" style="width: 18%">u ROW</div></div></div></li>
<li class="rList_li rList_even rList_cover_active rList_cover_right" data-ajax="AK04640076"><div class="rList_cover"><div class="rList_col rList_img"><img data-err="/aDISWeb/images/placeholder.gif" class="img-delayed" alt="" title="" src="https://ssl.muenchen.de/vlb/cover/9783551559272/s"></div></div><div class="rList_grid_wrapper"><div class="rList_grid"><div class="rList_col rList_num" style="width: 06%">3</div><div class="rList_col rList_availability" style="width: 06%"><span><img class="icon" src="/aDISWeb_kopac86/img/icons/availability-no-red.svg?v=cd0bfd220260326" alt="Zurzeit nicht verfügbar" title="Zurzeit nicht verfügbar"></span></div><div class="rList_col rList_titel" style="width: 70%"><a href="#" id="idfn19">Harry Potter und der Halbblutprinz</a></div><div class="rList_col rList_jahr" style="width: 18%">2025</div></div><div class="rList_grid"><div class="rList_col rList_medium" style="width: 12%"><img class="icon" src="/aDISWeb_kopac86/img/medien/buch.svg?v=cd0bfd220260326" alt="Band" title="Band"></div><div class="rList_col rList_name" style="width: 70%">J. K. Rowling ; illustriert von George Caltsoudas ; aus dem Englischen von Klaus Fritz. - 1. Auflage. - Carlsen</div><div class="rList_col rList_sig" style="width: 18%">u ROW</div></div></div></li>
<li class="rList_li rList_odd rList_cover_active rList_cover_right" data-ajax="AK04640099"><div class="rList_cover"><div class="rList_col rList_img"><img data-err="/aDISWeb/images/placeholder.gif" class="img-delayed" alt="" title="" src="https://ssl.muenchen.de/vlb/cover/9783551559999/s"></div></div><div class="rList_grid_wrapper"><div class="rList_grid"><div class="rList_col rList_num" style="width: 06%">4</div><div class="rList_col rList_availability" style="width: 06%"><span><img class="icon" src="/aDISWeb_kopac86/img/icons/availability-yellow.svg?v=cd0bfd220260326" alt="Bestellt" title="Bestellt"></span></div><div class="rList_col rList_titel" style="width: 70%"><a href="#" id="idfn20">Harry Potter und die Kammer des Schreckens</a></div><div class="rList_col rList_jahr" style="width: 18%">2025</div></div><div class="rList_grid"><div class="rList_col rList_medium" style="width: 12%"><img class="icon" src="/aDISWeb_kopac86/img/medien/buch.svg?v=cd0bfd220260326" alt="Band" title="Band"></div><div class="rList_col rList_name" style="width: 70%">J. K. Rowling ; illustriert von George Caltsoudas ; aus dem Englischen von Klaus Fritz. - 1. Auflage. - Carlsen</div><div class="rList_col rList_sig" style="width: 18%">u ROW</div></div></div></li>
</ul>
`;

const TITLE_WITH_ANGLE_BRACKETS_HTML = `
<p class="info">Treffer:  1-1 von 1</p>
<ul class="rList">
<li class="rList_li rList_even rList_cover_active rList_cover_right" data-ajax="AK04651444"><div class="rList_cover"><div class="rList_col rList_img"><img data-err="/aDISWeb/images/placeholder.gif" class="img-delayed" alt="" title="" src="https://ssl.muenchen.de/vlb/cover/test/s"></div></div><div class="rList_grid_wrapper"><div class="rList_grid"><div class="rList_col rList_num" style="width: 06%">1</div><div class="rList_col rList_availability" style="width: 06%"><span><img class="icon" src="/aDISWeb_kopac86/img/icons/availability-green.svg?v=cd0bfd220260326" alt="Verfügbar" title="Verfügbar"></span></div><div class="rList_col rList_titel" style="width: 70%"><a href="#" id="idfn17">[Desplat, Alexandre <1961->. Filmmusik. Auswahl] Paris - Hollywood</a></div><div class="rList_col rList_jahr" style="width: 18%">2019</div></div><div class="rList_grid"><div class="rList_col rList_medium" style="width: 12%"><img class="icon" src="/aDISWeb_kopac86/img/medien/buch.svg?v=cd0bfd220260326" alt="CD" title="CD"></div><div class="rList_col rList_name" style="width: 70%">Alexandre Desplat</div><div class="rList_col rList_sig" style="width: 18%">CD</div></div></div></li>
</ul>
`;

const EMPTY_HTML = `<html><body><p>Keine Treffer gefunden</p></body></html>`;

// --- Unit Tests for parseResults ---

describe("parseResults", () => {
  it("extracts totalHits from results HTML", () => {
    const result = parseResults(RESULTS_HTML);
    assert.equal(result.totalHits, 80);
  });

  it("extracts all result items", () => {
    const result = parseResults(RESULTS_HTML);
    assert.equal(result.items.length, 4);
  });

  it("extracts id from data-ajax attribute", () => {
    const result = parseResults(RESULTS_HTML);
    assert.equal(result.items[0].id, "AK04640054");
    assert.equal(result.items[1].id, "AK04640046");
    assert.equal(result.items[2].id, "AK04640076");
  });

  it("extracts position as sequential number", () => {
    const result = parseResults(RESULTS_HTML);
    assert.equal(result.items[0].position, 1);
    assert.equal(result.items[1].position, 2);
    assert.equal(result.items[2].position, 3);
  });

  it("extracts title", () => {
    const result = parseResults(RESULTS_HTML);
    assert.equal(result.items[0].title, "Harry Potter und der Feuerkelch");
    assert.equal(
      result.items[1].title,
      "Harry Potter und der Gefangene von Askaban",
    );
    assert.equal(
      result.items[2].title,
      "Harry Potter und der Halbblutprinz",
    );
  });

  it("extracts author", () => {
    const result = parseResults(RESULTS_HTML);
    assert.equal(
      result.items[0].author,
      "J. K. Rowling ; illustriert von George Caltsoudas ; aus dem Englischen von Klaus Fritz. - 1. Auflage. - Carlsen",
    );
  });

  it("extracts year", () => {
    const result = parseResults(RESULTS_HTML);
    assert.equal(result.items[0].year, "2025");
  });

  it("detects available items (green icon)", () => {
    const result = parseResults(RESULTS_HTML);
    assert.equal(result.items[0].available, "available");
  });

  it("detects unavailable items (red icon)", () => {
    const result = parseResults(RESULTS_HTML);
    assert.equal(result.items[1].available, "unavailable");
    assert.equal(result.items[2].available, "unavailable");
  });

  it("detects unknown availability (unrecognized alt text)", () => {
    const result = parseResults(RESULTS_HTML);
    assert.equal(result.items[3].available, "unknown");
  });

  it("extracts media type", () => {
    const result = parseResults(RESULTS_HTML);
    assert.equal(result.items[0].mediaType, "Band");
  });

  it("extracts signature", () => {
    const result = parseResults(RESULTS_HTML);
    assert.equal(result.items[0].signature, "u ROW");
  });

  it("extracts cover URL", () => {
    const result = parseResults(RESULTS_HTML);
    assert.equal(
      result.items[0].coverUrl,
      "https://ssl.muenchen.de/vlb/cover/9783551559258/s",
    );
  });

  it("extracts title containing angle brackets", () => {
    const result = parseResults(TITLE_WITH_ANGLE_BRACKETS_HTML);
    assert.equal(
      result.items[0].title,
      "[Desplat, Alexandre <1961->. Filmmusik. Auswahl] Paris - Hollywood",
    );
  });

  it("returns zero totalHits for empty results", () => {
    const result = parseResults(EMPTY_HTML);
    assert.equal(result.totalHits, 0);
    assert.equal(result.items.length, 0);
  });
});

// --- HTTP Endpoint Tests ---

describe("HTTP server", () => {
  let baseUrl: string;
  let server: Server;

  before(() => {
    return new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(() => {
    return new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("returns 400 when q parameter is missing", async () => {
    const res = await fetch(`${baseUrl}/api/search`);
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "Missing required query parameter: q");
  });

  it("returns 400 when q parameter is empty", async () => {
    const res = await fetch(`${baseUrl}/api/search?q=`);
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "Missing required query parameter: q");
  });

  it("returns 404 for unknown routes", async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "Not found");
  });

});
