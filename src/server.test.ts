import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { parseResults, app } from "./server.ts";

// --- HTML Fixtures (from actual OPAC responses) ---

const RESULTS_HTML = `
<p class="info">Gesucht wurde mit: "Freie Suche = Harry Potter" in Neuperlach, Treffer:  1-22 von 80</p>
<ul class="rList">
<li class="rList_li rList_li_even rList_cover_active rList_cover_right" data-ajax="AK04640054"><div class="rList_cover"><div style="" class="rList_col rList_img"><img alt="" title="" src="/aDISWeb/assets/placeholder.gif" data-err="/aDISWeb/assets/placeholder.gif" data-src="https://ssl.muenchen.de/vlb/cover/9783551559258/s" class="img-delayed"/></div>	</div>	<div class="rList_grid_wrapper"><div class="rList_grid"><div style="width: 06%;" class="rList_col rList_num">1</div>		<div style="width: 06%;" class="rList_col rList_availability"><span><img class='icon'  src='/aDISWeb_kopac86/img/icons/availability-green.svg' alt='Verf&#0252;gbar' title='Verf&#0252;gbar' /></span></div>		<div style="width: 70%;" class="rList_col rList_titel"><a href="javascript:htmlOnLink('AK04640054')" >Harry Potter und der Feuerkelch</a></div>		<div style="width: 18%;" class="rList_col rList_jahr">2025</div>	</div>	<div class="rList_grid"><div style="width: 12%;" class="rList_col rList_medium"><img class='icon'  src='/aDISWeb_kopac86/img/medien/buch.svg' alt='Band' title='Band' /></div>		<div style="width: 70%;" class="rList_col rList_name">J. K. Rowling ; illustriert von George Caltsoudas ; aus dem Englischen von Klaus Fritz. - 1. Auflage. - Carlsen</div>		<div style="width: 18%;" class="rList_col rList_sig">u ROW</div>	</div>	<div class="rList_grid"><div style="width: 06%;" class="rList_col rList_name">&nbsp;</div></div></div></li>
<li class="rList_li rList_li_odd rList_cover_active rList_cover_right" data-ajax="AK04640046"><div class="rList_cover"><div style="" class="rList_col rList_img"><img alt="" title="" src="/aDISWeb/assets/placeholder.gif" data-err="/aDISWeb/assets/placeholder.gif" data-src="https://ssl.muenchen.de/vlb/cover/9783551559241/s" class="img-delayed"/></div>	</div>	<div class="rList_grid_wrapper"><div class="rList_grid"><div style="width: 06%;" class="rList_col rList_num">2</div>		<div style="width: 06%;" class="rList_col rList_availability"><span><img class='icon'  src='/aDISWeb_kopac86/img/icons/availability-no-red.svg' alt='Zurzeit nicht verf&#0252;gbar' title='Zurzeit nicht verf&#0252;gbar' /></span></div>		<div style="width: 70%;" class="rList_col rList_titel"><a href="javascript:htmlOnLink('AK04640046')" >Harry Potter und der Gefangene von Askaban</a></div>		<div style="width: 18%;" class="rList_col rList_jahr">2025</div>	</div>	<div class="rList_grid"><div style="width: 12%;" class="rList_col rList_medium"><img class='icon'  src='/aDISWeb_kopac86/img/medien/buch.svg' alt='Band' title='Band' /></div>		<div style="width: 70%;" class="rList_col rList_name">J. K. Rowling ; illustriert von George Caltsoudas ; aus dem Englischen von Klaus Fritz. - 1. Auflage. - Carlsen</div>		<div style="width: 18%;" class="rList_col rList_sig">u ROW</div>	</div>	<div class="rList_grid"><div style="width: 06%;" class="rList_col rList_name">&nbsp;</div></div></div></li>
<li class="rList_li rList_li_even rList_cover_active rList_cover_right" data-ajax="AK04640076"><div class="rList_cover"><div style="" class="rList_col rList_img"><img alt="" title="" src="/aDISWeb/assets/placeholder.gif" data-err="/aDISWeb/assets/placeholder.gif" data-src="https://ssl.muenchen.de/vlb/cover/9783551559272/s" class="img-delayed"/></div>	</div>	<div class="rList_grid_wrapper"><div class="rList_grid"><div style="width: 06%;" class="rList_col rList_num">3</div>		<div style="width: 06%;" class="rList_col rList_availability"><span><img class='icon'  src='/aDISWeb_kopac86/img/icons/availability-no-red.svg' alt='Zurzeit nicht verf&#0252;gbar' title='Zurzeit nicht verf&#0252;gbar' /></span></div>		<div style="width: 70%;" class="rList_col rList_titel"><a href="javascript:htmlOnLink('AK04640076')" >Harry Potter und der Halbblutprinz</a></div>		<div style="width: 18%;" class="rList_col rList_jahr">2025</div>	</div>	<div class="rList_grid"><div style="width: 12%;" class="rList_col rList_medium"><img class='icon'  src='/aDISWeb_kopac86/img/medien/buch.svg' alt='Band' title='Band' /></div>		<div style="width: 70%;" class="rList_col rList_name">J. K. Rowling ; illustriert von George Caltsoudas ; aus dem Englischen von Klaus Fritz. - 1. Auflage. - Carlsen</div>		<div style="width: 18%;" class="rList_col rList_sig">u ROW</div>	</div>	<div class="rList_grid"><div style="width: 06%;" class="rList_col rList_name">&nbsp;</div></div></div></li>
<li class="rList_li rList_li_odd rList_cover_active rList_cover_right" data-ajax="AK04640099"><div class="rList_cover"><div style="" class="rList_col rList_img"><img alt="" title="" src="/aDISWeb/assets/placeholder.gif" data-err="/aDISWeb/assets/placeholder.gif" data-src="https://ssl.muenchen.de/vlb/cover/9783551559999/s" class="img-delayed"/></div>	</div>	<div class="rList_grid_wrapper"><div class="rList_grid"><div style="width: 06%;" class="rList_col rList_num">4</div>		<div style="width: 06%;" class="rList_col rList_availability"><span><img class='icon'  src='/aDISWeb_kopac86/img/icons/availability-yellow.svg' alt='Bestellt' title='Bestellt' /></span></div>		<div style="width: 70%;" class="rList_col rList_titel"><a href="javascript:htmlOnLink('AK04640099')" >Harry Potter und die Kammer des Schreckens</a></div>		<div style="width: 18%;" class="rList_col rList_jahr">2025</div>	</div>	<div class="rList_grid"><div style="width: 12%;" class="rList_col rList_medium"><img class='icon'  src='/aDISWeb_kopac86/img/medien/buch.svg' alt='Band' title='Band' /></div>		<div style="width: 70%;" class="rList_col rList_name">J. K. Rowling ; illustriert von George Caltsoudas ; aus dem Englischen von Klaus Fritz. - 1. Auflage. - Carlsen</div>		<div style="width: 18%;" class="rList_col rList_sig">u ROW</div>	</div>	<div class="rList_grid"><div style="width: 06%;" class="rList_col rList_name">&nbsp;</div></div></div></li>
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
