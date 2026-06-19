import JSZip from "@turbowarp/jszip";
import * as ExtendedJSON from "@turbowarp/json";
import { Options, ProjectType } from "./types.js";
import { throwIfAborted } from "./utils.js";

/**
 * @param {JSZip} zip
 * @param {ProjectType} type
 * @param {any} projectData
 * @param {Options} options
 * @returns {Promise<boolean>} True if the zip was modified
 */
export const storeProjectJSON = async (zip: JSZip, type: ProjectType, projectData: any, options: Options): Promise<boolean> => {
    if (options.processJSON) {
        const newData = await options.processJSON(type, projectData);
        throwIfAborted(options);

        if (newData) {
            zip.file("project.json", ExtendedJSON.stringify(newData));
            return true;
        }
    }

    // If project.json is already in the zip, don't overwrite it as that would lose
    // possibly interesting data from sb2 projects with comments in the JSON.
    if (!zip.file("project.json")) {
        zip.file("project.json", ExtendedJSON.stringify(projectData));
        return true;
    }

    return false;
};

/**
 * @param {JSZip} zip
 * @param {Options} options
 * @returns {Promise<ArrayBuffer>}
 */
export const generateZip = async (zip: JSZip, options: Options): Promise<ArrayBuffer> => {
    const date = options.date || new Date("Fri, 31 Dec 2021 00:00:00 GMT");
    for (const file of Object.values((zip as any).files)) {
        (file as any).date = date;
    }
    const result = await zip.generateAsync(
        {
            type: "arraybuffer",
            compression: options.compress !== false ? "DEFLATE" : "STORE",
        },
        (meta) => {
            if (options.onProgress) {
                options.onProgress("compress", meta.percent / 100, 1);
            }
        },
    );
    if (options.onProgress) {
        options.onProgress("compress", 1, 1);
    }
    return result;
};
