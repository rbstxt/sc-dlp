export interface ParsedArgs {
    inputs: string[];
    playlistStart: number;
    playlistEnd: number;
    playlistItems: Set<number> | null;
    format: string | null;
    noAssets: boolean;
    jsonOnly: boolean;
    retries: number;
    jobs: number;
    mtime: boolean;
    writeThumbnail: boolean;
    thumbnailSize: string;
    verbose: boolean;
    help: boolean;
    login: boolean;
    status: boolean;
    logout: boolean;
    config: boolean;
    deleteAccount: boolean;
    page: number | null;
    limit: number;
    conflictAction: ConflictAction | null;
    language: string | null;
    projectToken: string | null;
}

export type ConflictAction = 'overwrite' | 'skip' | 'keep-both';

export interface UserConfig {
    username: string | null;
    userId: number | null;
    token: string | null;
    sessionId: string | null;
    language: string;
    conflictAction: ConflictAction | null;
    proxy: string | null;
    turbowarpMirrors: string[];
    urls: {
        api: string;
        site: string;
        assets: string;
        projects: string;
        login: string;
        projectsAll: string;
        turbowarpShare: string;
        turbowarpApi: string;
    };
}
