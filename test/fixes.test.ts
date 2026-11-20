import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from '@turbowarp/jszip';
import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import * as SBDL from '../src/export-node.js';
import fetchAsset, { clearAssetCache } from '../src/fetch-asset.js';
import environment from '../src/environment.js';
import { getProjectTitleFromURL } from '../src/downloader/metadata/project.js';
import { parseArguments } from '../src/cli/args.js';
import { createConflictResolver } from '../src/cli/download/conflict.js';
import { makeDownloader } from '../src/cli/download.js';
import { createDisplayManager } from '../src/cli/download/display.js';

const originalFetch = global.fetch;
const originalCanAccessScratchAPI = environment.canAccessScratchAPI;

beforeEach(() => {
    clearAssetCache();
    global.fetch = vi.fn();
    environment.canAccessScratchAPI = originalCanAccessScratchAPI;
});

afterEach(() => {
    global.fetch = originalFetch;
    environment.canAccessScratchAPI = originalCanAccessScratchAPI;
    clearAssetCache();
});

test('fetchAsset caches resolved ArrayBuffers and avoids duplicate network calls', async () => {
    const payload = new Uint8Array([1, 2, 3, 4]).buffer;
    vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(payload),
    } as Response);

    const first = await fetchAsset('https://example.test/asset1.png');
    const second = await fetchAsset('https://example.test/asset1.png');

    expect(first).toBeInstanceOf(ArrayBuffer);
    expect(second).toBe(first);
    expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('fetchAsset rejects immediately with AbortError when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
        fetchAsset('https://example.test/aborted.png', { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(global.fetch).not.toHaveBeenCalled();
});

test('fetchAsset routes retry warnings through onWarning instead of console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const warnings: string[] = [];
    vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 500,
    } as Response);

    await expect(
        fetchAsset('https://example.test/fail.png', {
            retries: 0,
            onWarning: (msg) => warnings.push(msg),
        })
    ).rejects.toThrow(/Failed to fetch/);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
});

test('sb3 MD5 mismatch on existing zip updates project.json so references stay valid', async () => {
    const wrongContent = new TextEncoder().encode('<svg>actual-content</svg>');
    const actualMd5 = crypto.createHash('md5').update(wrongContent).digest('hex');
    const oldMd5 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    const inputZip = new JSZip();
    inputZip.file('project.json', JSON.stringify({
        targets: [
            {
                name: 'Stage',
                isStage: true,
                costumes: [
                    { assetId: oldMd5, dataFormat: 'svg', md5ext: `${oldMd5}.svg` }
                ],
                sounds: []
            }
        ]
    }));
    const inputBuffer = await inputZip.generateAsync({ type: 'arraybuffer' });

    vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(wrongContent.buffer.slice(0)),
    } as Response);

    const downloaded = await SBDL.downloadProjectFromBuffer(inputBuffer);
    const outZip = await JSZip.loadAsync(downloaded.arrayBuffer);
    const outJson = JSON.parse(await outZip.file('project.json')!.async('text'));

    expect(outZip.file(`${actualMd5}.svg`)).not.toBeNull();
    expect(outJson.targets[0].costumes[0].assetId).toBe(actualMd5);
    expect(outJson.targets[0].costumes[0].md5ext).toBe(`${actualMd5}.svg`);
});

test('getProjectMetadata does not leak auth headers to TurboWarp trampoline proxies', async () => {
    environment.canAccessScratchAPI = false;
    const capturedHeaders: Record<string, string>[] = [];

    vi.mocked(global.fetch).mockImplementation((_url, init) => {
        capturedHeaders.push((init?.headers || {}) as Record<string, string>);
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 123, title: 'Test', project_token: 'tok' }),
        } as Response);
    });

    await SBDL.getProjectMetadata('123', {
        token: 'secret-x-token',
        sessionId: 'secret-session-id',
    });

    expect(capturedHeaders).toHaveLength(1);
    expect(capturedHeaders[0]['x-token']).toBeUndefined();
    expect(capturedHeaders[0]['Cookie']).toBeUndefined();
});

test('getProjectTitleFromURL handles extensions, query strings, and URL encoding properly', () => {
    expect(getProjectTitleFromURL('https://example.com/my%20game.sb3?token=abc')).toBe('my game');
    expect(getProjectTitleFromURL('https://example.com/old.sb2#hash')).toBe('old');
    expect(getProjectTitleFromURL('https://example.com/legacy.sb')).toBe('legacy');
    expect(getProjectTitleFromURL('https://example.com/weird.sb|')).toBe('');
});

test('parseArguments validates numeric options and captures config args cleanly', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const invalid = parseArguments(['-c', '0', '--retries', '-2', '--page', 'abc', '12345']);
    expect(invalid.jobs).toBe(1);
    expect(invalid.retries).toBe(5);
    expect(invalid.page).toBeNull();
    expect(invalid.inputs).toEqual(['12345']);

    const configArgs = parseArguments(['-v', 'config', '--list']);
    expect(configArgs.verbose).toBe(true);
    expect(configArgs.config).toBe(true);
    expect(configArgs.inputs).toEqual(['--list']);

    warnSpy.mockRestore();
});

test('createConflictResolver prevents concurrent keep-both collisions', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-dlp-conflict-'));
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
        await fs.writeFile(path.join(tmpDir, 'SameTitle.sb3'), 'existing');
        const resolver = createConflictResolver();
        const args = parseArguments(['--conflict', 'keep-both']);

        const [p1, p2, p3] = await Promise.all([
            resolver.resolve('SameTitle', 'sb3', args),
            resolver.resolve('SameTitle', 'sb3', args),
            resolver.resolve('SameTitle', 'sb3', args),
        ]);

        const basenames = [p1, p2, p3].map((p) => path.basename(p!));
        expect(new Set(basenames).size).toBe(3);
        expect(basenames).toEqual(['SameTitle 2.sb3', 'SameTitle 3.sb3', 'SameTitle 4.sb3']);
    } finally {
        process.chdir(origCwd);
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
});

test('makeDownloader saves projectUrl files and uses actual .sb2 extension', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sc-dlp-dl-'));
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
        const sb2Json = JSON.stringify({
            objName: 'Stage',
            costumes: [],
            sounds: [],
            children: [],
        });

        vi.mocked(global.fetch).mockImplementation((url) => {
            if (url.toString() === 'https://example.test/demo.sb2') {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    arrayBuffer: () => Promise.resolve(new TextEncoder().encode(sb2Json).buffer),
                } as Response);
            }
            return Promise.resolve({ ok: false, status: 404 } as Response);
        });

        const logs: string[] = [];
        const display = {
            ...createDisplayManager(false),
            log: (msg: string) => logs.push(msg),
        };
        const args = parseArguments(['--conflict', 'overwrite']);
        const download = makeDownloader(args, display);

        const status = await download({
            id: null,
            projectUrl: 'https://example.test/demo.sb2',
        });

        expect(status).toBe('downloaded');
        const savedPath = path.join(tmpDir, 'demo.sb2');
        const stat = await fs.stat(savedPath);
        expect(stat.size).toBeGreaterThan(0);

        const failStatus = await download({
            id: null,
            projectUrl: 'https://example.test/missing.sb3',
        });
        expect(failStatus).toBe('failed');
    } finally {
        process.chdir(origCwd);
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
});
