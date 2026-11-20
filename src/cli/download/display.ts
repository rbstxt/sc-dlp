import * as cliProgress from "cli-progress";
import kleur from "kleur";

export interface ProgressBarHandle {
    setTotal(total: number): void;
    update(value: number, payload?: Record<string, string | number>): void;
}

export interface DisplayManager {
    readonly isTTY: boolean;
    log(message: string): void;
    createTotalBar(total: number): ProgressBarHandle;
    createWorkerBar(slotLabel: string): ProgressBarHandle;
    pauseForPrompt(): void;
    resumeAfterPrompt(): void;
    stop(): void;
}

const NOOP_BAR: ProgressBarHandle = {
    setTotal: () => {},
    update: () => {},
};

const formatTag = (label: string, colorFn?: (s: string) => string): string => {
    const raw = label.length > 12 ? label.slice(0, 11) + "…" : label;
    const padded = raw.padEnd(12);
    return colorFn ? colorFn(padded) : padded;
};

export const formatProjectBarId = (id: string | number): string => {
    const str = String(id);
    // Compact UUIDs like 4cd76e33-0e7a-... to 8 chars so columns stay aligned
    const short = /^[0-9a-f-]{36}$/i.test(str) ? str.slice(0, 8) : str;
    return formatTag(`[${short}]`, kleur.cyan);
};

export const createDisplayManager = (forceTTY?: boolean): DisplayManager => {
    const isTTY = forceTTY !== undefined ? forceTTY : Boolean(process.stdout.isTTY);

    if (!isTTY) {
        return {
            isTTY: false,
            log(message: string) {
                process.stdout.write(message);
            },
            createTotalBar: () => NOOP_BAR,
            createWorkerBar: () => NOOP_BAR,
            pauseForPrompt: () => {},
            resumeAfterPrompt: () => {},
            stop: () => {},
        };
    }

    const multibar = new cliProgress.MultiBar(
        {
            clearOnComplete: true,
            hideCursor: true,
            linewrap: false,
            barsize: 28,
            format: "{id} {bar} {percentage}% | {value}/{total} | {info}",
            barCompleteChar: "\u2588",
            barIncompleteChar: "\u2591",
            forceRedraw: true,
            fps: 10,
            noTTYOutput: false,
        },
        cliProgress.Presets.shades_grey,
    );

    let paused = false;

    const wrapBar = (bar: cliProgress.SingleBar): ProgressBarHandle => ({
        setTotal(total: number) {
            bar.setTotal(Math.max(1, total));
        },
        update(value: number, payload?: Record<string, string | number>) {
            bar.update(value, payload);
        },
    });

    return {
        isTTY: true,

        log(message: string) {
            if (paused) {
                process.stdout.write(message);
                return;
            }
            const mb = multibar as any;
            if (!mb.isActive) {
                process.stdout.write(message);
                return;
            }
            multibar.log(message);
        },

        createTotalBar(total: number): ProgressBarHandle {
            const bar = multibar.create(Math.max(1, total), 0, {
                id: kleur.bold().green("[total]".padEnd(12)),
                info: `0/${total}`,
            });
            return wrapBar(bar);
        },

        createWorkerBar(slotLabel: string): ProgressBarHandle {
            const bar = multibar.create(1, 0, {
                id: formatTag(slotLabel, kleur.cyan),
                info: "waiting...",
            });
            return wrapBar(bar);
        },

        pauseForPrompt() {
            const mb = multibar as any;
            if (paused || !mb.isActive) return;
            paused = true;

            if (mb.timer) {
                clearTimeout(mb.timer);
                mb.timer = null;
            }

            if (mb.terminal) {
                mb.terminal.cursorRelativeReset();
                mb.terminal.clearBottom();
                if (Array.isArray(mb.loggingBuffer) && mb.loggingBuffer.length > 0) {
                    while (mb.loggingBuffer.length > 0) {
                        mb.terminal.write(mb.loggingBuffer.shift(), true);
                    }
                }
                mb.terminal.cursor(true);
                mb.terminal.lineWrapping(true);
            }
        },

        resumeAfterPrompt() {
            const mb = multibar as any;
            if (!paused) return;
            paused = false;

            if (!mb.isActive) return;

            if (mb.terminal) {
                mb.terminal.dy = 0;
                mb.terminal.cursor(false);
                mb.terminal.lineWrapping(false);
            }
            if (Array.isArray(mb.bars)) {
                for (const bar of mb.bars) {
                    bar.lastDrawnString = "";
                }
            }
            multibar.update();
        },

        stop() {
            const mb = multibar as any;
            if (paused) {
                paused = false;
                if (mb.terminal) {
                    mb.terminal.dy = 0;
                }
            }
            if (mb.isActive) {
                // Stop timer, clear bars, and flush all remaining buffered logs cleanly
                if (mb.timer) {
                    clearTimeout(mb.timer);
                    mb.timer = null;
                }
                if (mb.terminal) {
                    mb.terminal.cursorRelativeReset();
                    mb.terminal.clearBottom();
                    if (Array.isArray(mb.loggingBuffer) && mb.loggingBuffer.length > 0) {
                        while (mb.loggingBuffer.length > 0) {
                            mb.terminal.write(mb.loggingBuffer.shift(), true);
                        }
                    }
                    mb.terminal.dy = 0;
                }
                multibar.stop();
            } else if (Array.isArray(mb.loggingBuffer) && mb.loggingBuffer.length > 0) {
                while (mb.loggingBuffer.length > 0) {
                    process.stdout.write(mb.loggingBuffer.shift());
                }
            }
        },
    };
};
