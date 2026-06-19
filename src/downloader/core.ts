import JSZip from "@turbowarp/jszip";
import * as ExtendedJSON from "@turbowarp/json";
import {
    Options,
    DownloadedProject,
    SB2Project,
    SB3Project,
} from "./types.js";
import {
    parseOptions,
    throwIfAborted,
    isScratch1Project,
    isProbablyJSON,
    identifyProjectTypeFromJSON,
    safeParseProjectJSON
} from "./utils.js";
import { downloadScratch2 } from "./sb2.js";
import { downloadScratch3 } from "./sb3.js";
import { generateZip } from "./zip.js";
import { getProjectTitleFromURL } from "./metadata.js";

export const downloadProjectFromJSON = async (projectData: any, options?: Options): Promise<DownloadedProject> => {
    options = parseOptions(options);

    let originalText: string | null = null;
    if (typeof projectData === "string") {
        originalText = projectData;
        const result = safeParseProjectJSON(projectData, ExtendedJSON);
        projectData = result.data;
    }

    const type = identifyProjectTypeFromJSON(projectData);

    let result: { zip: JSZip, downloadedAssets: number, modifiedJSON: boolean };
    if (type === "sb3") {
        result = await downloadScratch3(projectData, null, options);
    } else if (type === "sb2") {
        result = await downloadScratch2(projectData, null, options);
    } else {
        throw new Error(`Unknown project type: ${type}`);
    }
    const downloadedZip = result.zip;

    if (originalText !== null && !result.modifiedJSON) {
        // preserve brokenness
        downloadedZip.file("project.json", originalText);
    }

    throwIfAborted(options);

    const zippedProject = await generateZip(downloadedZip, options);
    throwIfAborted(options);

    return {
        title: "",
        type,
        arrayBuffer: zippedProject,
    };
};

export const downloadProjectFromBuffer = async (input: ArrayBuffer | ArrayBufferView, options?: Options): Promise<DownloadedProject> => {
    options = parseOptions(options);

    throwIfAborted(options);

    let buffer: ArrayBuffer;
    if (ArrayBuffer.isView(input)) {
        buffer = (input.buffer as ArrayBuffer).slice(
            input.byteOffset,
            input.byteOffset + input.byteLength,
        );
    } else {
        buffer = input as ArrayBuffer;
    }
    const uint8array = new Uint8Array(buffer);

    if (isProbablyJSON(uint8array)) {
        const text = new TextDecoder().decode(buffer);
        return downloadProjectFromJSON(text, options);
    }

    if (isScratch1Project(uint8array)) {
        return {
            title: "",
            type: "sb",
            arrayBuffer: buffer,
        };
    }

    let zip: JSZip;
    let needToReZip = !!options.date;
    try {
        zip = await JSZip.loadAsync(buffer);
    } catch (e) {
        throw new Error("Cannot parse project: not a zip or sb");
    }

    throwIfAborted(options);

    // Normalize zip structure by flattening subdirectories
    for (const oldPath of Object.keys(zip.files)) {
        if (oldPath.endsWith("/") || !oldPath.includes("/")) {
            continue;
        }

        const parts = oldPath.split("/");
        const newPath = parts[parts.length - 1];

        if (zip.file(newPath)) {
            throw new Error(`Path conflict ${oldPath}`);
        }

        zip.file(newPath, await zip.file(oldPath)!.async("uint8array"));
        zip.remove(oldPath);
        needToReZip = true;

        throwIfAborted(options);
    }

    for (const path of Object.keys(zip.files)) {
        if (path.includes("/")) {
            zip.remove(path);
            needToReZip = true;
        }
    }

    const projectDataFile = zip.file("project.json");
    if (!projectDataFile) {
        throw new Error("project.json is missing");
    }

    const projectDataText = await projectDataFile.async("text");
    const { data: projectData, isFixed: projectDataWasFixed } = safeParseProjectJSON(projectDataText, ExtendedJSON);
    const type = identifyProjectTypeFromJSON(projectData);

    throwIfAborted(options);

    let downloadResult: { downloadedAssets: number, modifiedJSON: boolean };
    if (type === "sb3") {
        downloadResult = await downloadScratch3(projectData as SB3Project, zip, options);
    } else if (type === "sb2") {
        downloadResult = await downloadScratch2(projectData as SB2Project, zip, options);
    } else {
        throw new Error(`Unknown project type: ${type}`);
    }

    if (projectDataWasFixed && !downloadResult.modifiedJSON) {
        zip.file("project.json", projectDataText);
    }

    if (downloadResult.downloadedAssets > 0 || downloadResult.modifiedJSON) {
        needToReZip = true;
    }

    throwIfAborted(options);

    if (needToReZip) {
        buffer = await generateZip(zip, options);
        throwIfAborted(options);
    }

    return {
        title: "",
        type: type!,
        arrayBuffer: buffer,
    };
};
