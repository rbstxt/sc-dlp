import JSZip from "@turbowarp/jszip";
import { Options, SB2Project, SB2Costume, SB2Sound, SB2Sprite } from "./types.js";
import { makeAssetProgressTarget, flat, calculateMD5 } from "./utils.js";
import fetchAsset from "../fetch-asset.js";
import environment from "../environment.js";
import { storeProjectJSON } from "./zip.js";

/**
 * @param {SB2Project} projectData
 * @param {JSZip|null} zip
 * @param {Options} options
 * @returns {Promise<{zip: JSZip; downloadedAssets: number; modifiedJSON: boolean;}>}
 */
export const downloadScratch2 = async (projectData: SB2Project, zip: JSZip | null, options: Options): Promise<{ zip: JSZip; downloadedAssets: number; modifiedJSON: boolean; }> => {
    const zipInstance = zip || new JSZip();

    // sb2 files have two ways of storing references to files.
    // In the online editor they use md5 hashes ("md5ext" because they also have an extension).
    // In the offline editor they use separate integer file IDs for images and sounds.
    // We need the sb2 to use those integer file IDs, but the ones from the Scratch API don't have those, so we create them ourselves

    /**
     * @param {string} md5ext
     * @returns {string}
     */
    const getExtension = (md5ext: string) => md5ext.split(".")[1] || "";

    /** @type {SB2Sprite[]} */
    const targets = [
        projectData as (SB2Project | SB2Sprite),
        ...projectData.children.filter((c: any) => !c.listName && !c.target) as SB2Sprite[],
    ];
    const costumes = flat(targets.map((i) => i.costumes || []));
    const sounds = flat(targets.map((i) => i.sounds || []));

    const md5extToId = new Map<string, number>();
    const needToFetch: string[] = [];

    let largestCostumeId = -1;
    for (const costume of costumes) {
        const baseLayerExtension = getExtension(costume.baseLayerMD5) || "png";
        if (
            costume.baseLayerID >= 0 &&
            zipInstance.file(`${costume.baseLayerID}.${baseLayerExtension}`)
        ) {
            md5extToId.set(costume.baseLayerMD5, costume.baseLayerID);
            largestCostumeId = Math.max(largestCostumeId, costume.baseLayerID);
        }

        if (costume.textLayerMD5) {
            if (
                costume.textLayerID !== undefined && costume.textLayerID! >= 0 &&
                zipInstance.file(`${costume.textLayerID}.png`)
            ) {
                md5extToId.set(costume.textLayerMD5, costume.textLayerID);
                largestCostumeId = Math.max(largestCostumeId, costume.textLayerID!);
            }
        }
    }

    let largestSoundId = -1;
    for (const sound of sounds) {
        if (
            sound.soundID >= 0 &&
            zipInstance.file(`${sound.soundID}.${getExtension(sound.md5)}`)
        ) {
            md5extToId.set(sound.md5, sound.soundID);
            largestSoundId = Math.max(largestSoundId, sound.soundID);
        }
    }

    let costumeAccumulator = largestCostumeId === -1 ? 0 : largestCostumeId + 1;
    let soundAccumulator = largestSoundId === -1 ? 0 : largestSoundId + 1;
    const assignCostumeId = (md5ext: string) => {
        if (!md5extToId.has(md5ext)) {
            needToFetch.push(md5ext);
            md5extToId.set(md5ext, costumeAccumulator);
            costumeAccumulator++;
        }
        return md5extToId.get(md5ext);
    };
    const assignSoundId = (md5ext: string) => {
        if (!md5extToId.has(md5ext)) {
            needToFetch.push(md5ext);
            md5extToId.set(md5ext, soundAccumulator);
            soundAccumulator++;
        }
        return md5extToId.get(md5ext);
    };

    for (const costume of costumes) {
        if (costume.baseLayerMD5) {
            costume.baseLayerID = assignCostumeId(costume.baseLayerMD5)!;
        }
        if (costume.textLayerMD5) {
            costume.textLayerID = assignCostumeId(costume.textLayerMD5)!;
        }
    }
    for (const sound of sounds) {
        if (sound.md5) {
            sound.soundID = assignSoundId(sound.md5)!;
        }
    }

    const progressTarget = makeAssetProgressTarget(options, needToFetch.length);

    const fetchAndStoreAsset = async (md5ext: string, id: number): Promise<{ path: string, data: ArrayBuffer } | null> => {
        progressTarget.fetching(md5ext);
        const assetId = options.assetMapping && options.assetMapping[md5ext] ? options.assetMapping[md5ext] : md5ext;
        const arrayBuffer = await fetchAsset(
            options.assetHost!.replace("$id", assetId),
            {
                retries: options.assetRetries,
                headers: environment.headers,
            },
        );
        progressTarget.fetched(md5ext);
        if (!arrayBuffer) return null;

        const calculatedMd5 = calculateMD5(arrayBuffer);
        const originalMd5 = md5ext.split(".")[0];

        if (calculatedMd5 !== originalMd5) {
            // Update project JSON
            for (const target of targets) {
                for (const costume of target.costumes || []) {
                    if (costume.baseLayerMD5 === md5ext) {
                        costume.baseLayerMD5 = `${calculatedMd5}.${getExtension(md5ext)}`;
                    }
                    if (costume.textLayerMD5 === md5ext) {
                        costume.textLayerMD5 = `${calculatedMd5}.png`;
                    }
                }
                for (const sound of target.sounds || []) {
                    if (sound.md5 === md5ext) {
                        sound.md5 = `${calculatedMd5}.${getExtension(md5ext)}`;
                    }
                }
            }
        }

        const path = `${id}.${getExtension(md5ext)}`;
        return { path, data: arrayBuffer };
    };

    const filesToAdd = options.skipAssets
        ? []
        : (await Promise.all(needToFetch.map((md5ext) => fetchAndStoreAsset(md5ext, md5extToId.get(md5ext)!)))).filter((i) => i !== null);

    const modifiedJSON = await storeProjectJSON(zipInstance, "sb2", projectData, options);

    for (const file of filesToAdd) {
        if (file) {
            zipInstance.file(file.path, file.data);
        }
    }

    return {
        downloadedAssets: filesToAdd.length,
        modifiedJSON: modifiedJSON,
        zip: zipInstance,
    };
};
