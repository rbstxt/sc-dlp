import { Options, ProjectSummary } from "../../types.js";
import { fetchWithProxy as fetch } from "../../../fetch-wrapper.js";
import environment from "../../../environment.js";

export const fetchDeleteAccountProjects = async (options?: Options): Promise<ProjectSummary[]> => {
    const url = "https://scratch.mit.edu/accounts/settings/delete_account_confirmation/";
    const headers: Record<string, string> = { ...environment.headers };

    if (!options?.sessionId) {
        if (options?.token) {
            throw new Error("Insufficient permissions. Account deletion confirmation requires a full session login (username/password or session ID).");
        }
        throw new Error("You must be logged in to access account deletion confirmation. Run 'sc-dlp login' first.");
    }

    headers["Cookie"] = `scratchsessionsid=${options.sessionId}; scratchlanguage=${options.language || "en"}`;

    const response = await fetch(url, {
        signal: options?.signal,
        headers,
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch account deletion page: ${response.status}`);
    }

    const html = await response.text();
    const projects: ProjectSummary[] = [];
    const projectRegex = /href="\/projects\/(\d+)\/"/g;
    const seenIds = new Set<string>();

    let match;
    while ((match = projectRegex.exec(html)) !== null) {
        const id = match[1];
        if (!seenIds.has(id)) {
            seenIds.add(id);
            projects.push({
                id: id as any,
                title: "", // Title is not easily available in the same way without more parsing
                author: "unknown",
            });
        }
    }

    return projects;
};
