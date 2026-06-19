import { Options, ProjectSummary } from "../types.js";
import { handleShorthand } from "./playlist/shorthand.js";
import { handleURL } from "./playlist/url.js";

export const getProjectsFromPlaylistURL = async (url: string, options?: Options): Promise<ProjectSummary[] | null> => {
    const shorthandResult = await handleShorthand(url, options, getProjectsFromPlaylistURL);
    if (shorthandResult) return shorthandResult;

    return handleURL(url, options);
}
