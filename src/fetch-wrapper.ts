import { fetch as undiciFetch, ProxyAgent } from "undici";
import { loadConfig } from "./cli/config.js";

/**
 * A wrapper around fetch that supports proxy configuration from sc-dlp config.
 */
export async function fetchWithProxy(url: string | URL, options: any = {}) {
    const config = loadConfig();
    const proxy = config.proxy;

    if (proxy) {
        const agent = new ProxyAgent(proxy);
        options.dispatcher = agent;
    }

    // undiciFetch is equivalent to global fetch in Node 18+ but allows dispatcher
    return undiciFetch(url, options);
}
