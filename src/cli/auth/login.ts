import prompts from "prompts";
import { fetchWithProxy as fetch } from "../../fetch-wrapper.js";
import kleur from "kleur";
import { saveConfig, loadConfig } from "../config.js";
import { logout } from "./logout";
import { parseSession } from "./session";

export async function login() {
    const config = loadConfig();
    if (config.username || config.sessionId || config.token) {
        const { confirm } = await prompts({
            type: 'confirm',
            name: 'confirm',
            message: `You are already logged in as ${kleur.bold(config.username || "Unknown")}. Do you want to logout and log in again?`,
            initial: false
        });

        if (!confirm) return;
        await logout();
    }

    const response = await prompts({
        type: 'select',
        name: 'method',
        message: 'Select login method',
        choices: [
            { title: 'Login with username and password', value: 'password' },
            { title: 'Login with session ID', value: 'session' },
            { title: 'Login with x-token (Limited Permissions)', value: 'token' },
        ],
    });

    if (!response.method) return;

    if (response.method === 'password') {
        const credentials = await prompts([
            {
                type: 'text',
                name: 'username',
                message: 'Username',
            },
            {
                type: 'password',
                name: 'password',
                message: 'Password',
            }
        ]);

        if (!credentials.username || !credentials.password) return;

        console.log(kleur.dim("Logging in..."));

        try {
            const loginUrl = `${config.urls.login}/`;
            const res = await fetch(loginUrl, {
                "headers": {
                    "x-csrftoken": "a",
                    "x-requested-with": "XMLHttpRequest",
                    "Cookie": "scratchcsrftoken=a; scratchlanguage=en"
                },
                "referrer": config.urls.site.replace("/site-api", "/"),
                "body": JSON.stringify({
                    username: credentials.username,
                    password: credentials.password,
                    useMessages: true
                }),
                "method": "POST",
            });

            const data = await res.json() as any;
            if (data[0] && data[0].success) {
                const user = data[0];
                const setCookie = res.headers.get("set-cookie");
                let sessionId = null;
                if (setCookie) {
                    const match = setCookie.match(/scratchsessionsid=([^;]+)/);
                    if (match) sessionId = match[1];
                }

                saveConfig({
                    ...config,
                    username: user.username,
                    userId: user.id,
                    token: user.token,
                    sessionId: sessionId
                });

                console.log(kleur.green(`Logged in successfully: ${user.username}`));
            } else {
                console.error(kleur.red(`Login failed: ${data[0]?.msg || "Unknown error"}`));
            }
        } catch (e) {
            console.error(kleur.red("An error occurred during login"));
            console.error(e);
        }
    } else if (response.method === 'session') {
        const { sessionId } = await prompts({
            type: 'text',
            name: 'sessionId',
            message: 'Please enter your session ID',
        });

        if (!sessionId) return;

        try {
            const parsed = parseSession(sessionId);
            saveConfig({
                ...config,
                username: parsed.payload.username,
                userId: parseInt(parsed.payload._auth_user_id, 10),
                token: null,
                sessionId: sessionId
            });
            console.log(kleur.green(`Logged in successfully (via session): ${parsed.payload.username}`));
        } catch (e: any) {
            console.error(kleur.red(e.message));
        }
    } else if (response.method === 'token') {
        const data = await prompts([
            {
                type: 'text',
                name: 'username',
                message: 'Username',
            },
            {
                type: 'text',
                name: 'token',
                message: 'x-token',
            }
        ]);

        if (!data.username || !data.token) return;

        saveConfig({
            ...config,
            username: data.username,
            userId: 0,
            token: data.token,
            sessionId: null
        });

        console.log(kleur.green(`Logged in successfully (via x-token): ${data.username}`));
        console.log(kleur.yellow("Note: Some features like 'My Stuff' are restricted with x-token login."));
    }
}
