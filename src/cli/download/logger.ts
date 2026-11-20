import kleur from "kleur";
import { ParsedArgs } from "../types.js";

export interface LogSink {
    log(msg: string): void;
}

export const createLogger = (sink: LogSink, parsedArgs: ParsedArgs, projectTag?: string) => {
    const tagSegment = projectTag ? `${kleur.dim(`[${projectTag}]`)} ` : "";

    const logPersistent = (msg: string) => {
        sink.log(msg + "\n");
    };

    const formatPrefix = (colorFn: (s: string) => string, label: string) => {
        const prefix = `[${label}]`;
        const padded = prefix.padEnd(12);
        return colorFn(padded);
    };

    return {
        logPersistent,
        logMetadata: (msg: string) => logPersistent(`${formatPrefix(kleur.magenta, "metadata")} ${tagSegment}${msg}`),
        logAssets: (msg: string) => logPersistent(`${formatPrefix(kleur.cyan, "assets")} ${tagSegment}${msg}`),
        logCompress: (msg: string) => logPersistent(`${formatPrefix(kleur.yellow, "compress")} ${tagSegment}${msg}`),
        logInfo: (msg: string) => logPersistent(`${formatPrefix(kleur.blue, "info")} ${tagSegment}${msg}`),
        logMapping: (msg: string) => logPersistent(`${formatPrefix(kleur.magenta, "mapping")} ${tagSegment}${msg}`),
        logSuccess: (msg: string) => logPersistent(`${formatPrefix(kleur.green, "success")} ${tagSegment}${msg}`),
        logWarning: (msg: string) => logPersistent(`${formatPrefix(kleur.yellow, "warning")} ${tagSegment}${msg}`),
        logErrorMsg: (msg: string) => logPersistent(`${formatPrefix(kleur.red, "error")} ${tagSegment}${msg}`),
        logDebug: (msg: string) => {
            if (parsedArgs.verbose) {
                logPersistent(`${kleur.gray("[debug]".padEnd(12))} ${tagSegment}${msg}`);
            }
        }
    };
};
