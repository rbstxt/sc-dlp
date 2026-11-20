# sc-dlp

[![npm version](https://img.shields.io/npm/v/sc-dlp.svg)](https://www.npmjs.com/package/sc-dlp)
[![license](https://img.shields.io/npm/l/sc-dlp.svg)](https://github.com/rbstxt/sc-dlp/blob/main/LICENSE)

A high-performance CLI and Node.js library for downloading Scratch and TurboWarp projects. Supports projects from Scratch 1.4 (`sb`), 2.0 (`sb2`), 3.0 (`sb3`), and TurboWarp Share (`sha256`).

`sc-dlp` is a fork of [forkphorus/sb-downloader](https://github.com/forkphorus/sb-downloader), redesigned for robust project archival, analysis, and research.

## Features

- **TurboWarp Support**: Full support for `share.turbowarp.org` projects, including SHA-256 asset mapping and internal metadata extraction.
- **Authentication**: Log in with your Scratch account to access projects in "My Stuff" or recently viewed projects.
- **Advanced Collection Support**: Download projects from Loves, Favorites, Studios, Search results, Featured projects, Explore categories, Remixes, and "My Stuff".
- **Automatic Pagination**: Automatically fetches all projects from multi-page collections.
- **Shorthand Aliases**: Quick access to any collection using simple patterns.
- **High Performance**: Parallel project downloads (`-c`), asset caching/retries, and automatic MD5 hash verification.
- **Rich CLI & Library**: Real-time worker progress bars for terminals, clean logs for pipes/CI, and an ESM/CJS/TypeScript Node.js API.

## Installation

Requires **Node.js 18.17.0 or later**.

### Global CLI

```bash
npm install -g sc-dlp
```

### Run without installing

```bash
npx sc-dlp 60917032
```

### As a Node.js library

```bash
npm install sc-dlp
```

## CLI Usage

Use project IDs, URLs, or shorthand aliases to download projects.

```bash
# Single project (Scratch)
sc-dlp 60917032
sc-dlp https://scratch.mit.edu/projects/60917032/

# Single project (TurboWarp Share)
sc-dlp 4cd76e33-0e7a-468f-85c9-17799748a864
sc-dlp turbowarp/4cd76e33-0e7a-468f-85c9-17799748a864
sc-dlp https://share.turbowarp.org/projects/4cd76e33-0e7a-468f-85c9-17799748a864

# User collections
sc-dlp @scratchcat
sc-dlp @scratchcat/loves
sc-dlp @scratchcat/favorites

# Specialized collections
sc-dlp mystuff/shared
sc-dlp featured/curated
sc-dlp explore/animations
sc-dlp recently
sc-dlp 10123/remixes
sc-dlp studio/1234
sc-dlp search/platformer

# Authentication & configuration
sc-dlp login
sc-dlp status
sc-dlp logout
sc-dlp config --list
sc-dlp config --set conflictAction=skip
```

### Authentication

`sc-dlp login` supports three authentication methods:

- **Username & Password**: Full session access (requires solving a captcha if triggered).
- **Session ID**: Full session access using a `scratchsessionsid` cookie value.
- **X-Token**: Limited permissions access. Suitable for `recently` and public data, but cannot access `mystuff`.

### Configuration

Manage persistent defaults (language, conflict action, proxy, custom API URLs, TurboWarp mirrors) with `sc-dlp config`:

```bash
sc-dlp config --list
sc-dlp config --get proxy
sc-dlp config --set proxy=http://127.0.0.1:8080
sc-dlp config --set language=ja
sc-dlp config --reset
```

### Collection Aliases

| Collection          | Alias Pattern                                  | Note                                |
| ------------------- | ---------------------------------------------- | ----------------------------------- |
| **Loves**           | `@user/loves`, `@user/lov`                     | Scrapes HTML for all pages.         |
| **Favorites**       | `@user/favorites`, `@user/fav`                 | Fetches via API.                    |
| **User Projects**   | `@user`                                        | Fetches all shared projects.        |
| **My Stuff**        | `mystuff`, `mystuff/shared`, `mystuff/trash`   | Requires login.                     |
| **Recently Viewed** | `recently`, `recent`                           | Requires login.                     |
| **Featured**        | `featured`, `featured/curated`, `featured/top` | Fetches from Scratch homepage.      |
| **Explore**         | `explore/[category]`, `search/[query]`         | Fetches results from browse/search. |
| **Remixes**         | `id/remixes`, `id/remix`                       | Fetches all remixes of a project.   |
| **Studio**          | `studio/id`                                    | Fetches projects in a studio.       |
| **TurboWarp**       | `turbowarp/[id]`, `[uuid]`                     | Fetches from TurboWarp Share.       |

### Options

- `login` / `status` / `logout`: Manage Scratch authentication.
- `config [options...]`: Manage saved configuration (`sc-dlp config --help` for details).
- `deleteaccount`: Download projects listed on the Scratch account deletion confirmation page.
- `-h`, `--help`: Show the help screen.
- `-c`, `--concurrency NUMBER`: Number of projects to download in parallel (default: `1`).
- `-l`, `--limit NUMBER`: Maximum number of projects to fetch from a collection.
- `--page NUMBER`: Fetch a specific page from a collection (e.g., users, favorites, loves, studios, search, mystuff).
- `--playlist-start NUMBER`: Playlist item to start at (default: `1`).
- `--playlist-end NUMBER`: Playlist item to end at.
- `-I`, `--playlist-items ITEMS`: Specific playlist indices (e.g., `1,2,5-10`).
- `--language CODE`: Override language for search results (default: `en`).
- `--project-token TOKEN`: Token to access private/unshared projects.
- `--format EXT`: Output file extension (`sb3`, `sb2`, `sb`, `json`; default: auto-detected).
- `-j`, `--json-only`: Download only the `project.json` file (implies `--format json`).
- `-a`, `--no-assets`: Download project code only (skip costumes and sounds).
- `--conflict ACTION`: Conflict action: `overwrite`, `skip`, or `keep-both`.
- `--retries NUMBER`: Number of times to retry failed asset downloads (default: `5`).
- `-m`, `--mtime`: Set file modification time to the project's last modified/shared date.
- `-t`, `--write-thumbnail`: Download the project thumbnail alongside the project file.
- `--thumbnail-size WIDTHxHEIGHT`: Thumbnail size (default: `9999x9999`).
- `-v`, `--verbose`: Show detailed logs and stack traces on error.

### File Conflict Resolution

If a project with the same name and ID already exists in the target directory, `sc-dlp` prompts you for an action (unless `--conflict` or `config --set conflictAction=...` is configured). By default, filenames include the project ID (e.g., `Title (12345).sb3`) to avoid collisions between projects with the same title.

- **Overwrite**: Replace the existing file with the new download.
- **Skip**: Skip downloading this project.
- **Keep both**: Automatically rename the new file by appending a number (e.g., `Project 2.sb3`).

Once selected in a session, the choice is applied automatically to remaining conflicts in the same run.

## Programmatic Usage (Node.js API)

`sc-dlp` ships ESM, CommonJS, and TypeScript declarations.

```ts
import fs from "node:fs/promises";
import { downloadProjectFromID, getProjectsFromPlaylistURL } from "sc-dlp";

const project = await downloadProjectFromID("60917032", {
  onProgress: (type, loaded, total) => {
    console.log(`${type}: ${loaded}/${total}`);
  },
});

await fs.writeFile(
  `${project.title}.${project.type}`,
  Buffer.from(project.arrayBuffer)
);

const studioProjects = await getProjectsFromPlaylistURL("studio/1234", {
  limit: 20,
});
console.log(`Found ${studioProjects?.length ?? 0} projects`);
```

CommonJS is also supported:

```js
const { downloadProjectFromID } = require("sc-dlp");
```

Main exported functions:

- `downloadProjectFromID(id, options?)`
- `downloadProjectFromURL(url, options?)`
- `downloadTurboWarpProject(id, options?)`
- `downloadProjectFromJSON(json, options?)`
- `downloadProjectFromBuffer(buffer, options?)`
- `getProjectMetadata(id, options?)`
- `getTurboWarpMetadata(id, options?)`
- `getProjectsFromPlaylistURL(input, options?)`
- `clearAssetCache()`

## Advanced

### Asset Integrity

By default, `sc-dlp` calculates the MD5 hash of every downloaded asset. If the calculated hash differs from the hash referenced in `project.json`, the asset is automatically renamed and `project.json` is updated so the resulting project remains valid and loadable.

### TurboWarp Assets

TurboWarp Share projects use SHA-256 for asset storage. `sc-dlp` automatically extracts the `md5extsToSha256` mapping from the project page HTML to fetch and remap assets for Scratch compatibility.

## Privacy

By default, `sc-dlp` communicates directly with Scratch APIs (`api.scratch.mit.edu`, `projects.scratch.mit.edu`, `assets.scratch.mit.edu`) and TurboWarp APIs (`share.turbowarp.org`). Configuration and session data are stored locally in `~/.sc-dlp/config.json` with `0600` permissions.

## Development

To build and test from source:

```bash
git clone https://github.com/rbstxt/sc-dlp.git
cd sc-dlp
npm install
npm run build
npm test
```
