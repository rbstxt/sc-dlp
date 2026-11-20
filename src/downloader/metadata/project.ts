import { fetchWithProxy as fetch } from "../../fetch-wrapper.js";
import environment from "../../environment.js";
import { CanNotAccessProjectError, HTTPError } from "../../errors.js";
import { Options, ProjectMetadata } from "../types.js";
import { parseOptions, isAbortError } from "../utils.js";

import { loadConfig } from "../../cli/config.js";

export const getProjectMetadata = async (id: string | number, options?: Options): Promise<ProjectMetadata> => {
    options = parseOptions(options);
    const config = loadConfig();
    const urls = environment.canAccessScratchAPI
        ? [`${config.urls.api}/projects/${id}`]
        : [
            // Internal default proxies for environments with CORS restrictions
            `https://trampoline.turbowarp.org/api/projects/${id}`,
            `https://trampoline.turbowarp.xyz/api/projects/${id}`,
        ];
    let firstError = null;
    for (let url of urls) {
        if (options.refresh) {
            url += `${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
        }
        try {
            const headers: Record<string, string> = { ...environment.headers };

            // Never send authentication credentials to third-party CORS trampoline proxies.
            if (environment.canAccessScratchAPI) {
                const sessionId = options.sessionId || config.sessionId;
                const token = options.token || config.token;

                if (token) {
                    headers["x-token"] = token;
                }
                if (sessionId) {
                    headers["Cookie"] = `scratchsessionsid=${sessionId}; scratchcsrftoken=a; scratchlanguage=en`;
                    headers["x-csrftoken"] = "a";
                    headers["x-requested-with"] = "XMLHttpRequest";
                    headers["Referer"] = config.urls.site.replace("/site-api", "/");
                }
            }
            const response = await fetch(url, {
                signal: options.signal,
                headers,
            });
            if (response.status === 404) {
                throw new CanNotAccessProjectError(
                    `${id} is unshared or does not exist`,
                );
            }
            if (!response.ok) {
                throw new HTTPError(url, response.status);
            }
            const json = await response.json() as any;
            return json;
        } catch (e) {
            if (e instanceof CanNotAccessProjectError || isAbortError(e)) {
                throw e;
            } else if (!firstError) {
                firstError = e;
            }
        }
    }
    throw firstError;
};

export const getProjectTitleFromURL = (url: string) => {
    let pathname = url;
    try {
        pathname = new URL(url).pathname;
    } catch {
        pathname = url.split(/[?#]/)[0];
    }
    const match = pathname.match(/\/([^\/]+)\.sb[23]?$/i);
    if (match) {
        try {
            return decodeURIComponent(match[1]);
        } catch {
            return match[1];
        }
    }
    return "";
};
