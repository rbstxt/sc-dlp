import fs from "node:fs/promises";
import path from "node:path";
import { fetchWithProxy as fetch } from "../fetch-wrapper.js";
import kleur from "kleur";
import * as SBDL from "../export-node.js";
import { CanNotAccessProjectError, HTTPError } from "../errors.js";
import { ParsedArgs } from "./types.js";
import { extractProjectID, isURL, sanitizeFileName } from "./utils.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./download/logger.js";
import { saveProjectFile } from "./download/persistence.js";
import { downloadThumbnail } from "./download/thumbnail.js";
import { createConflictResolver, ConflictResolver } from "./download/conflict.js";
import { DisplayManager, ProgressBarHandle, formatProjectBarId } from "./download/display.js";
import environment from "../environment.js";

export type DownloadStatus = "downloaded" | "skipped" | "failed";

const formatShortId = (id: string | number): string => {
    const str = String(id);
    if (/^[0-9a-f-]{36}$/i.test(str)) {
        return str.slice(0, 8);
    }
    if (isURL(str)) {
        try {
            const base = path.basename(new URL(str).pathname);
            return base.length > 10 ? base.slice(0, 9) + "…" : base || "url";
        } catch {
            return "url";
        }
    }
    return str.length > 10 ? str.slice(0, 9) + "…" : str;
};

const findExistingExtension = async (title: string, candidates: string[]): Promise<string | null> => {
    const safeTitle = sanitizeFileName(title || "Project") || "Project";
    for (const ext of candidates) {
        const candidatePath = path.resolve(`${safeTitle}.${ext}`);
        try {
            await fs.access(candidatePath);
            return ext;
        } catch {
            // Try next candidate
        }
    }
    return null;
};

export const makeDownloader = (
    parsedArgs: ParsedArgs,
    display: DisplayManager,
    conflictResolver: ConflictResolver = createConflictResolver(display),
) => {
    const config = loadConfig();
    const isParallel = parsedArgs.jobs > 1;

    return async (projectInfo: any, workerBar?: ProgressBarHandle): Promise<DownloadStatus> => {
        const projectArgument = projectInfo.projectUrl || projectInfo.id;
        const currentId = projectInfo.id
            ? extractProjectID(projectInfo.id.toString(), config) || projectInfo.id.toString()
            : "";

        const shortTag = formatShortId(currentId || projectArgument);
        const logger = createLogger(display, parsedArgs, isParallel ? shortTag : undefined);
        const projectBarId = formatProjectBarId(currentId || shortTag);

        const stageBarId = (stage: string): string => {
            if (isParallel) return projectBarId;
            if (stage === "assets") return kleur.cyan("[assets]".padEnd(12));
            if (stage === "compress") return kleur.yellow("[compress]".padEnd(12));
            if (stage === "project") return kleur.magenta("[project]".padEnd(12));
            return kleur.blue("[metadata]".padEnd(12));
        };

        let lastType: string | null = null;
        let reservedPath: string | null = null;

        if (currentId) {
            logger.logInfo(`ID: ${currentId}`);
        } else if (projectInfo.projectUrl) {
            logger.logInfo(`URL: ${projectInfo.projectUrl}`);
        }

        let hasLoggedTitle = false;
        const logTitle = (title: string) => {
            if (hasLoggedTitle || !title) return;
            hasLoggedTitle = true;
            logger.logInfo(`Title: ${kleur.bold(title)}`);
        };

        if (projectInfo.title) {
            logTitle(projectInfo.title);
        }

        workerBar?.setTotal(1);
        workerBar?.update(0, { id: stageBarId("metadata"), info: "starting..." });

        const onProgress: SBDL.Options["onProgress"] = (type, loaded, total, info) => {
            if (type !== lastType) {
                if (type === "assets") {
                    logger.logAssets("Fetching assets...");
                    if (total > 0) {
                        workerBar?.setTotal(total);
                        workerBar?.update(loaded, {
                            id: stageBarId("assets"),
                            info: info ? `assets (${info})` : "assets",
                        });
                    }
                } else if (type === "compress") {
                    logger.logCompress("Compressing project...");
                    workerBar?.setTotal(100);
                    workerBar?.update(0, {
                        id: stageBarId("compress"),
                        info: "compress",
                    });
                } else if (type === "project") {
                    logger.logMetadata("Downloading project JSON...");
                    workerBar?.setTotal(1);
                    workerBar?.update(0, {
                        id: stageBarId("project"),
                        info: "project",
                    });
                } else if (type === "mapping") {
                    logger.logMapping(info || "Processing asset mapping...");
                } else if (type === "metadata") {
                    workerBar?.setTotal(1);
                    workerBar?.update(0, {
                        id: stageBarId("metadata"),
                        info: "metadata",
                    });
                }
                lastType = type;
            }

            if (type === "compress") {
                const value = total === 1 ? Math.floor(loaded * 100) : loaded;
                workerBar?.update(Math.min(100, value), {
                    id: stageBarId("compress"),
                    info: info || "compress",
                });
            } else if (type === "assets" && total > 0) {
                workerBar?.setTotal(total);
                workerBar?.update(loaded, {
                    id: stageBarId("assets"),
                    info: info ? `assets (${info})` : "assets",
                });
            } else if (type === "project") {
                workerBar?.update(loaded, {
                    id: stageBarId("project"),
                    info: "project",
                });
            } else if (type === "metadata") {
                workerBar?.update(loaded, {
                    id: stageBarId("metadata"),
                    info: "metadata",
                });
                if (loaded === total && info) {
                    logTitle(info);
                }
            }
        };

        const options: SBDL.Options = {
            onProgress,
            onWarning: (msg) => logger.logWarning(msg),
            skipAssets: parsedArgs.noAssets || parsedArgs.jsonOnly,
            assetRetries: parsedArgs.retries,
            token: config.token,
            sessionId: config.sessionId,
            page: parsedArgs.page || undefined,
            projectToken: parsedArgs.projectToken || projectInfo.projectToken,
        };

        logger.logDebug(`Processing ${projectArgument} (ID: ${currentId || "none"})`);

        try {
            let metadata: any;
            const isNumericId = Boolean(currentId && (typeof currentId === "number" || /^\d+$/.test(currentId)));
            const isTurboWarp = Boolean(currentId && /^[0-9a-f-]{36}$/i.test(String(currentId)));
            let displayTitle = projectInfo.title
                ? (currentId ? `${projectInfo.title} (${currentId})` : projectInfo.title)
                : "";

            const explicitExt = parsedArgs.format || (parsedArgs.jsonOnly ? "json" : null);
            let earlyResolvedExt: string | null = null;

            const tryEarlyConflictCheck = async (titleToCheck: string): Promise<boolean> => {
                if (!titleToCheck || reservedPath) return true;
                if (explicitExt) {
                    const resolved = await conflictResolver.resolve(titleToCheck, explicitExt, parsedArgs);
                    if (!resolved) {
                        logger.logInfo(`Skipping project ${kleur.bold(titleToCheck)} (conflict: skip)`);
                        return false;
                    }
                    reservedPath = resolved;
                    earlyResolvedExt = explicitExt;
                    return true;
                }

                // Auto-extension mode: only check early if a matching file already exists on disk
                const existingExt = await findExistingExtension(titleToCheck, ["sb3", "sb2", "sb"]);
                if (existingExt) {
                    const resolved = await conflictResolver.resolve(titleToCheck, existingExt, parsedArgs);
                    if (!resolved) {
                        logger.logInfo(`Skipping project ${kleur.bold(titleToCheck)} (conflict: skip)`);
                        return false;
                    }
                    reservedPath = resolved;
                    earlyResolvedExt = existingExt;
                }
                return true;
            };

            // 1. Resolve Conflict Early if title is already known (e.g. from playlist)
            if (displayTitle && !projectInfo.projectUrl) {
                const shouldProceed = await tryEarlyConflictCheck(displayTitle);
                if (!shouldProceed) {
                    workerBar?.setTotal(1);
                    workerBar?.update(1, { id: projectBarId, info: "skipped" });
                    return "skipped";
                }
            }

            // 2. Fetch Metadata if needed (skipped for direct projectUrl / arbitrary URLs)
            if (!projectInfo.projectUrl) {
                if (isNumericId) {
                    onProgress("metadata", 0, 1);
                    metadata = await SBDL.getProjectMetadata(currentId, options);
                    const titleWithId = `${metadata.title} (${currentId})`;
                    onProgress("metadata", 1, 1, titleWithId);
                    displayTitle = titleWithId;
                    options.prefetchedMetadata = metadata;
                } else if (isTurboWarp) {
                    onProgress("metadata", 0, 1);
                    metadata = await SBDL.getTurboWarpMetadata(String(currentId), options);
                    const titleWithId = `${metadata.title} (${currentId})`;
                    onProgress("metadata", 1, 1, titleWithId);
                    displayTitle = titleWithId;
                    options.prefetchedMetadata = metadata;
                }
            }

            // 3. Resolve Conflict Early now that metadata title is available
            if (displayTitle && !reservedPath && !projectInfo.projectUrl) {
                const shouldProceed = await tryEarlyConflictCheck(displayTitle);
                if (!shouldProceed) {
                    workerBar?.setTotal(1);
                    workerBar?.update(1, { id: projectBarId, info: "skipped" });
                    return "skipped";
                }
            }

            // 4. Proceed with actual download
            let downloadedProject: SBDL.DownloadedProject;
            if (projectInfo.projectUrl) {
                logger.logDebug(`Downloading from project_url ${projectInfo.projectUrl}...`);
                downloadedProject = await SBDL.downloadProjectFromURL(projectInfo.projectUrl, options);
            } else if (isNumericId) {
                if (parsedArgs.jsonOnly) {
                    const token = options.projectToken || metadata?.project_token;
                    const fullUrl = `${config.urls.projects}/${currentId}${token ? `?token=${token}` : ""}`;
                    logger.logDebug(`Downloading JSON from ${fullUrl}`);
                    onProgress("project", 0, 1);
                    const response = await fetch(fullUrl, {
                        signal: options.signal,
                        // DO NOT send sessionId here
                        headers: environment.headers,
                    });
                    if (response.status === 404 || response.status === 403) {
                        throw new CanNotAccessProjectError(`Unexpected status ${response.status} while fetching project ${currentId}`);
                    }
                    if (!response.ok) {
                        throw new HTTPError(fullUrl, response.status);
                    }
                    const json = await response.json();
                    onProgress("project", 1, 1);
                    downloadedProject = {
                        title: metadata?.title || String(currentId),
                        type: "json" as any,
                        arrayBuffer: new TextEncoder().encode(JSON.stringify(json, null, 2)).buffer,
                        modified: metadata?.history?.modified ?? undefined,
                        created: metadata?.history?.created ?? undefined,
                        shared: metadata?.history?.shared ?? undefined,
                    };
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
                        headers: environment.headers,
                    });
                    if (!response.ok) {
                        throw new HTTPError(projectUrl, response.status);
                    }
                    const json = await response.json();
                    onProgress("project", 1, 1);
                    downloadedProject = {
                        title: metadata?.title || String(currentId),
                        type: "json" as any,
                        arrayBuffer: new TextEncoder().encode(JSON.stringify(json, null, 2)).buffer,
                    };
                } else {
                    logger.logDebug(`Downloading TurboWarp project ${currentId}...`);
                    downloadedProject = await SBDL.downloadTurboWarpProject(String(currentId), options);
                }
            } else if (isURL(String(projectArgument))) {
                logger.logDebug(`Downloading from URL ${projectArgument}...`);
                downloadedProject = await SBDL.downloadProjectFromURL(String(projectArgument), options);
            } else {
                throw new Error(`Don't know how to interpret project: ${projectArgument}`);
            }

            // 5. Determine exact final filename using the actual downloaded project type
            const finalDisplayTitle = downloadedProject.title
                ? (currentId && !projectInfo.projectUrl ? `${downloadedProject.title} (${currentId})` : downloadedProject.title)
                : (displayTitle || (currentId ? currentId.toString() : "Project"));

            const actualExtension = explicitExt || downloadedProject.type || "sb3";

            if (reservedPath && earlyResolvedExt !== actualExtension) {
                // Early check assumed a different extension than the actual project type (e.g. sb2 vs sb3)
                conflictResolver.release(reservedPath);
                reservedPath = null;
            }

            let finalPath: string | null = reservedPath;
            if (!finalPath) {
                finalPath = await conflictResolver.resolve(finalDisplayTitle, actualExtension, parsedArgs);
                if (!finalPath) {
                    logger.logInfo(`Skipping project ${kleur.bold(finalDisplayTitle)} (conflict: skip)`);
                    workerBar?.setTotal(1);
                    workerBar?.update(1, { id: projectBarId, info: "skipped" });
                    return "skipped";
                }
                reservedPath = finalPath;
            }

            const filename = await saveProjectFile(downloadedProject, finalPath, parsedArgs);
            logger.logInfo(`Destination: ${kleur.bold(filename)}`);

            if (isNumericId && !projectInfo.projectUrl) {
                try {
                    await downloadThumbnail(
                        currentId,
                        finalDisplayTitle,
                        parsedArgs,
                        options,
                        downloadedProject,
                        logger.logSuccess,
                        filename,
                    );
                } catch (thumbErr: any) {
                    logger.logWarning(`Failed to download thumbnail: ${thumbErr.message}`);
                    if (parsedArgs.verbose && thumbErr.stack) {
                        logger.logDebug(thumbErr.stack);
                    }
                }
            }

            workerBar?.setTotal(1);
            workerBar?.update(1, { id: projectBarId, info: "done" });
            logger.logSuccess(`Downloaded: ${kleur.bold(finalDisplayTitle)}`);
            return "downloaded";
        } catch (err: any) {
            if (reservedPath) {
                conflictResolver.release(reservedPath);
                reservedPath = null;
            }
            workerBar?.setTotal(1);
            workerBar?.update(0, { id: projectBarId, info: "failed" });
            logger.logErrorMsg(`Failed to download ${projectArgument}: ${err.message}`);
            if (parsedArgs.verbose && err.stack) {
                display.log(kleur.gray(err.stack) + "\n");
            }
            return "failed";
        }
    };
};
