# sc-dlp

A high-performance command-line tool for downloading Scratch and TurboWarp projects. Supports projects from Scratch 1.4 (sb), 2.0 (sb2), 3.0 (sb3), and TurboWarp Share (sha256).

`sc-dlp` is an independent, derivative project designed for robust project archival, analysis, and research.

## Features

- **TurboWarp Support**: Comprehensive support for `share.turbowarp.org` projects, including SHA-256 asset mapping and internal metadata extraction.
- **Authentication**: Login with Scratch account to access projects in "My Stuff" or recently viewed projects.
- **Advanced Collection Support**: Download projects from Loves, Favorites, Studios, Search results, Featured projects, Explore categories, and "My Stuff".
- **Automatic Pagination**: Automatically fetches all projects from multi-page collections.
- **Shorthand Aliases**: Quick access to any collection using simple patterns.
- **High Performance**: Parallel project downloads, asset fetching, and smart hash verification.
- **Rich CLI**: Professional logging with distinct prefixes (`[assets]`, `[mapping]`, `[compress]`), interactive prompts, and real-time progress bars.

## Installation

```bash
git clone https://github.com/sc-dlp/sc-dlp.git
cd sc-dlp
npm install
npm run build
npm link
```

## Usage

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
sc-dlp @scratchcat/loves
sc-dlp @scratchcat/favorites
sc-dlp @scratchcat

# Authentication
sc-dlp login
sc-dlp status
sc-dlp logout

# Specialized collections
sc-dlp mystuff/shared
sc-dlp featured/curated
sc-dlp explore/animations
sc-dlp recently
sc-dlp 10123/remixes
sc-dlp studio/1234
sc-dlp search/platformer
```

### Authentication

`sc-dlp login` supports three authentication methods:

- **Username & Password**: Full session access (requires solving a captcha if triggered).
- **Session ID**: Full session access using a `scratchsessionsid` cookie value.
- **X-Token**: Limited permissions access. Suitable for `recently` and public data, but cannot access `mystuff`.

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

- `--help`: Shows the help screen.
- `-c`, `--concurrency NUMBER`: Number of projects to download in parallel (default: 1).
- `-m`, `--mtime`: Set file modification time to project last shared/modified date.
- `-t`, `--write-thumbnail`: Download project thumbnail.
- `--thumbnail-size WIDTHxHEIGHT`: Thumbnail size (default: 9999x9999).
- `--playlist-start NUMBER`: Playlist item to start at.
- `--playlist-end NUMBER`: Playlist item to end at.
- `-I`, `--playlist-items ITEMS`: Specific indices (e.g., 1,2,5-10).
- `--page NUMBER`: Page number to fetch for collections (e.g., users, favorites, loves, studios, search, mystuff).
- `--format EXT`: Output extension (sb3, sb2, sb, json).
- `-j`, `--json-only`: Download only the `project.json` file.
- `-a`, `--no-assets`: Download code only (no costumes/sounds).
- `--conflict ACTION`: Conflict action: `overwrite`, `skip`, or `keep-both`.
- `--retries NUMBER`: Number of times to retry failed asset downloads (default: 3).
- `-v`, `--verbose`: Show detailed information and stack traces on error.

### File Conflict Resolution

If a project with the same name and ID already exists in the target directory, `sc-dlp` will prompt you for action. By default, sc-dlp includes the project ID in the filename (e.g., `Title (12345).sb3`) to avoid conflicts between different projects with the same title.

- **Overwrite**: Replace the existing file with the new download.
- **Skip**: Abort the download for this specific project.
- **Keep both**: Automatically rename the new file by appending a number (e.g., `Project 2.sb3`).

Once you make a choice, it will be automatically applied to all remaining conflicts within the same download session (e.g., when downloading a studio or user's projects) to ensure a smooth, unattended experience.

## Advanced

### Asset Integrity

By default, `sc-dlp` calculates the MD5 hash of every downloaded asset. If the calculated hash differs from the hash provided in the project metadata, the tool automatically renames the file and updates the `project.json` to ensure the project remains loadable and consistent.

### TurboWarp Assets

TurboWarp Share projects use SHA-256 for asset storage. `sc-dlp` automatically extracts the `md5extsToSha256` mapping from the project's page HTML to correctly fetch and rename these assets for Scratch compatibility.

## Privacy

By default, `sc-dlp` communicates directly with Scratch APIs (`api.scratch.mit.edu`, `projects.scratch.mit.edu`, `assets.scratch.mit.edu`) and TurboWarp APIs (`share.turbowarp.org`). Session data is stored locally in `~/.sc-dlp/config.json`.
