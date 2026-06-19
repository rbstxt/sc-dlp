import { fetchWithProxy as fetch } from "../fetch-wrapper.js";
import environment from "../environment.js";
import { HTTPError } from "../errors.js";
import { Options, ProjectMetadata, DownloadedProject } from "./types.js";
import { parseOptions } from "./utils.js";
import { downloadProjectFromJSON } from "./core.js";

import { loadConfig } from "../cli/config.js";

export const getTurboWarpMetadata = async (id: string, options?: Options): Promise<ProjectMetadata & { assetMapping: Record<string, string> }> => {
    options = parseOptions(options);
    const config = loadConfig();
    const url = `${config.urls.turbowarpShare}/projects/${id}`;

    const response = await fetch(url, {
        signal: options.signal,
        headers: environment.headers
    });

    if (!response.ok) {
        throw new HTTPError(url, response.status);
    }

    const html = await response.text();

    // Extract metadata from SvelteKit data (preferred)
    let title = "Untitled";
    let description = "";

    const titleMatch = html.match(/(?:title)\s*:\s*(?:"((?:[^"\\]|\\.)+)"|'((?:[^'\\]|\\.)+)')/);
    const descMatch = html.match(/(?:description)\s*:\s*(?:"((?:[^"\\]|\\.)+)"|'((?:[^'\\]|\\.)+)')/);

    if (titleMatch) {
        title = (titleMatch[1] || titleMatch[2]).replace(/\\(.)/g, "$1");
    } else {
        // Fallback to meta tags
        const metaTitleMatch = html.match(/<meta property="og:title" content="([^"]+)">/);
        if (metaTitleMatch) title = metaTitleMatch[1];
    }

    if (descMatch) {
        description = (descMatch[1] || descMatch[2]).replace(/\\(.)/g, "$1");
    } else {
        // Fallback to meta tags
        const metaDescMatch = html.match(/<meta property="og:description" content="([^"]+)">/);
        if (metaDescMatch) description = metaDescMatch[1];
    }

    // Extract asset mapping from SvelteKit data
    // SvelteKit embeds data in a script tag. We'll look for the md5extsToSha256 pattern.
    let assetMapping: Record<string, string> = {};
    // Extract the mapping object more greedily to handle multi-line and extra whitespace
    const mappingMatch = html.match(/(?:"md5extsToSha256"|'md5extsToSha256'|md5extsToSha256)\s*:\s*({[\s\S]*?})\s*[,}<]/);
    if (mappingMatch) {
        try {
            // Try to parse as JSON first
            assetMapping = JSON.parse(mappingMatch[1]);
        } catch (e) {
            // Fallback: manually extract entries if parsing fails
            // Support: "key": "value", 'key': 'value', key: "value"
            // Also handle escaped quotes like \"
            const entryRegex = /(?:"((?:[^"\\]|\\.)+)"|'((?:[^'\\]|\\.)+)'|(\w+))\s*:\s*(?:"((?:[^"\\]|\\.)+)"|'((?:[^'\\]|\\.)+)')/g;
            let entryMatch;
            while ((entryMatch = entryRegex.exec(mappingMatch[1])) !== null) {
                let key = entryMatch[1] || entryMatch[2] || entryMatch[3];
                let value = entryMatch[4] || entryMatch[5];
                if (key && value) {
                    // Unescape backslashes and quotes
                    key = key.replace(/\\(.)/g, "$1");
                    value = value.replace(/\\(.)/g, "$1");
                    assetMapping[key] = value;
                }
            }
        }
    }

    const mappingSize = Object.keys(assetMapping).length;
    if (options.onProgress) {
        if (mappingSize === 0) {
            options.onProgress("mapping", 0, 0, "Asset mapping is EMPTY. Assets will likely fail to download.");
        } else {
            options.onProgress("mapping", mappingSize, mappingSize, `Extracted ${mappingSize} asset mapping entries.`);
        }
    }

    // Return a subset of ProjectMetadata that sc-dlp expects
    return {
        id: id as any,
        title,
        description,
        assetMapping,
        // Fill in defaults for the rest of ProjectMetadata if needed by downstream
    } as any;
};

export const downloadTurboWarpProject = async (id: string, options?: Options): Promise<DownloadedProject> => {
    options = parseOptions(options);

    if (options.onProgress) {
        options.onProgress("metadata", 0, 1);
    }

    const meta = await getTurboWarpMetadata(id, options);

    if (options.onProgress) {
        options.onProgress("metadata", 1, 1, meta.title);
    }

    const config = loadConfig();
    const projectUrl = `${config.urls.turbowarpApi}/projects/${id}`;
    const projectResponse = await fetch(projectUrl, {
        signal: options.signal,
        headers: environment.headers
    });

    if (!projectResponse.ok) {
        throw new HTTPError(projectUrl, projectResponse.status);
    }

    const projectData = await projectResponse.json();

    const downloadOptions: Options = {
        ...options,
        assetHost: `${config.urls.turbowarpApi}/assets/$id`,
        assetMapping: meta.assetMapping
    };

    const project = await downloadProjectFromJSON(projectData, downloadOptions);
    project.title = meta.title;

    // TurboWarp Share currently doesn't provide history (created/modified) via this API easily
    // without more complex crawling, so we'll leave them null if not found.

    return project;
};
