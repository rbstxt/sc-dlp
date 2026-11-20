import fs from "node:fs/promises";
import path from "node:path";
import { fetchWithProxy as fetch } from "../../fetch-wrapper.js";
import { HTTPError } from "../../errors.js";
import { sanitizeFileName } from "../utils.js";
import { ParsedArgs } from "../types.js";
import { Options } from "../../downloader/types.js";
import { saveFileMtime } from "./persistence.js";

export const downloadThumbnail = async (
    currentId: string | number,
    title: string,
    parsedArgs: ParsedArgs,
    options: Options,
    downloadedProject: any,
    logSuccess: (msg: string) => void,
    projectFilePath?: string
) => {
    if (!parsedArgs.writeThumbnail || !currentId) return;

    const sizeParts = (parsedArgs.thumbnailSize || "9999x9999").split("x");
    const width = sizeParts[0] || "9999";
    const height = sizeParts[1] || width;
    const thumbUrl = `https://uploads.scratch.mit.edu/get_image/project/${currentId}_${width}x${height}.png`;

    const thumbResponse = await fetch(thumbUrl, {
        signal: options.signal,
    });
    if (!thumbResponse.ok) {
        throw new HTTPError(thumbUrl, thumbResponse.status);
    }

    const thumbBuffer = await thumbResponse.arrayBuffer();
    const thumbFilename = projectFilePath
        ? path.join(path.dirname(projectFilePath), `${path.parse(projectFilePath).name}.png`)
        : path.resolve(`${sanitizeFileName(title)}.png`);

    await fs.writeFile(thumbFilename, new Uint8Array(thumbBuffer));

    if (
        parsedArgs.mtime &&
        (downloadedProject.modified || downloadedProject.created)
    ) {
        await saveFileMtime(thumbFilename, downloadedProject.created, downloadedProject.modified);
    }
    logSuccess(`Thumbnail saved: ${path.basename(thumbFilename)}`);
};
