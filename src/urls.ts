import { loadConfig } from "./cli/config.js";

/**
 * Centrally managed base URLs for all Scratch and TurboWarp services.
 * These can be overridden via the sc-dlp config command.
 */
export const getUrls = () => {
    const config = loadConfig();
    const urls = config.urls;
    const language = config.language || "en";

    return {
        API: urls.api,
        SITE: urls.site,
        ASSETS: urls.assets,
        PROJECTS: urls.projects,
        LOGIN: urls.login,
        PROJECTS_ALL: urls.projectsAll,
        TURBOWARP_SHARE: urls.turbowarpShare,
        TURBOWARP_API: urls.turbowarpApi,
        LANGUAGE: language,
    };
};

export const URLS = getUrls();
