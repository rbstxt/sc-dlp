import fs from "node:fs/promises";
import path from "node:path";
import prompts from "prompts";
import kleur from "kleur";
import { ParsedArgs, ConflictAction } from "../types.js";
import { sanitizeFileName } from "../utils.js";

/**
 * Resolves a file naming conflict.
 * Returns the final absolute path to save the file to, or null if the download should be skipped.
 */
export async function resolveConflict(
    title: string,
    extension: string,
    parsedArgs: ParsedArgs
): Promise<string | null> {
    const baseFilename = `${sanitizeFileName(title)}.${extension}`;
    let targetPath = path.resolve(baseFilename);

    // Check if file exists
    try {
        await fs.access(targetPath);
    } catch {
        // File does not exist, safe to proceed
        return targetPath;
    }

    // Conflict detected. Determine action.
    if (!parsedArgs.conflictAction) {
        const prefix = kleur.yellow("[conflict]".padEnd(12)) + " ";
        console.log(`\n${prefix}File already exists: ${kleur.bold(baseFilename)}`);

        const response = await prompts({
            type: 'select',
            name: 'action',
            message: 'What should we do?',
            choices: [
                { title: 'Overwrite (replace existing file)', value: 'overwrite' },
                { title: 'Skip (do nothing)', value: 'skip' },
                { title: 'Keep both (automatic renaming)', value: 'keep-both' },
            ],
            initial: 0
        });

        if (!response.action) {
            // User cancelled prompt (e.g. Ctrl-C), default to skip for safety
            return null;
        }

        parsedArgs.conflictAction = response.action as ConflictAction;
        const selectedPrefix = kleur.dim("[conflict]".padEnd(12)) + " ";
        console.log(`${selectedPrefix}Selected "${parsedArgs.conflictAction}". This choice will be applied to all remaining conflicts in this session.\n`);
    }

    const action = parsedArgs.conflictAction;

    if (action === 'skip') {
        return null;
    }

    if (action === 'overwrite') {
        return targetPath;
    }

    if (action === 'keep-both') {
        let counter = 2;
        const base = sanitizeFileName(title);
        while (true) {
            const newFilename = `${base} ${counter}.${extension}`;
            const newPath = path.resolve(newFilename);
            try {
                await fs.access(newPath);
                counter++;
            } catch {
                return newPath;
            }
        }
    }

    return targetPath;
}
