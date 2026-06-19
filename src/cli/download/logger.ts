import kleur from "kleur";
import * as cliProgress from "cli-progress";
import { ParsedArgs } from "../types.js";

export const createLogger = (multibar: cliProgress.MultiBar, parsedArgs: ParsedArgs) => {
    const logPersistent = (msg: string) => {
        multibar.log(msg + "\n");
    };

    const formatPrefix = (colorFn: any, label: string) => {
        const prefix = `[${label}]`;
        const padded = prefix.padEnd(12);
        return colorFn(padded);
    };

    return {
        logPersistent,
        logMetadata: (msg: string) => logPersistent(`${formatPrefix(kleur.magenta, "metadata")} ${msg}`),
        logAssets: (msg: string) => logPersistent(`${formatPrefix(kleur.cyan, "assets")} ${msg}`),
        logCompress: (msg: string) => logPersistent(`${formatPrefix(kleur.yellow, "compress")} ${msg}`),
        logInfo: (msg: string) => logPersistent(`${formatPrefix(kleur.blue, "info")} ${msg}`),
        logMapping: (msg: string) => logPersistent(`${formatPrefix(kleur.magenta, "mapping")} ${msg}`),
        logSuccess: (msg: string) => logPersistent(`${formatPrefix(kleur.green, "success")} ${msg}`),
        logWarning: (msg: string) => logPersistent(`${formatPrefix(kleur.yellow, "warning")} ${msg}`),
        logErrorMsg: (msg: string) => logPersistent(`${formatPrefix(kleur.red, "error")} ${msg}`),
        logDebug: (msg: string) => {
            if (parsedArgs.verbose) {
                logPersistent(`${kleur.gray("[debug]")} ${msg}`);
            }
        }
    };
};
