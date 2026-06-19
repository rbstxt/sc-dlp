import { fetchWithProxy as fetch } from "../../fetch-wrapper.js";
import environment from "../../environment.js";
import { HTTPError } from "../../errors.js";
import { Options, ProjectSummary } from "../types.js";
import { parseOptions } from "../utils.js";
import { fetchAllProjectPages } from "./list.js";

const decodeHTMLEntities = (text: string) => {
    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
};

/**
 * @param {string} url
 * @param {Options} [options]
 * @returns {Promise<ProjectSummary[]>}
 */
export const fetchLovesList = async (url: string, options?: Options): Promise<ProjectSummary[]> => {
    options = parseOptions(options);

    let allProjects: ProjectSummary[] = [];
    let currentUrl = url;
    let page = 1;
    const hasPageParam = url.includes("page=");

    while (true) {
        if (options.page && !hasPageParam && page !== options.page) {
            page = options.page;
            const baseUrl = url.split("?")[0];
            currentUrl = `${baseUrl}?page=${page}`;
        }

        const response = await fetch(currentUrl, {
            signal: options.signal,
            headers: environment.headers,
        });
        if (!response.ok) {
            if (response.status === 404 && page > 1) break;
            throw new HTTPError(currentUrl, response.status);
        }
        const html = await response.text();
        const projectsInPage: ProjectSummary[] = [];

        // Project entries
        const projectRegex = /<li class="project thumb item">[\s\S]*?<a href="\/projects\/(\d+)\/">[\s\S]*?<span class="title">[\s\S]*?<a [^>]*?>([\s\S]*?)<\/a>[\s\S]*?<span class="owner"[^>]*>[\s\S]*?by <a [^>]*?href="\/users\/([^/]+)\/"[^>]*>/g;
        let match;
        while ((match = projectRegex.exec(html)) !== null) {
            projectsInPage.push({
                id: parseInt(match[1], 10),
                title: decodeHTMLEntities(match[2].trim()),
                author: match[3],
            });
        }

        if (projectsInPage.length === 0) break;
        allProjects = allProjects.concat(projectsInPage);

        if (hasPageParam || options.page) break; // Only fetch one page if specified or forced

        // Check for next page
        const nextMatch = html.match(/<a [^>]*?href="\?page=(\d+)"[^>]*>next[\s\S]*?<\/a>/i);
        if (nextMatch) {
            page = parseInt(nextMatch[1], 10);
            const baseUrl = url.split("?")[0];
            currentUrl = `${baseUrl}?page=${page}`;
        } else {
            break;
        }

        if (options.limit && allProjects.length >= options.limit) break;
    }

    return allProjects;
};

import { loadConfig } from "../../cli/config.js";

/**
 * @param {Options} options
 * @returns {Promise<ProjectSummary[]>}
 */
export const fetchRecentlyViewed = async (options: Options): Promise<ProjectSummary[]> => {
    options = parseOptions(options);
    const config = loadConfig();
    const token = options.token || config.token;

    if (!token) {
        throw new Error("You must be logged in to access 'Recently Viewed'. Run 'sc-dlp login' first.");
    }
    const apiBase = config.urls.api;
    const username = options.username || config.username;

    // Create new options without sessionId to satisfy user requirement: "Recentの時はX-tokenだけ送信する"
    const { sessionId, ...rest } = options;
    return fetchAllProjectPages(`${apiBase}/users/${username}/projects/recentlyviewed`, {
        ...rest,
        token
    });
};
