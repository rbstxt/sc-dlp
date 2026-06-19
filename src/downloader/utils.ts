import { AbortError } from "../errors.js";
import { Options, ProjectType } from "./types.js";
import crypto from "node:crypto";

import { loadConfig } from "../cli/config.js";

/**
 * @param {Options} givenOptions
 * @returns {Options}
 */
export const parseOptions = (givenOptions?: Options): Options => {
    const config = loadConfig();
    return Object.assign(
        {
            // Default asset host for scratch.mit.edu
            assetHost: `${config.urls.assets}/internalapi/asset/$id/get/`,
        },
        givenOptions || {},
    );
};

/**
 * @param {Options} options
 */
export const throwIfAborted = (options: Options) => {
    // Browser support for AbortSignal.prototype.throwIfAborted() is not good.
    if (options.signal && options.signal.aborted) {
        throw new AbortError();
    }
};

/**
 * @param {Options} options
 * @param {number} [initialTotal]
 */
export const makeAssetProgressTarget = (options: Options, initialTotal = 0) => {
    let totalAssets = initialTotal;
    let loadedAssets = 0;
    let lastAsset = "";
    let timeout: any = null;
    let isDone = false;

    const emitProgressUpdate = (immediate = false) => {
        throwIfAborted(options);

        if (isDone) {
            throw new Error("Asset progress target used after completion");
        } else if (totalAssets === loadedAssets && totalAssets > 0) {
            isDone = true;
            if (options.onProgress) {
                if (lastAsset) {
                    options.onProgress("assets", loadedAssets, totalAssets, lastAsset);
                } else {
                    options.onProgress("assets", loadedAssets, totalAssets);
                }
            }
            clearTimeout(timeout);
            timeout = null;
        } else if (immediate) {
            if (options.onProgress) {
                if (lastAsset) {
                    options.onProgress("assets", loadedAssets, totalAssets, lastAsset);
                } else {
                    options.onProgress("assets", loadedAssets, totalAssets);
                }
            }
        } else if (!timeout) {
            timeout = setTimeout(() => {
                throwIfAborted(options);
                timeout = null;
                if (options.onProgress) {
                    if (lastAsset) {
                        options.onProgress("assets", loadedAssets, totalAssets, lastAsset);
                    } else {
                        options.onProgress("assets", loadedAssets, totalAssets);
                    }
                }
            });
        }
    };

    return {
        fetching: (md5ext?: string) => {
            if (initialTotal === 0) totalAssets++;
            if (md5ext) lastAsset = md5ext;
            emitProgressUpdate(true);
        },
        fetched: (md5ext?: string) => {
            loadedAssets++;
            if (md5ext) lastAsset = md5ext;
            emitProgressUpdate();
        },
    };
};

export const isAbortError = (error: any): error is AbortError => error && error.name === "AbortError";

/**
 * Browser support for Array.prototype.flat is not to the level we want.
 * @template T
 * @param {T[][]} array
 * @returns {T[]}
 */
export const flat = <T>(array: (T | T[])[]): T[] => {
    const result: T[] = [];
    for (const i of array) {
        if (Array.isArray(i)) {
            for (const j of i) {
                result.push(j);
            }
        } else {
            result.push(i);
        }
    }
    return result;
};

/**
 * @param {Uint8Array} uint8array
 * @returns {boolean}
 */
export const isScratch1Project = (uint8array: Uint8Array) => {
    const MAGIC = "ScratchV";
    for (let i = 0; i < MAGIC.length; i++) {
        if (uint8array[i] !== MAGIC.charCodeAt(i)) {
            return false;
        }
    }
    return true;
};

/**
 * @param {Uint8Array} uint8array
 * @returns {boolean}
 */
export const isProbablyJSON = (uint8array: Uint8Array) => uint8array[0] === "{".charCodeAt(0);

/**
 * @param {unknown} projectData
 * @returns {'sb2'|'sb3'|null}
 */
export const identifyProjectTypeFromJSON = (projectData: any): 'sb2' | 'sb3' | null => {
    if (Object.prototype.hasOwnProperty.call(projectData, "targets")) {
        return "sb3";
    } else if (Object.prototype.hasOwnProperty.call(projectData, "objName")) {
        return "sb2";
    }
    return null;
};

/**
 * @param {string} text
 * @param {any} ExtendedJSON
 * @returns {{data: any, isFixed: boolean}}
 */
export const safeParseProjectJSON = (text: string, ExtendedJSON: any): { data: any, isFixed: boolean } => {
    try {
        return {
            data: ExtendedJSON.parse(text),
            isFixed: false
        };
    } catch (e) {
        // Scratch's parser/server strips \b (0x08) and literal \b escape sequences
        // to handle "broken" projects.
        // We try stripping these and parsing again.
        const fixedText = text
            .replace(/\x08/g, "")
            .replace(/\\b/g, "");
        try {
            return {
                data: ExtendedJSON.parse(fixedText),
                isFixed: true
            };
        } catch (e2) {
            // If it still fails, throw the original error
            throw e;
        }
    }
};

/**
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export const calculateMD5 = (buffer: ArrayBuffer): string => {
    return crypto.createHash("md5").update(new Uint8Array(buffer)).digest("hex");
};
