import fs from "fs";
import path from "path";
import os from "os";

import { UserConfig } from "./types.js";

const CONFIG_DIR = path.join(os.homedir(), ".sc-dlp");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export const DEFAULT_CONFIG: UserConfig = {
    username: null,
    userId: null,
    token: null,
    sessionId: null,
    language: "en",
    conflictAction: null,
    proxy: null,
    urls: {
        api: "https://api.scratch.mit.edu",
        site: "https://scratch.mit.edu/site-api",
        assets: "https://assets.scratch.mit.edu",
        projects: "https://projects.scratch.mit.edu",
        login: "https://scratch.mit.edu/login",
        projectsAll: "https://scratch.mit.edu/projects/all",
        turbowarpShare: "https://share.turbowarp.org",
        turbowarpApi: "https://share.turbowarp.org/api",
    },
    turbowarpMirrors: [
        "turbowarp.org",
        "mirror.turbowarp.xyz",
        "forkphorus.github.io",
        "packager.turbowarp.org",
        "share.turbowarp.org"
    ]
};

let cachedConfig: UserConfig | null = null;
let cachedMtimeMs: number | null = null;

const cloneConfig = (cfg: UserConfig): UserConfig => ({
    ...cfg,
    urls: { ...cfg.urls },
    turbowarpMirrors: [...cfg.turbowarpMirrors],
});

export const clearConfigCache = () => {
    cachedConfig = null;
    cachedMtimeMs = null;
};

export const loadConfig = (): UserConfig => {
    let stat: fs.Stats;
    try {
        stat = fs.statSync(CONFIG_FILE);
    } catch {
        cachedConfig = null;
        cachedMtimeMs = null;
        return cloneConfig(DEFAULT_CONFIG);
    }

    if (cachedConfig && cachedMtimeMs === stat.mtimeMs) {
        return cloneConfig(cachedConfig);
    }

    try {
        const data = fs.readFileSync(CONFIG_FILE, "utf-8");
        const parsed = JSON.parse(data);
        const merged: UserConfig = {
            ...DEFAULT_CONFIG,
            ...parsed,
            urls: {
                ...DEFAULT_CONFIG.urls,
                ...(parsed.urls || {}),
            },
            turbowarpMirrors: Array.isArray(parsed.turbowarpMirrors)
                ? [...parsed.turbowarpMirrors]
                : [...DEFAULT_CONFIG.turbowarpMirrors],
        };
        cachedConfig = merged;
        cachedMtimeMs = stat.mtimeMs;
        return cloneConfig(merged);
    } catch (e) {
        console.error("Failed to load config:", e);
        return cloneConfig(DEFAULT_CONFIG);
    }
};

export const saveConfig = (config: UserConfig) => {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
            encoding: "utf-8",
            mode: 0o600,
        });
        try {
            fs.chmodSync(CONFIG_FILE, 0o600);
        } catch {
            // Ignore chmod errors on platforms/filesystems that don't support POSIX modes
        }
        clearConfigCache();
    } catch (e) {
        console.error("Failed to save config:", e);
    }
};
