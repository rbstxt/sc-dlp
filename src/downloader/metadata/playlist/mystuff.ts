import { Options, ProjectSummary } from "../../types.js";
import { parseOptions } from "../../utils.js";
import { fetchProjectList } from "../list.js";
import { fetchWithProxy as fetch } from "../../../fetch-wrapper.js";

import { loadConfig } from "../../../cli/config.js";

export const fetchMyStuffProjects = async (url: string, options?: Options): Promise<ProjectSummary[]> => {
    const match = url.match(/^https?:\/\/scratch\.mit\.edu\/mystuff\/?(#.*)?$/);
    if (!match) return [];

    const config = loadConfig();
    const siteApiBase = config.urls.site;

    if (!options?.sessionId) {
        if (options?.token) {
            throw new Error("Insufficient permissions. 'My Stuff' requires a full session login (username/password or session ID).");
        }
        throw new Error("You must be logged in to access 'My Stuff'. Run 'sc-dlp login' first.");
    }

    const hash = (match[1] || "").toLowerCase();
    let apiEndpoint = `${siteApiBase}/projects/all/`;
    if (hash === "#shared") {
        apiEndpoint = `${siteApiBase}/projects/shared/`;
    } else if (hash === "#unshared") {
        apiEndpoint = `${siteApiBase}/projects/notshared/`;
    } else if (hash === "#trash") {
        apiEndpoint = `${siteApiBase}/projects/trashed/`;
    }

    let allProjects: ProjectSummary[] = [];
    let page = options?.page || 1;
    while (true) {
        try {
            const pageUrl = `${apiEndpoint}${apiEndpoint.includes("?") ? "&" : "?"}page=${page}`;
            const projects = await fetchProjectList(pageUrl, options);
            if (projects.length === 0) break;
            allProjects = allProjects.concat(projects);

            if (options?.page) break;

            page++;
            const currentOptions = parseOptions(options);
            if (currentOptions.limit && allProjects.length >= currentOptions.limit) break;
        } catch (e) {
            break;
        }
    }
    return allProjects;
};
