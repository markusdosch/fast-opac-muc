import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const OPAC_BASE = "https://ssl.muenchen.de";
const OPAC_HOME = `${OPAC_BASE}/aDISWeb/app?service=direct/0/Home/$DirectLink&sp=SOPAC`;

// --- Types ---

interface Session {
  jsessionid: string;
  service: string;
  form0: string;
  cookies: string[];
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

async function startSession(): Promise<Session> {
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

  const jsessionidMatch = html.match(/jsessionid=([A-F0-9]+)/);
  if (!jsessionidMatch) {
    throw new Error("Could not extract jsessionid from OPAC home page");
  }

  const serviceMatch = html.match(/name="service"\s+value="([^"]+)"/);
  if (!serviceMatch) {
    throw new Error("Could not extract service value from OPAC home page");
  }

  const form0Match = html.match(/name="Form0"\s+value="([^"]+)"/);
  if (!form0Match) {
    throw new Error("Could not extract Form0 value from OPAC home page");
  }

  return {
    jsessionid: jsessionidMatch[1],
    service: serviceMatch[1],
    form0: form0Match[1],
    cookies,
  };
}

async function search(
  session: Session,
  query: string,
  branch?: string,
): Promise<SearchResponse> {
  const url = `${OPAC_BASE}/aDISWeb/app;jsessionid=${session.jsessionid}`;

  const params = new URLSearchParams();
  params.set("service", session.service);
  params.set("sp", "S0");
  params.set("Form0", session.form0);
  params.set("focus", "$$GFBO_1");
  params.set("keyCode", "82");
  params.set("stz", "");
  params.set("source", "");
  params.set("selected", "");
  params.set("requestCount", "0");
  params.set("scriptEnabled", "true");
  params.set("scrollPos", "0");
  params.set("scrDim", "1680;1050");
  params.set("winDim", "965;938");
  params.set("imgDim", "");
  params.set("$FormConditional", "T");
  params.set("$FormConditional$0", "T");
  params.set("SUO1_AUTHFU_1_hidden", "");
  params.set("$Autosuggest", query);
  params.set("select", branch ?? "Bitte auswählen");
  params.set("textButton", "Suchen");

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (session.cookies.length > 0) {
    headers["Cookie"] = session.cookies.join("; ");
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
  return parseResults(html);
}

export function parseResults(html: string): SearchResponse {
  const totalMatch = html.match(/Treffer:\s*\d+-\d+\s+von\s+(\d+)/);
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

    const availMatch = block.match(
      /rList_availability[\s\S]*?alt='([^']+)'/,
    );
    const available = availMatch
      ? !availMatch[1].toLowerCase().includes("nicht")
      : false;

    const mediaMatch = block.match(
      /rList_medium[\s\S]*?alt='([^']+)'/,
    );
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

// --- HTTP Server ---

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  setCorsHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
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

  try {
    const session = await startSession();
    const results = await search(session, q, branch);
    sendJson(res, 200, results as unknown as Record<string, unknown>);
  } catch {
    sendJson(res, 502, {
      error: "Failed to fetch results from library system",
    });
  }
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
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

  sendJson(res, 404, { error: "Not found" });
}

export const server = createServer(handleRequest);

const isMainModule =
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}
