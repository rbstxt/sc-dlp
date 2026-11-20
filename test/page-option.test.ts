import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as SBDL from '../src/export-node.js';

const originalFetch = global.fetch;

beforeEach(() => {
    global.fetch = vi.fn();
});

afterEach(() => {
    global.fetch = originalFetch;
});

test('user URL with --page computes 60-item offset without being overwritten by 40-item page logic', async () => {
    const requestedUrls: string[] = [];
    vi.mocked(global.fetch).mockImplementation((url) => {
        const urlStr = url.toString();
        requestedUrls.push(urlStr);
        const limitMatch = urlStr.match(/limit=(\d+)/);
        const count = limitMatch ? parseInt(limitMatch[1], 10) : 40;
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(
                Array.from({ length: count }, (_, i) => ({
                    id: i + 1,
                    title: `P${i + 1}`,
                    author: { username: 'user1' },
                }))
            ),
        } as Response);
    });

    const projects = await SBDL.getProjectsFromPlaylistURL('https://scratch.mit.edu/users/user1/projects/', {
        page: 2,
    });

    expect(requestedUrls[0]).toContain('offset=60');
    expect(requestedUrls[0]).toContain('limit=40');
    expect(requestedUrls[1]).toContain('offset=100');
    expect(requestedUrls[1]).toContain('limit=20');
    expect(projects).toHaveLength(60);
});

test('collection --page with concurrency > 1 only fetches a single page', async () => {
    const requestedUrls: string[] = [];
    vi.mocked(global.fetch).mockImplementation((url) => {
        requestedUrls.push(url.toString());
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(
                Array.from({ length: 40 }, (_, i) => ({
                    id: i,
                    title: `P${i}`,
                    author: { username: 'u' },
                }))
            ),
        } as Response);
    });

    const projects = await SBDL.getProjectsFromPlaylistURL('@griffpatch', {
        page: 2,
        concurrency: 4,
    });

    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).toContain('offset=40');
    expect(projects).toHaveLength(40);
});

test('search shorthand and out-of-order search URL query parameters work', async () => {
    const requestedUrls: string[] = [];
    vi.mocked(global.fetch).mockImplementation((url) => {
        requestedUrls.push(url.toString());
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve([
                { id: 777, title: 'Platformer', author: { username: 'dev' } },
            ]),
        } as Response);
    });

    const shorthandRes = await SBDL.getProjectsFromPlaylistURL('search/platformer');
    expect(shorthandRes).toHaveLength(1);
    expect(requestedUrls[0]).toContain('/search/projects?mode=popular&q=platformer');

    const urlRes = await SBDL.getProjectsFromPlaylistURL('https://scratch.mit.edu/search/projects?mode=popular&q=platformer');
    expect(urlRes).toHaveLength(1);
    expect(requestedUrls[1]).toContain('/search/projects?q=platformer&mode=popular');
});

test('featured/curated and featured/top filter to their specific categories', async () => {
    vi.mocked(global.fetch).mockImplementation(() =>
        Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                community_featured_projects: [{ id: 1, title: 'Featured', creator: 'a', type: 'project' }],
                curator_top_projects: [{ id: 2, title: 'Curated', creator: 'b', type: 'project' }],
                community_most_loved_projects: [{ id: 3, title: 'TopLoved', creator: 'c', type: 'project' }],
            }),
        } as Response)
    );

    const curated = await SBDL.getProjectsFromPlaylistURL('featured/curated');
    expect(curated?.map((p) => p.id)).toEqual([2]);

    const top = await SBDL.getProjectsFromPlaylistURL('featured/top');
    expect(top?.map((p) => p.id)).toEqual([3]);
});

test('mystuff propagates auth errors instead of silently returning empty array', async () => {
    vi.mocked(global.fetch).mockImplementation(() =>
        Promise.resolve({
            ok: false,
            status: 403,
        } as Response)
    );

    await expect(
        SBDL.getProjectsFromPlaylistURL('mystuff', { sessionId: 'expired-session' })
    ).rejects.toThrow(/403/);
});

test('mystuff stops gracefully on 404 after page 1 and respects limit', async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
        if (url.toString().includes('page=1')) {
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve([
                    { pk: 1, fields: { title: 'A', creator: { username: 'me' } } },
                    { pk: 2, fields: { title: 'B', creator: { username: 'me' } } },
                    { pk: 3, fields: { title: 'C', creator: { username: 'me' } } },
                ]),
            } as Response);
        }
        return Promise.resolve({ ok: false, status: 404 } as Response);
    });

    const limited = await SBDL.getProjectsFromPlaylistURL('mystuff', {
        sessionId: 'valid-session',
        limit: 2,
    });
    expect(limited).toHaveLength(2);
    expect(limited?.map((p) => p.id)).toEqual([1, 2]);
});
