import { Options, ProjectSummary } from "../../types.js";
import { fetchProjectList, fetchAllProjectPages } from "../list.js";
import { fetchLovesList } from "../user.js";
import { fetchFeaturedProjects } from "./featured.js";
import { fetchMyStuffProjects } from "./mystuff.js";
import { fetchDeleteAccountProjects } from "./delete_account.js";
import { loadConfig } from "../../../cli/config.js";

export const handleURL = async (url: string, options?: Options): Promise<ProjectSummary[] | null> => {
    let match;

    // User projects
    match = url.match(
        /^https?:\/\/scratch\.mit\.edu\/users\/([^/]+)\/?(?:projects\/?)?(?:\?.*)?$/,
    );
    if (match) {
        const username = match[1];
        const pageMatch = url.match(/[?&]page=(\d+)/);
        const fetchOptions = { ...options };
        if (pageMatch) {
            const page = parseInt(pageMatch[1], 10);
            fetchOptions.offset = (page - 1) * 60;
            fetchOptions.limit = 60;
        } else if (options?.page) {
            fetchOptions.offset = (options.page - 1) * 60;
            fetchOptions.limit = 60;
        }
        const apiBase = loadConfig().urls.api;
        return fetchAllProjectPages(
            `${apiBase}/users/${username}/projects`,
            fetchOptions,
        );
    }

    // Favorites
    match = url.match(
        /^https?:\/\/scratch\.mit\.edu\/users\/([^/]+)\/favorites\/?(?:\?.*)?$/,
    );
    if (match) {
        const username = match[1];
        const pageMatch = url.match(/[?&]page=(\d+)/);
        const fetchOptions = { ...options };
        if (pageMatch) {
            const page = parseInt(pageMatch[1], 10);
            fetchOptions.offset = (page - 1) * 60;
            fetchOptions.limit = 60;
        } else if (options?.page) {
            fetchOptions.offset = (options.page - 1) * 60;
            fetchOptions.limit = 60;
        }
        const apiBase = loadConfig().urls.api;
        return fetchAllProjectPages(
            `${apiBase}/users/${username}/favorites`,
            fetchOptions,
        );
    }

    // Remixes
    match = url.match(
        /^https?:\/\/scratch\.mit\.edu\/projects\/(\d+)\/remixes\/?$/,
    );
    if (match) {
        const id = match[1];
        const apiBase = loadConfig().urls.api;
        return fetchProjectList(
            `${apiBase}/projects/${id}/remixes`,
            options,
        );
    }

    // Studio projects
    match = url.match(/^https?:\/\/scratch\.mit.edu\/studios\/(\d+)\/?/);
    if (match) {
        const studioId = match[1];
        const apiBase = loadConfig().urls.api;
        return fetchAllProjectPages(
            `${apiBase}/studios/${studioId}/projects`,
            options,
        );
    }

    // Search projects
    match = url.match(
        /^https?:\/\/scratch\.mit\.edu\/search\/projects\/?\?q=([^&]+)/,
    );
    if (match) {
        const query = match[1];
        const modeMatch = url.match(/[?&]mode=([^&]+)/);
        const mode = modeMatch ? modeMatch[1] : "trending";
        const apiBase = loadConfig().urls.api;
        return fetchAllProjectPages(
            `${apiBase}/search/projects?q=${query}&mode=${mode}`,
            options,
        );
    }

    // Explore projects
    match = url.match(
        /^https?:\/\/scratch\.mit\.edu\/explore\/projects\/([^/]+)(?:\/(trending|popular))?\/?/,
    );
    if (match) {
        let category = match[1];
        if (category === "all") category = "*";
        const mode = match[2] || "trending";
        const apiBase = loadConfig().urls.api;
        return fetchAllProjectPages(
            `${apiBase}/explore/projects?q=${encodeURIComponent(category)}&mode=${mode}`,
            options,
        );
    }

    // Homepage & Featured projects
    if (url.match(/^(?:https?:\/\/scratch\.mit\.edu\/?|featured(?:\/(.+))?)$/i)) {
        return fetchFeaturedProjects(url, options);
    }

    // My Stuff
    if (url.match(/^https?:\/\/scratch\.mit\.edu\/mystuff\/?(#.*)?$/)) {
        return fetchMyStuffProjects(url, options);
    }

    // Loves URL (canonical)
    match = url.match(/^https?:\/\/scratch\.mit\.edu\/projects\/all\/([^/]+)\/loves\/?(?:\?.*)?$/);
    if (match) {
        return fetchLovesList(url, options);
    }

    // TurboWarp Share project
    match = url.match(/^https?:\/\/share\.turbowarp\.org\/projects\/([0-9a-f-]{36})\/?/);
    if (match) {
        return [{
            id: match[1] as any,
            title: "",
            author: "TurboWarp"
        }];
    }

    // Account deletion confirmation
    if (url.match(/^https?:\/\/scratch\.mit\.edu\/accounts\/settings\/delete_account_confirmation\/?$/)) {
        return fetchDeleteAccountProjects(options);
    }

    return null;
};
