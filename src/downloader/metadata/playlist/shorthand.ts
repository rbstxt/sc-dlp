import { Options, ProjectSummary } from "../../types.js";
import { parseOptions } from "../../utils.js";
import { getProjectMetadata } from "../project.js";
import { fetchProjectList, fetchAllProjectPages } from "../list.js";
import { fetchLovesList, fetchRecentlyViewed } from "../user.js";
import { loadConfig } from "../../../cli/config.js";

export const handleShorthand = async (url: string, options?: Options, getProjectsFromPlaylistURL?: (url: string, options?: Options) => Promise<ProjectSummary[] | null>): Promise<ProjectSummary[] | null> => {
    let match;
    let lowerUrl = url.toLowerCase();

    // recently viewed
    if (lowerUrl === "recently" || lowerUrl === "recent" || lowerUrl === "recentlyviewed" || lowerUrl === "recentlyview") {
        return fetchRecentlyViewed(parseOptions(options));
    }

    // @username/loves
    match = url.match(/^@([^/]+)\/(loves|love|lovs|lov)$/i);
    if (match) {
        const username = match[1];
        return fetchLovesList(`https://scratch.mit.edu/projects/all/${username}/loves/`, options);
    }

    // @username/favorites
    match = url.match(/^@([^/]+)\/(favorites|favorite|favs|fav)$/i);
    if (match) {
        const username = match[1];
        return fetchAllProjectPages(`https://api.scratch.mit.edu/users/${username}/favorites`, options);
    }

    // @username shorthand (must be checked after specific @ paths)
    match = url.match(/^@([^/]+)$/);
    if (match) {
        const username = match[1];
        return fetchAllProjectPages(
            `https://api.scratch.mit.edu/users/${username}/projects`,
            options,
        );
    }

    // Remixes shorthand
    match = url.match(/^(\d+)\/(remixes|remix)$/i);
    if (match) {
        const id = match[1];
        return fetchProjectList(`https://api.scratch.mit.edu/projects/${id}/remixes`, options);
    }

    // mystuff shorthand
    if (getProjectsFromPlaylistURL) {
        if (lowerUrl === "mystuff" || lowerUrl === "mystuff/all" || lowerUrl === "mystuff/projects" || lowerUrl === "mystuff/project") {
            return getProjectsFromPlaylistURL("https://scratch.mit.edu/mystuff/", options);
        }
        if (lowerUrl === "mystuff/shared" || lowerUrl === "mystuff/share") {
            return getProjectsFromPlaylistURL("https://scratch.mit.edu/mystuff/#shared", options);
        }
        if (lowerUrl === "mystuff/unshared" || lowerUrl === "mystuff/notshared" || lowerUrl === "mystuff/unshare" || lowerUrl === "mystuff/notshare") {
            return getProjectsFromPlaylistURL("https://scratch.mit.edu/mystuff/#unshared", options);
        }
        if (lowerUrl === "mystuff/trashed" || lowerUrl === "mystuff/trash") {
            return getProjectsFromPlaylistURL("https://scratch.mit.edu/mystuff/#trash", options);
        }
    }

    // Trending shorthand
    match = url.match(/^trending\/(.+)$/i);
    if (match) {
        const query = match[1];
        const apiBase = loadConfig().urls.api;
        return fetchAllProjectPages(`${apiBase}/search/projects?mode=trending&q=${encodeURIComponent(query)}`, options);
    }

    // Popular shorthand
    match = url.match(/^popular\/(.+)$/i);
    if (match) {
        const query = match[1];
        const apiBase = loadConfig().urls.api;
        return fetchAllProjectPages(`${apiBase}/search/projects?mode=popular&q=${encodeURIComponent(query)}`, options);
    }

    // Explore shorthand
    match = url.match(/^explore(?:\/([^/]+))?(?:\/([^/]+))?$/i);
    if (match) {
        let part1 = match[1] || "all";
        let part2 = match[2];

        let category = part1;
        let mode = "trending";

        if (part1 === "trending" || part1 === "popular") {
            category = "all";
            mode = part1;
        } else if (part2 === "trending" || part2 === "popular") {
            mode = part2;
        }

        if (category === "all") category = "*";
        const apiBase = loadConfig().urls.api;
        return fetchAllProjectPages(`${apiBase}/explore/projects?q=${encodeURIComponent(category)}&mode=${mode}`, options);
    }

    // Studio shorthand
    match = url.match(/^studio\/(\d+)$/i);
    if (match) {
        const studioId = match[1];
        return fetchAllProjectPages(`https://api.scratch.mit.edu/studios/${studioId}/projects`, options);
    }

    // Project shorthand
    match = url.match(/^project\/(\d+)$/i);
    if (match) {
        const projectId = match[1];
        const metadata = await getProjectMetadata(projectId, options);
        return [{
            id: parseInt(projectId, 10),
            title: metadata.title,
            author: metadata.author?.username || ""
        }];
    }

    // TurboWarp Share shorthand
    match = url.match(/^turbowarp\/([0-9a-f-]{36})$/i);
    if (match) {
        return [{
            id: match[1] as any,
            title: "",
            author: "TurboWarp"
        }];
    }

    // Standalone UUID (TurboWarp Share)
    if (/^[0-9a-f-]{36}$/i.test(url)) {
        return [{
            id: url as any,
            title: "",
            author: "TurboWarp"
        }];
    }

    return null;
};
