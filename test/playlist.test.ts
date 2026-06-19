import { expect, test, vi, beforeAll, afterAll } from "vitest";
import * as SBDL from "../src/export-node.js";

const originalFetch = global.fetch;

beforeAll(() => {
  global.fetch = vi.fn();
});

afterAll(() => {
  global.fetch = originalFetch;
});

test("get projects from user profile URL", async () => {
  vi.mocked(fetch).mockImplementation((url) => {
    if (url.toString().includes("/users/user1/projects")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 1, title: "Project 1", author: { username: "user1" } },
            { id: 2, title: "Project 2", author: { username: "user1" } },
          ]),
      } as Response);
    }
    return Promise.resolve({ ok: false } as Response);
  });

  const projects = await SBDL.getProjectsFromPlaylistURL(
    "https://scratch.mit.edu/users/user1/",
  );
  expect(projects).toHaveLength(2);
  expect(projects![0].id).toBe(1);
  expect(projects![0].title).toBe("Project 1");
});

test("get projects from homepage", async () => {
  vi.mocked(fetch).mockImplementation((url) => {
    if (url.toString().includes("/proxy/featured")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            community_featured_projects: [
              { id: 100, title: "P1", creator: "user1", type: "project" },
            ],
            community_most_loved_projects: [
              { id: 200, title: "P2", creator: "user2", type: "project" },
              { id: 100, title: "P1", creator: "user1", type: "project" }, // duplicate
            ],
          }),
      } as Response);
    }
    return Promise.resolve({ ok: false } as Response);
  });

  const projects = await SBDL.getProjectsFromPlaylistURL(
    "https://scratch.mit.edu/",
  );
  expect(projects).toHaveLength(2);
  expect(projects![0].id).toBe(100);
  expect(projects![1].id).toBe(200);
});

test("get projects from user profile URL with /projects/ and page parameter", async () => {
  vi.mocked(fetch).mockImplementation((url) => {
    if (url.toString().includes("/users/user1/projects")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 1, author: { username: "user1" } },
            { id: 2, author: { username: "user1" } },
          ]),
      } as Response);
    }
    return Promise.resolve({ ok: false } as Response);
  });

  const projects = await SBDL.getProjectsFromPlaylistURL(
    "https://scratch.mit.edu/users/user1/projects/?page=1",
  );
  expect(projects).toHaveLength(2);
});

test("get projects from studio URL", async () => {
  vi.mocked(fetch).mockImplementation((url) => {
    if (url.toString().includes("/studios/123/projects")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 10,
              title: "Studio Project 1",
              author: { username: "author1" },
            },
          ]),
      } as Response);
    }
    return Promise.resolve({ ok: false } as Response);
  });

  const projects = await SBDL.getProjectsFromPlaylistURL(
    "https://scratch.mit.edu/studios/123/",
  );
  expect(projects).toHaveLength(1);
  expect(projects![0].id).toBe(10);
});

test("get projects from favorites URL", async () => {
  vi.mocked(fetch).mockImplementation((url) => {
    if (url.toString().includes("/users/user1/favorites")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([{ id: 200, author: { username: "fav1" } }]),
      } as Response);
    }
    return Promise.resolve({ ok: false } as Response);
  });

  const projects = await SBDL.getProjectsFromPlaylistURL(
    "https://scratch.mit.edu/users/user1/favorites/",
  );
  expect(projects).toHaveLength(1);
  expect(projects![0].id).toBe(200);
});

test("get projects from remixes URL", async () => {
  vi.mocked(fetch).mockImplementation((url) => {
    if (url.toString().includes("/projects/12345/remixes")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([{ id: 300, author: { username: "remixer1" } }]),
      } as Response);
    }
    return Promise.resolve({ ok: false } as Response);
  });

  const projects = await SBDL.getProjectsFromPlaylistURL(
    "https://scratch.mit.edu/projects/12345/remixes/",
  );
  expect(projects).toHaveLength(1);
  expect(projects![0].id).toBe(300);
});

test("get projects from search URL", async () => {
  vi.mocked(fetch).mockImplementation((url) => {
    if (url.toString().includes("/search/projects?q=test")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 100,
              title: "Search Result",
              author: { username: "searcher" },
            },
          ]),
      } as Response);
    }
    return Promise.resolve({ ok: false } as Response);
  });

  const projects = await SBDL.getProjectsFromPlaylistURL(
    "https://scratch.mit.edu/search/projects?q=test",
  );
  expect(projects).toHaveLength(1);
  expect(projects![0].id).toBe(100);
});

test("get projects from explore URL", async () => {
  vi.mocked(fetch).mockImplementation((url) => {
    if (url.toString().includes("/explore/projects?q=animations")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 500,
              title: "Animation Project",
              author: { username: "animator" },
            },
          ]),
      } as Response);
    }
    return Promise.resolve({ ok: false } as Response);
  });

  const projects = await SBDL.getProjectsFromPlaylistURL(
    "https://scratch.mit.edu/explore/projects/animations/",
  );
  expect(projects).toHaveLength(1);
  expect(projects![0].id).toBe(500);
});

test("get projects from @username shorthand", async () => {
  vi.mocked(fetch).mockImplementation((url) => {
    if (url.toString().includes("/users/griffpatch/projects")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: "123", title: "P1", author: { username: "griffpatch" } },
            { id: "456", title: "P2", author: { username: "griffpatch" } },
          ]),
      } as Response);
    }
    return Promise.resolve({ ok: false } as Response);
  });

  const projects = await SBDL.getProjectsFromPlaylistURL("@griffpatch");
  expect(projects).toHaveLength(2);
  expect(projects![0].id).toBe("123");
});

test("pagination handles multiple pages", async () => {
  vi.mocked(fetch).mockImplementation((url) => {
    const urlStr = url.toString();
    if (urlStr.includes("offset=0")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            Array.from({ length: 40 }, (_, i) => ({
              id: i,
              title: `P${i}`,
              author: { username: "u" },
            })),
          ),
      } as Response);
    } else if (urlStr.includes("offset=40")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            Array.from({ length: 10 }, (_, i) => ({
              id: i + 40,
              title: `P${i + 40}`,
              author: { username: "u" },
            })),
          ),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
  });

  const projects = await SBDL.getProjectsFromPlaylistURL(
    "https://scratch.mit.edu/users/user1/",
  );
  expect(projects).toHaveLength(50);
  expect(projects![0].id).toBe(0);
  expect(projects![49].id).toBe(49);
});

test("get projects from featured shorthand", async () => {
  vi.mocked(fetch).mockImplementation((url) => {
    if (url.toString().includes("/proxy/featured")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            community_featured_projects: [
              { id: 100, title: "P1", creator: "user1", type: "project" },
            ],
            community_most_remixed_projects: [
              { id: 200, title: "P2", creator: "user2", type: "project" },
            ],
          }),
      } as Response);
    }
    return Promise.resolve({ ok: false } as Response);
  });

  const projects = await SBDL.getProjectsFromPlaylistURL("featured");
  expect(projects).toHaveLength(2);
  expect(projects![0].id).toBe(100);
  expect(projects![1].id).toBe(200);
});

test("get projects from featured/mostremixed shorthand", async () => {
  vi.mocked(fetch).mockImplementation((url) => {
    if (url.toString().includes("/proxy/featured")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            community_featured_projects: [
              { id: 100, title: "P1", creator: "user1", type: "project" },
            ],
            community_most_remixed_projects: [
              { id: 200, title: "P2", creator: "user2", type: "project" },
            ],
          }),
      } as Response);
    }
    return Promise.resolve({ ok: false } as Response);
  });

  const projects = await SBDL.getProjectsFromPlaylistURL("featured/mostremixed");
  expect(projects).toHaveLength(1);
  expect(projects![0].id).toBe(200);
});

test("get projects from featured/remix alias", async () => {
  vi.mocked(fetch).mockImplementation((url) => {
    if (url.toString().includes("/proxy/featured")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            community_most_remixed_projects: [
              { id: 200, title: "P2", creator: "user2", type: "project" },
            ],
          }),
      } as Response);
    }
    return Promise.resolve({ ok: false } as Response);
  });

  const projects = await SBDL.getProjectsFromPlaylistURL("featured/remix");
  expect(projects).toHaveLength(1);
  expect(projects![0].id).toBe(200);
});
