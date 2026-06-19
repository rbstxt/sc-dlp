import { fetchWithProxy as fetch } from "../fetch-wrapper.js";
import kleur from "kleur";
import * as cliProgress from "cli-progress";
import * as SBDL from "../export-node.js";
import { ParsedArgs } from "./types.js";
import { extractProjectID, isURL, logError } from "./utils.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./download/logger.js";
import { saveProjectFile } from "./download/persistence.js";
import { downloadThumbnail } from "./download/thumbnail.js";
import { resolveConflict } from "./download/conflict.js";
import environment from "../environment.js";

export const makeDownloader = (parsedArgs: ParsedArgs, multibar: cliProgress.MultiBar) => {
    const config = loadConfig();
    const logger = createLogger(multibar, parsedArgs);

    return async (projectInfo: any) => {
        const projectArgument = projectInfo.id;
        const currentId = extractProjectID(projectArgument.toString()) || projectArgument.toString();

        let lastType: string | null = null;
        let currentBar: any = null;

        const finalizeCurrentBar = () => {
            if (currentBar) {
                currentBar.update(currentBar.getTotal(), { info: "Complete" });
                currentBar.stop();
                multibar.remove(currentBar);
                currentBar = null;
            }
        };

        logger.logInfo(`ID: ${currentId}`);
        let hasLoggedTitle = false;
        const logTitle = (title: string) => {
            if (hasLoggedTitle || !title) return;
            hasLoggedTitle = true;
            logger.logInfo(`Title: ${kleur.bold(title)}`);
        };

        if (projectInfo.title) {
            logTitle(projectInfo.title);
        }

        const onProgress: SBDL.Options["onProgress"] = (type, loaded, total, info) => {
            if (type !== lastType) {
                finalizeCurrentBar();

                if (type === "assets") {
                    logger.logAssets(`Fetching assets...`);
                    if (total > 0) {
                        currentBar = multibar.create(total, 0, {
                            id: kleur.cyan("[assets]".padEnd(12)),
                            type: "assets",
                        });
                    }
                } else if (type === "compress") {
                    logger.logCompress(`Compressing project...`);
                    currentBar = multibar.create(100, 0, {
                        id: kleur.yellow("[compress]".padEnd(12)),
                        type: "files",
                    });
                } else if (type === "project") {
                    logger.logMetadata(`Downloading project JSON...`);
                } else if (type === "mapping") {
                    logger.logMapping(info || "Processing asset mapping...");
                }
                lastType = type;
            }

            if (currentBar) {
                if (type === "compress") {
                    const value = total === 1 ? Math.floor(loaded * 100) : loaded;
                    currentBar.update(Math.min(100, value), { info: info || "" });
                } else {
                    currentBar.update(loaded, { info: info || "" });
                }
            }

            if (type === "metadata" && loaded === total && info) {
                logTitle(info);
            }
        };

        const options: SBDL.Options = {
            onProgress,
            skipAssets: parsedArgs.noAssets || parsedArgs.jsonOnly,
            assetRetries: parsedArgs.retries,
            token: config.token,
            sessionId: config.sessionId,
            page: parsedArgs.page || undefined,
            projectToken: parsedArgs.projectToken || projectInfo.projectToken,
        };

        logger.logDebug(`Processing ${projectArgument} (ID: ${currentId})`);

        let downloadedProject: SBDL.DownloadedProject;
        try {
            let metadata;
            let isTurboWarp = false;
            let displayTitle = projectInfo.title || "";

            const isUUID = (id: any) => /^[0-9a-f-]{36}$/i.test(String(id));
            isTurboWarp = isUUID(currentId);

            // 1. Resolve Conflict Early if title is already known
            if (displayTitle) {
                const titleWithId = (projectInfo.title && currentId) ? `${projectInfo.title} (${currentId})` : displayTitle;
                const extension = parsedArgs.format || (parsedArgs.jsonOnly ? "json" : "sb3");
                const finalPath = await resolveConflict(titleWithId, extension, parsedArgs);
                if (!finalPath) {
                    logger.logInfo(`Skipping project ${kleur.bold(titleWithId)} (user choice)`);
                    return;
                }
                (projectInfo as any).finalPath = finalPath; // Store to reuse later
            }

            if (projectInfo.projectUrl) {
                try {
                    const project = await SBDL.downloadProjectFromURL(projectInfo.projectUrl, options);
                    return project;
                } catch (e: any) {
                    logger.logErrorMsg(`Downloading project from URL: ${projectInfo.projectUrl}\n${e.stack || e.message}`);
                    throw e;
                }
            }

            // 2. Fetch Metadata if needed
            if (currentId && (typeof currentId === 'number' || /^\d+$/.test(currentId))) {
                onProgress("metadata", 0, 1);
                metadata = await SBDL.getProjectMetadata(currentId, options);
                const titleWithId = `${metadata.title} (${currentId})`;
                onProgress("metadata", 1, 1, titleWithId);
                displayTitle = titleWithId;
            } else if (isTurboWarp) {
                onProgress("metadata", 0, 1);
                metadata = await SBDL.getTurboWarpMetadata(String(currentId), options);
                const titleWithId = `${metadata.title} (${currentId})`;
                onProgress("metadata", 1, 1, titleWithId);
                displayTitle = titleWithId;
            } else if (isURL(projectArgument.toString())) {
                if (!displayTitle) displayTitle = "Project";
            }

            // 3. Resolve Conflict now if not already resolved
            let finalPath = (projectInfo as any).finalPath;
            if (!finalPath) {
                const extension = parsedArgs.format || (parsedArgs.jsonOnly ? "json" : "sb3");
                finalPath = await resolveConflict(displayTitle, extension, parsedArgs);
                if (!finalPath) {
                    logger.logInfo(`Skipping project ${kleur.bold(displayTitle)} (user choice)`);
                    return;
                }
            }

            // 4. Proceed with actual download
            if (currentId && (typeof currentId === 'number' || /^\d+$/.test(currentId))) {
                if (parsedArgs.jsonOnly) {
                    const token = options.projectToken || (metadata as any).project_token;
                    const fullUrl = `${config.urls.projects}/${currentId}${token ? `?token=${token}` : ""}`;
                    logger.logDebug(`Downloading JSON from ${fullUrl}`);
                    onProgress("project", 0, 1);
                    const response = await fetch(fullUrl, {
                        signal: options.signal,
                        // DO NOT send sessionId here
                        headers: environment.headers
                    });
                    onProgress("project", 1, 1);
                    const json = await response.json();
                    downloadedProject = {
                        title: (metadata as any).title,
                        type: "json" as any,
                        arrayBuffer: new TextEncoder().encode(JSON.stringify(json, null, 2)).buffer,
                        modified: ((metadata as any).history ? (metadata as any).history.modified : null) as string | null,
                        created: ((metadata as any).history ? (metadata as any).history.created : null) as string | null,
                        shared: ((metadata as any).history ? (metadata as any).history.shared : null) as string | null,
                    } as SBDL.DownloadedProject;
                } else {
                    logger.logDebug(`Downloading project ${currentId}...`);
                    downloadedProject = await SBDL.downloadProjectFromID(currentId, options);
                }
            } else if (isTurboWarp) {
                if (parsedArgs.jsonOnly) {
                    const projectUrl = `${config.urls.turbowarpApi}/projects/${currentId}`;
                    logger.logDebug(`Downloading JSON from ${projectUrl}`);
                    onProgress("project", 0, 1);
                    const response = await fetch(projectUrl, {
                        signal: options.signal,
                        headers: environment.headers
                    });
                    onProgress("project", 1, 1);
                    const json = await response.json();
                    downloadedProject = {
                        title: (metadata as any).title,
                        type: "json" as any,
                        arrayBuffer: new TextEncoder().encode(JSON.stringify(json, null, 2)).buffer,
                    } as SBDL.DownloadedProject;
                } else {
                    logger.logDebug(`Downloading TurboWarp project ${currentId}...`);
                    downloadedProject = await SBDL.downloadTurboWarpProject(String(currentId), options);
                }
            }
            else if (isURL(projectArgument.toString())) {
                logger.logDebug(`Downloading from URL ${projectArgument}...`);
                downloadedProject = await SBDL.downloadProjectFromURL(projectArgument.toString(), options);
            } else {
                throw new Error(`Don't know how to interpret project: ${projectArgument}`);
            }

            finalizeCurrentBar();

            const finalDisplayTitle = downloadedProject.title ? (currentId ? `${downloadedProject.title} (${currentId})` : downloadedProject.title) : (currentId ? currentId.toString() : "Project");

            const filename = await saveProjectFile(downloadedProject, finalPath, parsedArgs);
            logger.logInfo(`Destination: ${kleur.bold(filename)}`);

            if (currentId && (typeof currentId === 'number' || /^\d+$/.test(currentId))) {
                try {
                    await downloadThumbnail(currentId, finalDisplayTitle, parsedArgs, options, downloadedProject, logger.logSuccess);
                } catch (thumbErr: any) {
                    logger.logWarning(`Failed to download thumbnail: ${thumbErr.message}`);
                    logError(thumbErr, `Thumbnail download: ${projectArgument}`);
                }
            }

            logger.logSuccess(`Downloaded: ${kleur.bold(finalDisplayTitle)}`);
        } catch (err: any) {
            finalizeCurrentBar();
            logger.logErrorMsg(`Failed to download ${projectArgument}: ${err.message}`);
            if (parsedArgs.verbose) {
                multibar.log(kleur.gray(err.stack || String(err)) + "\n");
            }
            logError(err, `Project download: ${projectArgument}`);
        } finally {
            finalizeCurrentBar();
        }
    };
};
