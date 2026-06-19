import fs from "node:fs/promises";
import path from "node:path";
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
    logSuccess: (msg: string) => void
) => {
    if (!parsedArgs.writeThumbnail || !currentId) return;

    try {
        const [width, height] = parsedArgs.thumbnailSize.split("x");
        const thumbUrl = `https://uploads.scratch.mit.edu/get_image/project/${currentId}_${width}x${height}.png`;
        const thumbResponse = await fetch(thumbUrl, {
            signal: options.signal,
        });
        if (thumbResponse.ok) {
            const thumbBuffer = await thumbResponse.arrayBuffer();
            const thumbFilename = path.resolve(
                `${sanitizeFileName(title)}.png`,
            );
            await fs.writeFile(thumbFilename, new Uint8Array(thumbBuffer));

            if (
                parsedArgs.mtime &&
                (downloadedProject.modified || downloadedProject.created)
            ) {
                await saveFileMtime(thumbFilename, downloadedProject.created, downloadedProject.modified);
            }
            logSuccess(`Thumbnail saved: ${title}.png`);
        }
    } catch (thumbErr: any) {
        throw thumbErr;
    }
};
