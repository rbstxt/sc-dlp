import pako from "pako";

const B62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function decodeBase62(str: string): bigint | null {
    let res = 0n;
    const base = 62n;
    for (let i = 0; i < str.length; i++) {
        const charIndex = BigInt(B62_CHARS.indexOf(str[i]));
        if (charIndex === -1n) return null;
        res = res * base + charIndex;
    }
    return res;
}

function base64ToUint8Array(base64: string): Uint8Array {
    let sanitized = base64.replace(/-/g, '+').replace(/_/g, '/');
    sanitized = sanitized.replace(/[^A-Za-z0-9+/]/g, "");
    while (sanitized.length % 4) sanitized += '=';

    const buffer = Buffer.from(sanitized, 'base64');
    return new Uint8Array(buffer);
}

export interface SessionPayload {
    _auth_user_id: string;
    _auth_user_backend: string;
    _auth_user_hash: string;
    username: string;
    [key: string]: any;
}

export interface ParsedSession {
    payload: SessionPayload;
    creationDate: Date | null;
}

export function parseSession(rawInput: string): ParsedSession {
    const sessionId = rawInput.trim().replace(/^['"]|['"]$/g, '');
    const parts = sessionId.split(':');
    if (parts.length < 1 || parts[0] === "") {
        throw new Error("Input is empty or format is incorrect.");
    }

    try {
        const compressedBytes = base64ToUint8Array(parts[0]);
        const decompressed = pako.inflate(compressedBytes);
        const jsonString = new TextDecoder().decode(decompressed);
        const payload = JSON.parse(jsonString) as SessionPayload;

        let creationDate: Date | null = null;
        if (parts.length >= 2) {
            const b62Val = decodeBase62(parts[1]);
            if (b62Val !== null) {
                const date = new Date(Number(b62Val) * 1000);
                if (!isNaN(date.getTime())) {
                    creationDate = date;
                }
            }
        }

        return { payload, creationDate };
    } catch (e) {
        console.error("Session parsing failed:", e);
        throw new Error("Session ID parsing failed. Please ensure it is a valid format.");
    }
}
