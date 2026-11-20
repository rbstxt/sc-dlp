import { fetch as undiciFetch, ProxyAgent } from "undici";
import { loadConfig } from "./cli/config.js";

let cachedProxyUrl: string | null = null;
let cachedProxyAgent: ProxyAgent | null = null;

const getProxyAgent = (proxyUrl: string): ProxyAgent => {
    if (cachedProxyAgent && cachedProxyUrl === proxyUrl) {
        return cachedProxyAgent;
    }
    if (cachedProxyAgent) {
        cachedProxyAgent.close().catch(() => {});
    }
    cachedProxyUrl = proxyUrl;
    cachedProxyAgent = new ProxyAgent(proxyUrl);
    return cachedProxyAgent;
};

export const closeProxyAgent = async () => {
    if (cachedProxyAgent) {
        const agent = cachedProxyAgent;
        cachedProxyAgent = null;
        cachedProxyUrl = null;
        await agent.close().catch(() => {});
    }
};

/**
 * A wrapper around fetch that supports proxy configuration from sc-dlp config.
 */
export async function fetchWithProxy(url: string | URL, options: any = {}) {
    const config = loadConfig();
    const proxy = config.proxy;

    if (proxy) {
        const agent = getProxyAgent(proxy);
        return undiciFetch(url, {
            ...options,
            dispatcher: agent,
        });
    }

    // Use global fetch when no proxy is configured so standard fetch mocks and
    // runtime environments work consistently.
    return globalThis.fetch(url, options);
}
