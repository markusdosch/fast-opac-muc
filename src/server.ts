import express, { type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
  available: "available" | "unavailable" | "unknown";
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

    const titleMatch = block.match(/rList_titel">\s*<a[^>]*>([\s\S]+?)<\/a>/);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const authorMatch = block.match(
      /rList_medium[\s\S]*?rList_name">\s*([\s\S]*?)\s*<\/div>/,
    );
    const author = authorMatch ? authorMatch[1].trim() : "";

    const yearMatch = block.match(/rList_jahr">\s*(\d{4})\s*<\/div>/);
    const year = yearMatch ? yearMatch[1] : "";

    const availMatch = block.match(/rList_availability[\s\S]*?alt='([^']+)'/);
    const availText = availMatch ? decodeHtmlEntities(availMatch[1]) : "";
    const available: SearchResult["available"] =
      availText === "Verfügbar" ? "available"
      : availText === "Zurzeit nicht verfügbar" ? "unavailable"
      : "unknown";

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

// --- Express App ---

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/search", async (req, res) => {
  const q = req.query["q"];

  if (!q || typeof q !== "string") {
    res.status(400).json({ error: "Missing required query parameter: q" });
    return;
  }

  const branch = typeof req.query["branch"] === "string" ? req.query["branch"] : undefined;
  const availableOnly = req.query["available"] === "true";

  try {
    const data = await visitLandingPage();
    let { results, pageData, hasNextPage } = await doSearch(data, q, branch);

    if (availableOnly) {
      results.items = results.items.filter((item) => item.available !== "unavailable");
      while (results.items.length < 22 && hasNextPage) {
        const next = await doSearch(pageData, q, branch, {
          "$Toolbar$0_3.x": "29",
          "$Toolbar$0_3.y": "28",
        });
        results.items.push(...next.results.items.filter((item) => item.available !== "unavailable"));
        pageData = next.pageData;
        hasNextPage = next.hasNextPage;
      }
      if (results.items.length < 22) {
        results.totalHits = results.items.length;
      }
    }

    const jsessionid = pageData.formAction.match(/jsessionid=([A-F0-9]+)/)![1];

    for (const item of results.items) {
      if (item.coverUrl.startsWith(`${OPAC_BASE}/`)) {
        item.coverUrl =
          "/coverproxy/" + item.coverUrl.slice(OPAC_BASE.length + 1);
      }
    }

    res.cookie("jsessionid", jsessionid, {
      httpOnly: true,
      sameSite: "strict",
      path: "/coverproxy",
    });
    res.json(results);
  } catch {
    res.status(502).json({
      error: "Failed to fetch results from library system",
    });
  }
});

app.get("/coverproxy/*path", async (req, res) => {
  try {
    const rest = req.path.replace(/^\/coverproxy\//, "");

    if (!rest) {
      res.status(400).json({ error: "Missing image path" });
      return;
    }

    const cookieHeader = req.headers["cookie"] ?? "";
    const jsessionid = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("jsessionid="))
      ?.slice("jsessionid=".length);

    if (!jsessionid) {
      res.status(400).json({
        error: "Missing required cookie: jsessionid",
      });
      return;
    }

    const referer = `${OPAC_BASE}/aDISWeb/app;jsessionid=${jsessionid}`;

    const upstream = await fetch(`${OPAC_BASE}/${rest}`, {
      headers: { Referer: referer },
    });

    if (!upstream.ok) {
      res.status(upstream.status).end();
      return;
    }

    const contentType =
      upstream.headers.get("Content-Type") ?? "application/octet-stream";

    res.set({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    });

    const body = await upstream.arrayBuffer();
    res.send(Buffer.from(body));
  } catch {
    res.status(502).end();
  }
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

const isMainModule =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}
