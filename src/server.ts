import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";

const OPAC_BASE = "https://ssl.muenchen.de";
const OPAC_HOME = `${OPAC_BASE}/aDISWeb/app?service=direct/0/Home/$DirectLink&sp=SOPAC`;

// --- Types ---

interface PageData {
  cookies: string[];
  formAction: string;
  formInputValues: Record<string, string>;
}

interface SearchResult {
  id: string;
  position: number;
  title: string;
  author: string;
  year: string;
  available: boolean;
  mediaType: string;
  signature: string;
  coverUrl: string;
}

interface SearchResponse {
  totalHits: number;
  items: SearchResult[];
}

// --- OPAC Client ---

function extractPageData(html: string, cookies: string[]): PageData {
  const formMatch = html.match(
    /<form\s+method="post"\s+name="Form0"\s+action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/,
  );
  if (!formMatch) {
    throw new Error("Could not extract form from OPAC HTML");
  }

  const formAction = formMatch[1];
  const formBody = formMatch[2];

  const formInputValues: Record<string, string> = {};
  const inputRegex =
    /<input\s+type="hidden"\s+name="([^"]+)"(?:\s+value="([^"]*)")?[^>]*>/g;
  let inputMatch;
  while ((inputMatch = inputRegex.exec(formBody)) !== null) {
    formInputValues[inputMatch[1]] = inputMatch[2] ?? "";
  }

  return { cookies, formAction, formInputValues };
}

async function visitLandingPage(): Promise<PageData> {
  const response = await fetch(OPAC_HOME, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to load OPAC home: ${response.status}`);
  }

  const cookies: string[] = [];
  const setCookieHeaders = response.headers.getSetCookie();
  for (const cookie of setCookieHeaders) {
    const part = cookie.split(";")[0];
    if (part) cookies.push(part);
  }

  const html = await response.text();
  return extractPageData(html, cookies);
}

async function doSearch(
  data: PageData,
  query: string,
  branch?: string,
  extraParams?: Record<string, string>,
): Promise<{ results: SearchResponse; pageData: PageData; hasNextPage: boolean }> {
  const url = `${OPAC_BASE}${data.formAction}`;

  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(data.formInputValues)) {
    params.set(name, value);
  }
  params.set("$Autosuggest", query);
  params.set("select", branch ?? "Bitte auswählen");
  if (extraParams) {
    for (const [name, value] of Object.entries(extraParams)) {
      params.set(name, value);
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (data.cookies.length > 0) {
    headers["Cookie"] = data.cookies.join("; ");
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: params.toString(),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`OPAC search failed: ${response.status}`);
  }

  const html = await response.text();
  const nextBtnMatch = html.match(/<input\s[^>]*name="\$Toolbar\$0_3"[^>]*>/);
  const hasNextPage = nextBtnMatch ? !/\bdisabled\b/.test(nextBtnMatch[0]) : false;
  return {
    results: parseResults(html),
    pageData: extractPageData(html, data.cookies),
    hasNextPage,
  };
}

export function parseResults(html: string): SearchResponse {
  const totalMatch = html.match(/Treffer:\s*\d+-\s*\d+\s+von\s+(\d+)/);
  const totalHits = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  const items: SearchResult[] = [];

  const liRegex =
    /<li class="rList_li[^"]*"[^>]*data-ajax="([^"]+)">([\s\S]*?)<\/li>/g;
  let liMatch: RegExpExecArray | null;
  let position = 0;

  while ((liMatch = liRegex.exec(html)) !== null) {
    position++;
    const id = liMatch[1];
    const block = liMatch[2];

    const titleMatch = block.match(/rList_titel">\s*<a[^>]*>([^<]+)<\/a>/);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const authorMatch = block.match(
      /rList_medium[\s\S]*?rList_name">\s*([\s\S]*?)\s*<\/div>/,
    );
    const author = authorMatch ? authorMatch[1].trim() : "";

    const yearMatch = block.match(/rList_jahr">\s*(\d{4})\s*<\/div>/);
    const year = yearMatch ? yearMatch[1] : "";

    const availMatch = block.match(/rList_availability[\s\S]*?alt='([^']+)'/);
    const available = availMatch
      ? !availMatch[1].toLowerCase().includes("nicht")
      : false;

    const mediaMatch = block.match(/rList_medium[\s\S]*?alt='([^']+)'/);
    const mediaType = mediaMatch ? decodeHtmlEntities(mediaMatch[1]) : "";

    const sigMatch = block.match(/rList_sig">\s*([\s\S]*?)\s*<\/div>/);
    const signature = sigMatch ? sigMatch[1].trim() : "";

    const coverMatch = block.match(/data-src="([^"]+)"/);
    const coverUrl = coverMatch ? coverMatch[1] : "";

    items.push({
      id,
      position,
      title: decodeHtmlEntities(title),
      author: decodeHtmlEntities(author),
      year,
      available,
      mediaType,
      signature: decodeHtmlEntities(signature),
      coverUrl,
    });
  }

  return { totalHits, items };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(parseInt(code, 10)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß");
}

// --- Cover Proxy ---

async function handleCoverProxy(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const rest = url.pathname.replace(/^\/coverproxy\//, "");

  if (!rest) {
    sendJson(res, 400, { error: "Missing image path" });
    return;
  }

  const jsessionid = url.searchParams.get("jsessionid");
  if (!jsessionid) {
    sendJson(res, 400, {
      error: "Missing required query parameter: jsessionid",
    });
    return;
  }

  const referer = `${OPAC_BASE}/aDISWeb/app;jsessionid=${jsessionid}`;

  const upstream = await fetch(`${OPAC_BASE}/${rest}`, {
    headers: { Referer: referer },
  });

  if (!upstream.ok) {
    res.writeHead(upstream.status);
    res.end();
    return;
  }

  const contentType =
    upstream.headers.get("Content-Type") ?? "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
  });

  const body = await upstream.arrayBuffer();
  res.end(Buffer.from(body));
}

// --- HTTP Server ---

function sendJson(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handleIndex(res: ServerResponse): Promise<void> {
  try {
    const htmlPath = new URL("index.html", import.meta.url);
    const html = await readFile(htmlPath, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch {
    sendJson(res, 500, { error: "Failed to read index.html" });
  }
}

async function handleSearch(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const q = url.searchParams.get("q");

  if (!q) {
    sendJson(res, 400, { error: "Missing required query parameter: q" });
    return;
  }

  const branch = url.searchParams.get("branch") ?? undefined;
  const availableOnly = url.searchParams.get("available") === "true";

  try {
    const data = await visitLandingPage();
    let { results, pageData, hasNextPage } = await doSearch(data, q, branch);

    if (availableOnly) {
      results.items = results.items.filter((item) => item.available);
      while (results.items.length < 22 && hasNextPage) {
        const next = await doSearch(pageData, q, branch, {
          "$Toolbar$0_3.x": "29",
          "$Toolbar$0_3.y": "28",
        });
        results.items.push(...next.results.items.filter((item) => item.available));
        pageData = next.pageData;
        hasNextPage = next.hasNextPage;
      }
      // totalHits reflects the OPAC's unfiltered count; cap it to the actual
      // number of available items we collected, so the UI doesn't overstate results.
      if (results.items.length < 22) {
        results.totalHits = results.items.length;
      }
    }

    for (const item of results.items) {
      if (item.coverUrl.startsWith(`${OPAC_BASE}/`)) {
        item.coverUrl =
          "/coverproxy/" +
          item.coverUrl.slice(OPAC_BASE.length + 1) +
          "?jsessionid=" +
          pageData.formAction.match(/jsessionid=([A-F0-9]+)/)![1];
      }
    }
    sendJson(res, 200, results as unknown as Record<string, unknown>);
  } catch {
    sendJson(res, 502, {
      error: "Failed to fetch results from library system",
    });
  }
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/") {
    handleIndex(res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/search") {
    handleSearch(req, res).catch(() => {
      sendJson(res, 502, {
        error: "Failed to fetch results from library system",
      });
    });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/coverproxy/")) {
    handleCoverProxy(req, res).catch(() => {
      res.writeHead(502);
      res.end();
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

export const server = createServer(handleRequest);

const isMainModule =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}
