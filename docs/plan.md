# Plan: Munich Library Search REST API

## Context

The Munich public library (Münchner Stadtbibliothek) at `ssl.muenchen.de` has a slow, clunky web interface. We're building a lightweight REST API proxy that talks to their OPAC (aDIS/BMS system) behind the scenes and exposes search results as clean JSON.

The OPAC uses server-side sessions with `jsessionid` in URLs and Apache Tapestry's form-based navigation, where component IDs change on every page load. Our API must manage this session dance transparently.

## API Design

**Single endpoint:**

```
GET /api/search?q=Harry+Potter&branch=Neuperlach
```

- `q` (required) — search query
- `branch` (optional) — branch name filter (e.g. "Neuperlach", "Giesing"). Omit for all branches.

**Response:**

```json
{
  "totalHits": 80,
  "items": [
    {
      "id": "AK04640054",
      "position": 1,
      "title": "Harry Potter und der Feuerkelch",
      "author": "J. K. Rowling ; illustriert von George Caltsoudas ; aus dem Englischen von Klaus Fritz. - 1. Auflage. - Carlsen",
      "year": "2025",
      "available": true,
      "mediaType": "Band",
      "signature": "u ROW",
      "coverUrl": "https://ssl.muenchen.de/vlb/cover/9783551559258/s"
    }
  ]
}
```

**Error cases:**
- Missing `q` → `400 {"error": "Missing required query parameter: q"}`
- Upstream failure → `502 {"error": "Failed to fetch results from library system"}`

## Implementation — Single file: `src/server.ts`

### 1. OPAC Client (functions within server.ts)

**`startSession()`** — GET the OPAC home page, extract:
- `jsessionid` from the `<form action="...;jsessionid=XXX">` in the response HTML
- The Tapestry `service` value from the hidden form field
- The `Form0` field list from the hidden input
- Cookies from `set-cookie` headers

**`search(session, query, branch?)`** — POST the search form:
- URL: `/aDISWeb/app;jsessionid={id}`
- Body: `service`, `$Autosuggest=query`, `select=branch`, `textButton=Suchen`, plus required Tapestry fields
- Forward cookies from session
- Parse HTML response to extract results

**`parseResults(html)`** — Regex-based HTML parsing (no DOM library):
- Extract total hits from `Treffer: X-Y von Z`
- Extract each `<li>` result item with: id, title, author, year, availability, media type, signature, cover URL
- Uses regex patterns on the structured HTML

### 2. HTTP Server

- `node:http` server on port `3000` (configurable via `PORT` env var)
- Route: `GET /api/search` — validates params, calls OPAC client, returns JSON
- Error handling: 400 for missing query, 502 for upstream errors
- CORS headers for future web app use

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/server.ts` | Create — HTTP server + OPAC client |
| `src/server.test.ts` | Create — Tests using Node.js test runner |
| `docs/plan.md` | Create — This plan document |

## Test Strategy (`src/server.test.ts`)

Using `node:test` + `node:assert`:

1. **Unit tests for HTML parsing** — feed sample HTML fragments (from HAR) into `parseResults()` and verify extracted data
2. **HTTP endpoint tests** — start the server, verify JSON response structure
3. **Input validation tests** — missing `q` param returns 400, etc.

## TODOs

- [ ] Read HAR file for exact HTML structure samples
- [ ] Create `src/server.ts` with OPAC client and HTTP server
- [ ] Create `src/server.test.ts` with tests
- [ ] Run tests and verify

## Verification

```bash
npm test
npm start
curl "http://localhost:3000/api/search?q=Harry+Potter&branch=Neuperlach"
```
