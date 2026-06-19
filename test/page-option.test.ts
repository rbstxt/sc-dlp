import { test, expect } from 'vitest';
import * as urlHandler from '../src/downloader/metadata/playlist/url.js';

test('playlist url handler exists', async () => {
    expect(urlHandler.handleURL).toBeDefined();
});
