import prompts from "prompts";
import kleur from "kleur";
import { loadConfig, saveConfig, DEFAULT_CONFIG } from "./config.js";
import { UserConfig, ConflictAction } from "./types.js";

export async function handleConfigCommand(args: string[]) {
    const config = loadConfig();

    if (args.length === 0 || args.includes("--help")) {
        console.log(`
${kleur.bold().cyan("sc-dlp config: Manage configuration")}

Usage:
  sc-dlp config --list                 List all configuration values
  sc-dlp config --get <key>            Get a specific configuration value
  sc-dlp config --set <key>=<value>    Set a configuration value
  sc-dlp config --reset                Reset configuration to defaults

Keys:
  language                             Default language for search results (e.g., en, ja)
  conflictAction                       Default action for file conflicts (overwrite, skip, keep-both)
  proxy                                Proxy server URL (e.g., http://proxy.example.com:8080)
  urls.api                             Scratch API base URL
  urls.site                            Scratch Site API base URL
  urls.assets                          Scratch Assets base URL
  urls.projects                        Scratch Projects base URL
  urls.login                           Scratch Login base URL
  urls.projectsAll                    Scratch Projects All base URL
  urls.turbowarpShare                 TurboWarp Share base URL
  urls.turbowarpApi                   TurboWarp API base URL
  turbowarpMirrors                    List of TurboWarp mirrors (comma-separated)

${kleur.yellow().bold("WARNING:")} Modifying sensitive URLs like ${kleur.cyan("urls.api")}, ${kleur.cyan("urls.projects")}, ${kleur.cyan("urls.login")}, or ${kleur.cyan("urls.projectsAll")}
can break core functionality or expose sensitive data. Only modify these if you know what you are doing.
`);
        return;
    }

    if (args.includes("--list")) {
        console.log(kleur.bold().cyan("\nCurrent Configuration:"));
        const printObj = (obj: any, prefix = "") => {
            for (const key in obj) {
                const val = obj[key];
                if (typeof val === "object" && val !== null) {
                    printObj(val, `${prefix}${key}.`);
                } else {
                    console.log(`  ${kleur.yellow((prefix + key).padEnd(20))} ${val === null ? kleur.dim("null") : val}`);
                }
            }
        };
        printObj(config);
        console.log();
        return;
    }

    if (args.includes("--reset")) {
        const { confirm } = await prompts({
            type: 'confirm',
            name: 'confirm',
            message: kleur.red().bold("Are you sure you want to reset the configuration to defaults? This will erase all your settings including login info."),
            initial: false
        });

        if (confirm) {
            saveConfig(DEFAULT_CONFIG);
            console.log(kleur.green("Configuration has been reset to defaults."));
        } else {
            console.log("Reset aborted.");
        }
        return;
    }

    const setIdx = args.indexOf("--set");
    if (setIdx !== -1 && args[setIdx + 1]) {
        const pair = args[setIdx + 1];
        const [key, ...valParts] = pair.split("=");
        const value = valParts.join("=");

        if (!key || value === undefined) {
            console.error(kleur.red("Invalid format. Use key=value"));
            return;
        }

        try {
            await updateConfigValue(config, key, value);
            saveConfig(config);
            console.log(kleur.green(`Successfully set ${kleur.bold(key)} to ${kleur.bold(value)}`));
        } catch (e: any) {
            console.error(kleur.red(`Error: ${e.message}`));
        }
        return;
    }

    const getIdx = args.indexOf("--get");
    if (getIdx !== -1 && args[getIdx + 1]) {
        const key = args[getIdx + 1];
        try {
            const value = getConfigValue(config, key);
            console.log(value === null ? "null" : value);
        } catch (e: any) {
            console.error(kleur.red(`Error: ${e.message}`));
        }
        return;
    }
}

async function updateConfigValue(config: UserConfig, key: string, value: string) {
    if (key === "language") {
        config.language = value;
    } else if (key === "conflictAction") {
        if (["overwrite", "skip", "keep-both"].includes(value)) {
            config.conflictAction = value as ConflictAction;
        } else if (value === "null" || value === "") {
            config.conflictAction = null;
        } else {
            throw new Error("Invalid conflictAction. Use 'overwrite', 'skip', 'keep-both', or 'null'.");
        }
    } else if (key === "proxy") {
        config.proxy = value || null;
    } else if (key === "turbowarpMirrors") {
        process.stdout.write(kleur.yellow().bold("CAUTION: ") + kleur.yellow("These mirrors may receive the project_token. Only add domains you trust.\n"));
        const { confirm } = await prompts({
            type: 'confirm',
            name: 'confirm',
            message: `Do you want to add these mirror(s)?`,
            initial: false
        });
        if (!confirm) throw new Error("Abort by user");

        const newMirrors = value ? value.split(",").map(v => v.trim()).filter(Boolean) : [];
        if (value.startsWith("+")) {
            // Append mode: merge with existing and remove + from first item
            const stripPlus = (s: string) => s.startsWith("+") ? s.slice(1) : s;
            const existing = config.turbowarpMirrors || [];
            const toAdd = newMirrors.map(stripPlus).filter(Boolean);
            config.turbowarpMirrors = Array.from(new Set([...existing, ...toAdd]));
        } else {
            // Overwrite mode
            config.turbowarpMirrors = newMirrors;
        }
    } else if (key.startsWith("urls.")) {
        const urlKey = key.split(".")[1] as keyof UserConfig["urls"];
        if (config.urls[urlKey] !== undefined) {
            let warning = "";
            if (urlKey === "api") {
                warning = "Transmitting sessionId to this URL may expose private projects if configured to a malicious server.";
            } else if (urlKey === "projects") {
                warning = "Transmitting project_token to this URL may expose restricted projects.";
            } else if (["login", "projectsAll"].includes(urlKey)) {
                warning = "Modifying a sensitive authentication route. This may break login functionality.";
            }

            if (warning) {
                process.stdout.write(kleur.yellow().bold("CAUTION: ") + kleur.yellow(warning + "\n"));
                const { confirm } = await prompts({
                    type: 'confirm',
                    name: 'confirm',
                    message: `Do you want to set urls.${urlKey} to ${value}?`,
                    initial: false
                });
                if (!confirm) throw new Error("Abort by user");
            }

            config.urls[urlKey] = value;
        } else {
            throw new Error(`Unknown URL key: ${urlKey}`);
        }
    } else {
        throw new Error(`Unknown configuration key: ${key}`);
    }
}

function getConfigValue(config: any, key: string): any {
    const parts = key.split(".");
    let current = config;
    for (const part of parts) {
        if (current[part] === undefined) {
            throw new Error(`Unknown configuration key: ${key}`);
        }
        current = current[part];
    }
    return current;
}
