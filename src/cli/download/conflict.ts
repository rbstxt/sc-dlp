import fs from "node:fs/promises";
import path from "node:path";
import prompts from "prompts";
import kleur from "kleur";
import { ParsedArgs, ConflictAction } from "../types.js";
import { sanitizeFileName } from "../utils.js";

export interface ConflictDisplayHooks {
    pauseForPrompt(): void;
    resumeAfterPrompt(): void;
}

export interface ConflictResolver {
    resolve(title: string, extension: string, parsedArgs: ParsedArgs): Promise<string | null>;
    release(filePath: string): void;
}

const pathExists = async (targetPath: string, reservedPaths: Set<string>): Promise<boolean> => {
    if (reservedPaths.has(targetPath)) {
        return true;
    }
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
};

export function createConflictResolver(display?: ConflictDisplayHooks): ConflictResolver {
    const reservedPaths = new Set<string>();
    let mutex: Promise<void> = Promise.resolve();

    const runSerialized = <T>(fn: () => Promise<T>): Promise<T> => {
        const next = mutex.then(fn, fn);
        mutex = next.then(() => {}, () => {});
        return next;
    };

    return {
        release(filePath: string) {
            reservedPaths.delete(filePath);
        },

        resolve(title: string, extension: string, parsedArgs: ParsedArgs): Promise<string | null> {
            return runSerialized(async () => {
                const safeTitle = sanitizeFileName(title || "Project") || "Project";
                const baseFilename = `${safeTitle}.${extension}`;
                const targetPath = path.resolve(baseFilename);

                const exists = await pathExists(targetPath, reservedPaths);
                if (!exists) {
                    reservedPaths.add(targetPath);
                    return targetPath;
                }

                // Conflict detected. Determine action.
                if (!parsedArgs.conflictAction) {
                    display?.pauseForPrompt();
                    try {
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
                    } finally {
                        display?.resumeAfterPrompt();
                    }
                }

                const action = parsedArgs.conflictAction;

                if (action === 'skip') {
                    return null;
                }

                if (action === 'overwrite') {
                    reservedPaths.add(targetPath);
                    return targetPath;
                }

                if (action === 'keep-both') {
                    let counter = 2;
                    while (true) {
                        const newFilename = `${safeTitle} ${counter}.${extension}`;
                        const newPath = path.resolve(newFilename);
                        if (!(await pathExists(newPath, reservedPaths))) {
                            reservedPaths.add(newPath);
                            return newPath;
                        }
                        counter++;
                    }
                }

                reservedPaths.add(targetPath);
                return targetPath;
            });
        },
    };
}

const defaultResolver = createConflictResolver();

/**
 * Resolves a file naming conflict.
 * Returns the final absolute path to save the file to, or null if the download should be skipped.
 */
export async function resolveConflict(
    title: string,
    extension: string,
    parsedArgs: ParsedArgs
): Promise<string | null> {
    return defaultResolver.resolve(title, extension, parsedArgs);
}
