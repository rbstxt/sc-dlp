import fetchAsArrayBufferWithProgress from "../fetch-with-progress.js";
import environment from "../environment.js";
import {
    Options,
    DownloadedProject,
} from "./types.js";
import {
    parseOptions,
    throwIfAborted,
} from "./utils.js";
import {
    getProjectMetadata,
    getProjectTitleFromURL,
} from "./metadata.js";
import {
    downloadProjectFromBuffer,
} from "./core.js";
import { CanNotAccessProjectError, HTTPError } from "../errors.js";

/**
 * @param {string} id
 * @param {string} baseUrl
 * @param {Options} options
 * @returns {Promise<DownloadedProject>}
 */
const downloadFromScratchURLWithToken = async (id: string | number, baseUrl: string, options: Options): Promise<DownloadedProject> => {
    options = parseOptions(options);

    let lastError: any;
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            if (options.onProgress) {
                options.onProgress("metadata", 0, 1);
            }

            const refresh = attempt > 0;
            const meta = await getProjectMetadata(id, { ...options, refresh });

            if (options.onProgress) {
                options.onProgress("metadata", 1, 1, meta.title);
            }
            throwIfAborted(options);

            const token = meta.project_token;
            const title = meta.title;
            const tokenPart = token ? `?token=${token}` : "";

            let downloadUrl = baseUrl + tokenPart;
            if (refresh) {
                downloadUrl += `${downloadUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
            }

            const project = await downloadProjectFromURL(downloadUrl, options);
            if (title) {
                project.title = title;
            }
            if (meta.history) {
                if (meta.history.modified) {
                    project.modified = meta.history.modified;
                }
                if (meta.history.created) {
                    project.created = meta.history.created;
                }
                if (meta.history.shared) {
                    project.shared = meta.history.shared;
                }
            }
            return project;
        } catch (e) {
            lastError = e;
            if (e instanceof CanNotAccessProjectError && attempt < 4) {
                continue;
            }
            throw e;
        }
    }
    throw lastError;
};

import { loadConfig } from "../cli/config.js";

/**
 * @param {string} id
 * @param {Options} [options]
 * @returns {Promise<DownloadedProject>}
 */
export const downloadProjectFromID = async (id: string | number, options?: Options): Promise<DownloadedProject> => {
    options = parseOptions(options);
    const config = loadConfig();

    if (options.projectToken) {
        const projectUrl = `${config.urls.projects}/${id}?token=${options.projectToken}`;
        // NO sessionId for projects server
        const headers: Record<string, string> = { ...environment.headers };
        const project = await downloadProjectFromURL(projectUrl, options);
        // Metadata might be missing here if we don't fetch it, but that's what 'manual mode' implies.
        // We could still try to fetch metadata if we want title etc.
        try {
            const meta = await getProjectMetadata(id, options);
            project.title = meta.title;
        } catch (e) { }
        return project;
    }

    return downloadFromScratchURLWithToken(
        id,
        `${config.urls.projects}/${id}`,
        options,
    );
};

/**
 * @param {string} url
 * @param {Options} [options]
 * @returns {Promise<DownloadedProject>}
 */
export const downloadProjectFromURL = async (url: string, options?: Options): Promise<DownloadedProject> => {
    options = parseOptions(options);
    let buffer;
    try {
        buffer = await fetchAsArrayBufferWithProgress(
            url,
            (progress) => {
                if (options!.onProgress) {
                    options!.onProgress("project", progress, 1);
                }
            },
            options.signal,
        );
    } catch (e: any) {
        if (e instanceof HTTPError && (e.status === 404 || e.status === 403)) {
            throw new CanNotAccessProjectError(e.message);
        }
        throw e;
    }
    const project = await downloadProjectFromBuffer(buffer, options);
    project.title = getProjectTitleFromURL(url);
    return project;
};
