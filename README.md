# fast-opac-muc

A fast REST API proxy for the Munich public library system (Münchner Stadtbibliothek).

## Usage

```bash
nvm use
npm start
```

```bash
curl "http://localhost:3000/api/search?q=Harry+Potter&branch=Neuperlach"
```

## API

### `GET /api/search`

| Param    | Required | Description                                |
|----------|----------|--------------------------------------------|
| `q`      | yes      | Search query                               |
| `branch` | no       | Branch name filter (e.g. "Neuperlach")     |

## Development

```bash
npm test
```
