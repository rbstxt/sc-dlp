

import { UserConfig } from "./types.js";

/**
 * @param {string} string
 * @param {UserConfig} [config]
 * @returns {{id: string | null, token: string | null, projectUrl: string | null} | null}
 */
export const extractProjectInfo = (string: string, config?: UserConfig): { id: string | null, token: string | null, projectUrl: string | null } | null => {
    if (/^\d+$/.test(string)) {
        return { id: string, token: null, projectUrl: null };
    }

    let url: URL;
    try {
        url = new URL(string);
    } catch (e) {
        // Not a URL, but check if it's a UUID
        if (/^[0-9a-f-]{36}$/i.test(string)) {
            return { id: string, token: null, projectUrl: null };
        }
        return null;
    }

    const searchParams = url.searchParams;
    const projectUrl = searchParams.get("project_url");

    // Check for token in search or hash
    const tokenMatch = string.match(/[?&#]token=([^&#]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    const hostname = url.hostname;
    const pathname = url.pathname;

    // Scratch
    if (hostname === "scratch.mit.edu") {
        const match = pathname.match(/^\/projects\/(\d+)/);
        if (match) {
            return { id: projectUrl ? null : match[1], token, projectUrl };
        }
    }

    // TurboWarp and Mirrors
    const mirrors = config?.turbowarpMirrors || [
        "turbowarp.org",
        "mirror.turbowarp.xyz",
        "forkphorus.github.io",
        "packager.turbowarp.org",
        "share.turbowarp.org"
    ];

    if (mirrors.includes(hostname)) {
        // Path can be /123 or /#123
        const pathIDMatch = pathname.match(/^\/(\d+)/);
        const hashIDMatch = url.hash.match(/^#(\d+)/);
        const shareIDMatch = pathname.match(/^\/projects\/([0-9a-f-]{36})/);
        const id = pathIDMatch ? pathIDMatch[1] : (hashIDMatch ? hashIDMatch[1] : (shareIDMatch ? shareIDMatch[1] : null));

        // forkphorus does not support the token parameter or project_url parameter
        const finalToken = hostname === "forkphorus.github.io" ? null : token;
        const finalProjectUrl = hostname === "forkphorus.github.io" ? null : projectUrl;

        return { id: finalProjectUrl ? null : id, token: finalToken, projectUrl: finalProjectUrl };
    }

    return null;
};

/**
 * @param {string} string
 * @param {UserConfig} [config]
 * @returns {string|null}
 */
export const extractProjectID = (string: string, config?: UserConfig): string | null => {
    const info = extractProjectInfo(string, config);
    return info ? info.id : null;
};

/**
 * @param {string} string
 * @returns {boolean}
 */
export const isURL = (string: string): boolean =>
    string.startsWith("http:") || string.startsWith("https:");

/**
 * Remove characters that can not reliably be used in file names.
 * @param {string} name
 * @returns {string}
 */
export const sanitizeFileName = (name: string): string => name.replace(/[\\\/:*?"<>|\0]/g, "_");

/**
 * @param {string} items
 * @returns {Set<number>}
 */
export const parsePlaylistItems = (items: string): Set<number> => {
    const result = new Set<number>();
    const parts = items.split(",");
    for (const part of parts) {
        if (part.includes("-")) {
            const [start, end] = part.split("-").map(Number);
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) {
                    result.add(i);
                }
            }
        } else {
            const num = Number(part);
            if (!isNaN(num)) {
                result.add(num);
            }
        }
    }
    return result;
};

/**
 * Log an error to the console.
 * @param {Error|any} err
 * @param {string} [context]
 */
export const logError = (err: any, context = "") => {
    const timestamp = new Date().toISOString();
    let message = String(err);
    if (err instanceof Error) {
        if (err.name === "CanNotAccessProjectError") {
            message = `${err.name}: ${err.message}`;
        } else {
            message = err.stack || err.message;
        }
    }
    const logEntry = `[${timestamp}] ${context ? `Context: ${context}\n` : ""}${message}`;
    console.error(logEntry);
};
