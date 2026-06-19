import fs from "node:fs/promises";
import path from "node:path";
import { sanitizeFileName } from "../utils.js";
import { ParsedArgs } from "../types.js";
import { DownloadedProject } from "../../downloader/types.js";

export const saveProjectFile = async (
    downloadedProject: DownloadedProject,
    finalPath: string,
    parsedArgs: ParsedArgs
) => {
    await fs.writeFile(
        finalPath,
        new Uint8Array(downloadedProject.arrayBuffer),
    );

    if (
        parsedArgs.mtime &&
        (downloadedProject.modified || downloadedProject.created)
    ) {
        const dateCreated = downloadedProject.created
            ? new Date(downloadedProject.created)
            : null;
        const dateModified = downloadedProject.modified
            ? new Date(downloadedProject.modified)
            : null;

        const atime =
            dateCreated && !isNaN(dateCreated.getTime())
                ? dateCreated
                : dateModified && !isNaN(dateModified.getTime())
                    ? dateModified
                    : new Date();
        const mtime =
            dateModified && !isNaN(dateModified.getTime())
                ? dateModified
                : dateCreated && !isNaN(dateCreated.getTime())
                    ? dateCreated
                    : new Date();

        await fs.utimes(finalPath, atime, mtime);
    }

    return finalPath;
};

export const saveFileMtime = async (filename: string, dateCreatedStr: string | null, dateModifiedStr: string | null) => {
    const dateCreated = dateCreatedStr ? new Date(dateCreatedStr) : null;
    const dateModified = dateModifiedStr ? new Date(dateModifiedStr) : null;

    const atime =
        dateCreated && !isNaN(dateCreated.getTime())
            ? dateCreated
            : dateModified && !isNaN(dateModified.getTime())
                ? dateModified
                : new Date();
    const mtime =
        dateModified && !isNaN(dateModified.getTime())
            ? dateModified
            : dateCreated && !isNaN(dateCreated.getTime())
                ? dateCreated
                : new Date();

    await fs.utimes(filename, atime, mtime);
};
