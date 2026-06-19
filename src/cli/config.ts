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

export const loadConfig = (): UserConfig => {
    if (!fs.existsSync(CONFIG_FILE)) {
        return { ...DEFAULT_CONFIG };
    }
    try {
        const data = fs.readFileSync(CONFIG_FILE, "utf-8");
        const parsed = JSON.parse(data);
        return {
            ...DEFAULT_CONFIG,
            ...parsed,
            urls: {
                ...DEFAULT_CONFIG.urls,
                ...(parsed.urls || {}),
            },
        };
    } catch (e) {
        console.error("Failed to load config:", e);
        return { ...DEFAULT_CONFIG };
    }
};

export const saveConfig = (config: UserConfig) => {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
    } catch (e) {
        console.error("Failed to save config:", e);
    }
};
