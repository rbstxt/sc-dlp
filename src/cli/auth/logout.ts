import prompts from "prompts";
import kleur from "kleur";
import { saveConfig, loadConfig } from "../config.js";

export async function logout() {
    const config = loadConfig();
    if (!config.username && !config.sessionId && !config.token) {
        console.log(kleur.yellow("You are already logged out."));
        return;
    }

    const { confirm } = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: `Are you sure you want to logout from account ${kleur.bold(config.username || "Unknown")}?`,
        initial: false
    });

    if (!confirm) return;

    saveConfig({
        ...config,
        username: "",
        userId: 0,
        token: "",
        sessionId: "",
    });
    console.log(kleur.green("Logged out successfully."));
}
