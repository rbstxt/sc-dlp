import prompts from "prompts";
import kleur from "kleur";
import { saveConfig, loadConfig } from "../config.js";

export async function logout(skipConfirm = false) {
    const config = loadConfig();
    if (!config.username && !config.sessionId && !config.token) {
        if (!skipConfirm) {
            console.log(kleur.yellow("You are already logged out."));
        }
        return true;
    }

    if (!skipConfirm) {
        const { confirm } = await prompts({
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to logout from account ${kleur.bold(config.username || "Unknown")}?`,
            initial: false
        });

        if (!confirm) return false;
    }

    saveConfig({
        ...config,
        username: null,
        userId: null,
        token: null,
        sessionId: null,
    });
    console.log(kleur.green("Logged out successfully."));
    return true;
}
