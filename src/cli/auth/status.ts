import { fetchWithProxy as fetch } from "../../fetch-wrapper.js";
import kleur from "kleur";
import { loadConfig } from "../config.js";

export async function checkStatus() {
    const config = loadConfig();

    if (!config.sessionId && !config.token) {
        console.log(kleur.yellow("Not logged in."));
        return;
    }

    console.log(kleur.dim("Checking login status..."));

    if (config.sessionId) {
        try {
            const sessionUrl = `${config.urls.site.replace("/site-api", "")}/session/`;
            const res = await fetch(sessionUrl, {
                "headers": {
                    "x-requested-with": "XMLHttpRequest",
                    "Cookie": `scratchsessionsid=${config.sessionId}; scratchcsrftoken=a; scratchlanguage=en`
                },
                "referrer": config.urls.site.replace("/site-api", "/"),
                "method": "GET",
            });

            if (!res.ok) {
                console.error(kleur.red(`Failed to check status: ${res.statusText}`));
                return;
            }

            const data = await res.json() as any;
            if (data.user) {
                console.log(kleur.green("Logged in (Full Session):"));
                console.log(`  Username: ${kleur.bold(data.user.username)}`);
                console.log(`  User ID:  ${data.user.id}`);
                console.log(`  Country:  ${data.user.country}`);
            } else {
                console.log(kleur.yellow("Session is invalid or expired."));
            }
        } catch (e) {
            console.error(kleur.red("An error occurred while checking status"));
            console.error(e);
        }
    } else if (config.token) {
        try {
            const userUrl = `${config.urls.api}/users/${config.username}/`;
            const res = await fetch(userUrl, {
                "headers": {
                    "x-token": config.token
                },
                "method": "GET",
            });

            if (res.ok) {
                console.log(kleur.green("Logged in via x-token (Limited Permissions):"));
                console.log(`  Username: ${kleur.bold(config.username || "Unknown")}`);
                console.log(kleur.yellow("  Note: Access to 'My Stuff' is restricted."));
            } else {
                console.log(kleur.yellow("x-token is invalid or expired."));
            }
        } catch (e) {
            console.error(kleur.red("An error occurred while checking token status"));
            console.error(e);
        }
    }
}
