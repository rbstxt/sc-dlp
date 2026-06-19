import { fetchWithProxy as fetch } from "../../fetch-wrapper.js";
import environment from "../../environment.js";
import { HTTPError } from "../../errors.js";
import { Options, ProjectSummary } from "../types.js";
import { parseOptions } from "../utils.js";

/**
 * @param {string} url
 * @param {Options} [options]
 * @returns {Promise<ProjectSummary[]>}
 */
export const fetchProjectList = async (url: string, options?: Options): Promise<ProjectSummary[]> => {
    options = parseOptions(options);
    const headers: Record<string, string> = { ...environment.headers };
    if (options.token) headers["x-token"] = options.token;

    const sessionId = options.sessionId;
    if (sessionId && url.includes("/site-api/")) {
        headers["Cookie"] = `scratchsessionsid=${sessionId}; scratchcsrftoken=a; scratchlanguage=en`;
        headers["x-csrftoken"] = "a";
        headers["x-requested-with"] = "XMLHttpRequest";
        headers["Referer"] = url.includes("/mystuff/") ? "https://scratch.mit.edu/mystuff/" : "https://scratch.mit.edu/";
        headers["Accept"] = "application/json";
    }
    const response = await fetch(url, {
        signal: options.signal,
        headers,
    });
    if (!response.ok) {
        throw new HTTPError(url, response.status);
    }
    const json = await response.json();
    if (Array.isArray(json)) {
        return json.map((p: any) => {
            // Check if it's the site-api format (e.g. from mystuff)
            if (p.fields && p.pk) {
                return {
                    id: p.pk,
                    title: p.fields.title,
                    author: p.fields.creator?.username || "",
                };
            }
            // Default API format
            return {
                id: p.id,
                title: p.title,
                author: p.username || p.author?.username || "",
            };
        });
    }
    return [];
};

/**
 * @param {string} baseUrl
 * @param {Options} [options]
 * @returns {Promise<ProjectSummary[]>}
 */
export const fetchAllProjectPages = async (baseUrl: string, options: Options = {}): Promise<ProjectSummary[]> => {
    let allProjects: ProjectSummary[] = [];
    const limit = 40;
    let offset = options.offset || 0;

    if (options.page) {
        offset = (options.page - 1) * limit;
    }

    const maxLimit = options.limit || Infinity;
    const concurrency = options.concurrency || 1;
    let reachedEnd = false;

    while (allProjects.length < maxLimit && !reachedEnd) {
        const batchSize = Math.min(concurrency, Math.ceil((maxLimit - allProjects.length) / limit));
        const promises = [];

        for (let i = 0; i < batchSize; i++) {
            const currentOffset = offset + i * limit;
            const fetchLimit = Math.min(limit, maxLimit - (allProjects.length + i * limit));
            if (fetchLimit <= 0) break;

            let url = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"
                }limit=${fetchLimit}&offset=${currentOffset}`;
            if (options.language) {
                url += `&language=${encodeURIComponent(options.language)}`;
            }
            promises.push(fetchProjectList(url, options));
        }

        if (promises.length === 0) break;

        const results = await Promise.all(promises);
        for (let i = 0; i < results.length; i++) {
            const projects = results[i];
            allProjects = allProjects.concat(projects);

            if (options.onProgress) {
                options.onProgress('metadata', allProjects.length, 0);
            }

            if (options.page) {
                reachedEnd = true;
                break;
            }

            const expectedLimit = Math.min(limit, maxLimit - (allProjects.length - projects.length));
            if (projects.length < expectedLimit) {
                reachedEnd = true;
                break;
            }
        }

        if (options.page) break;
        offset += results.length * limit;
    }
    return allProjects;
};
