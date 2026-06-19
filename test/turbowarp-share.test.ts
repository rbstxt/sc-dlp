import { test, expect, vi, beforeAll, afterAll } from 'vitest';
import * as SBDL from '../src/export-node.js';

const USERS_UUID = '4cd76e33-0e7a-468f-85c9-17799748a864';

test('getTurboWarpMetadata', async () => {
    const mockHtml = `
    <html>
      <head>
        <meta property="og:title" content="My TurboWarp Project">
        <meta property="og:description" content="A cool project on TurboWarp Share">
      </head>
      <body>
        <script>
          window.__SAPPER__ = {
            preloaded: [null, {
              "md5extsToSha256": {
                "asset1.png": "sha256_1",
                "asset2.svg": "sha256_2"
              }
            }]
          };
        </script>
      </body>
    </html>
  `;

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes(`/projects/${USERS_UUID}`)) {
            return Promise.resolve({
                ok: true,
                status: 200,
                text: () => Promise.resolve(mockHtml)
            });
        }
        return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    }) as any;

    try {
        const meta = await SBDL.getTurboWarpMetadata(USERS_UUID);
        expect(meta.title).toBe('My TurboWarp Project');
        expect(meta.description).toBe('A cool project on TurboWarp Share');
        expect((meta as any).assetMapping).toEqual({
            "asset1.png": "sha256_1",
            "asset2.svg": "sha256_2"
        });
    } finally {
        global.fetch = originalFetch;
    }
});

test('downloadTurboWarpProject mapping verification', async () => {
    const mockHtml = `<html><body><script>const data = {"md5extsToSha256":{"9838d02002d05f88dc54d96494fbc202.png":"mapped_sha256"},"other":123}</script></body></html>`;
    const mockProject = {
        targets: [{
            name: "Stage",
            costumes: [{
                assetId: "9838d02002d05f88dc54d96494fbc202",
                dataFormat: "png"
            }],
            sounds: []
        }]
    };

    const fetchedUrls: string[] = [];
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url) => {
        fetchedUrls.push(url);
        if (url === `https://share.turbowarp.org/projects/${USERS_UUID}`) {
            return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(mockHtml) });
        }
        if (url === `https://share.turbowarp.org/api/projects/${USERS_UUID}`) {
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockProject) });
        }
        if (url.includes('/api/assets/mapped_sha256')) {
            return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)) });
        }
        return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    }) as any;

    try {
        const project = await SBDL.downloadTurboWarpProject(USERS_UUID);
        expect(project.title).toBe('Untitled');
        expect(fetchedUrls).toContain(`https://share.turbowarp.org/api/assets/mapped_sha256`);
        expect(fetchedUrls).not.toContain(`https://share.turbowarp.org/api/assets/9838d02002d05f88dc54d96494fbc202.png`);
    } finally {
        global.fetch = originalFetch;
    }
});
