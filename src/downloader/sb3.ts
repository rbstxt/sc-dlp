import JSZip from "@turbowarp/jszip";
import { Options, SB3Project, SB3Asset } from "./types.js";
import { makeAssetProgressTarget, flat, calculateMD5 } from "./utils.js";
import fetchAsset from "../fetch-asset.js";
import environment from "../environment.js";
import { storeProjectJSON } from "./zip.js";

/**
 * @param {SB3Project} projectData
 * @param {JSZip|null} zip
 * @param {Options} options
 * @returns {Promise<{zip: JSZip; downloadedAssets: number; modifiedJSON: boolean;}>}
 */
export const downloadScratch3 = async (projectData: SB3Project, zip: JSZip | null, options: Options): Promise<{ zip: JSZip; downloadedAssets: number; modifiedJSON: boolean; }> => {
    const zipInstance = zip || new JSZip();

    const targets = projectData.targets;
    const costumes = flat(targets.map((t) => t.costumes || []));
    const sounds = flat(targets.map((t) => t.sounds || []));

    /**
     * @param {SB3Asset[]} assets
     * @returns {string[]}
     */
    const prepareAssets = (assets: SB3Asset[]) => {
        const knownMd5exts = new Set<string>();
        const missing: string[] = [];

        for (const asset of assets) {
            const md5ext = asset.md5ext || `${asset.assetId}.${asset.dataFormat}`;
            if (knownMd5exts.has(md5ext)) continue;
            if (zipInstance.file(md5ext)) continue;
            knownMd5exts.add(md5ext);
            missing.push(md5ext);
        }

        return missing;
    };

    const assetsToDownload = prepareAssets([...costumes, ...sounds]);
    const progressTarget = makeAssetProgressTarget(options, assetsToDownload.length);

    /**
     * @param {string} md5ext
     * @returns {Promise<{path: string, data: ArrayBuffer}|null>}
     */
    const addFile = async (md5ext: string): Promise<{ path: string, data: ArrayBuffer } | null> => {
        progressTarget.fetching(md5ext);

        const assetId = options.assetMapping && options.assetMapping[md5ext] ? options.assetMapping[md5ext] : md5ext;
        const fetchUrl = options.assetHost!.replace("$id", assetId);

        const arrayBuffer = await fetchAsset(
            fetchUrl,
            {
                signal: options.signal,
                retries: options.assetRetries,
                headers: environment.headers,
            },
        );

        progressTarget.fetched(md5ext);

        if (!arrayBuffer) {
            return null;
        }

        const calculatedMd5 = calculateMD5(arrayBuffer);
        const lastDotIndex = md5ext.lastIndexOf(".");
        const originalMd5 = lastDotIndex !== -1 ? md5ext.substring(0, lastDotIndex) : md5ext;
        const extension = lastDotIndex !== -1 ? md5ext.substring(lastDotIndex) : "";
        let finalMd5ext = md5ext;

        if (calculatedMd5 !== originalMd5) {
            finalMd5ext = calculatedMd5 + extension;

            // Update project JSON to point to the new MD5
            for (const target of projectData.targets) {
                for (const asset of [...(target.costumes || []), ...(target.sounds || [])]) {
                    const currentMd5ext = asset.md5ext || `${asset.assetId}.${asset.dataFormat}`;
                    if (currentMd5ext === md5ext) {
                        asset.assetId = calculatedMd5;
                        asset.md5ext = finalMd5ext;
                    }
                }
            }
        }

        return {
            path: finalMd5ext,
            data: arrayBuffer,
        };
    };

    const filesToAdd = options.skipAssets
        ? []
        : (await Promise.all(assetsToDownload.map(addFile))).filter((file) => file !== null);

    const modifiedJSON = await storeProjectJSON(zipInstance, "sb3", projectData, options);

    // Add files to the zip at the end so the order will be consistent.
    for (const file of filesToAdd) {
        if (file) {
            zipInstance.file(file.path, file.data);
        }
    }

    return {
        zip: zipInstance,
        modifiedJSON,
        downloadedAssets: filesToAdd.length,
    };
};
