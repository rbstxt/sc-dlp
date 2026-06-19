import { fetchWithProxy as fetch } from "../../../fetch-wrapper.js";
import environment from "../../../environment.js";
import { HTTPError } from "../../../errors.js";
import { Options, ProjectSummary } from "../../types.js";

import { loadConfig } from "../../../cli/config.js";

export const fetchFeaturedProjects = async (url: string, options?: Options): Promise<ProjectSummary[]> => {
    const categoryMatch = url.match(/^(?:https?:\/\/scratch\.mit\.edu\/?|featured(?:\/(.+))?)$/i);
    const category = categoryMatch && categoryMatch[1] ? categoryMatch[1].toLowerCase() : null;

    const config = loadConfig();
    const featuredUrl = `${config.urls.api}/proxy/featured`;
    const response = await fetch(featuredUrl, {
        signal: options?.signal,
        headers: environment.headers,
    });

    if (!response.ok) {
        throw new HTTPError(featuredUrl, response.status);
    }

    const json = await response.json() as any;
    const projects: ProjectSummary[] = [];
    const projectIds = new Set();

    const categoryMap: Record<string, string[]> = {
        'featured': ['community_featured_projects'],
        'featured/featured': ['community_featured_projects'],
        'featured/mostremixed': ['community_most_remixed_projects'],
        'featured/remix': ['community_most_remixed_projects'],
        'featured/remixed': ['community_most_remixed_projects'],
        'featured/remixes': ['community_most_remixed_projects'],
        'featured/design': ['scratch_design_studio'],
        'featured/designstudio': ['scratch_design_studio'],
        'featured/scratchdesignstudio': ['scratch_design_studio'],
    };

    let keysToLookAt = Object.keys(json);
    if (category) {
        const fullCategory = `featured/${category}`;
        if (categoryMap[fullCategory]) {
            keysToLookAt = categoryMap[fullCategory];
        } else if (categoryMap[category]) {
            keysToLookAt = categoryMap[category];
        }
    }

    for (const key of keysToLookAt) {
        const list = json[key];
        if (Array.isArray(list)) {
            for (const p of list) {
                if (p.type === 'project' && !projectIds.has(p.id)) {
                    projects.push({
                        id: p.id,
                        title: p.title,
                        author: p.creator || (p.author && p.author.username),
                    });
                    projectIds.add(p.id);
                }
            }
        }
    }
    return projects;
};
