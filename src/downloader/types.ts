export type ProjectType = 'sb' | 'sb2' | 'sb3';

export interface DownloadedProject {
    title: string;
    type: ProjectType;
    arrayBuffer: ArrayBuffer;
    modified?: string;
    created?: string;
    shared?: string;
}

export interface Options {
    /** Called periodically with progress updates. */
    onProgress?: (type: 'project' | 'assets' | 'compress' | 'metadata' | 'mapping', loaded: number, total: number, info?: string) => void;
    /** The date to use for the "last modified" time in generated projects. If not set, defaults to an arbitrary date in the past. */
    date?: Date;
    /** Whether to compress generated projects or not. Compressed projects take longer to generate but are much smaller. Defaults to true. */
    compress?: boolean;
    /** An AbortSignal that can be used to cancel the download. */
    signal?: AbortSignal;
    /** The URL from which to download assets from. $id is replaced with the asset ID (md5ext). */
    assetHost?: string;
    /** Called during the download to access project.json. Return an object to replace project.json. */
    processJSON?: (type: ProjectType, data: any) => any | Promise<any>;
    /** Whether to skip downloading project assets. Defaults to false. */
    skipAssets?: boolean;
    /** Number of times to retry asset downloads. */
    assetRetries?: number;
    /** Whether to bypass cache and refresh data. */
    refresh?: boolean;
    /** Authentication token (x-token) */
    token?: string | null;
    /** Session ID (scratchsessionsid) */
    sessionId?: string | null;
    /** Current username */
    username?: string | null;
    /** internal use */
    offset?: number;
    /** internal use */
    limit?: number;
    /** Mapping from md5ext to internal content hash (e.g. sha256) for TurboWarp Share projects. */
    assetMapping?: Record<string, string>;
    /** Page number to fetch for collections. */
    page?: number;
    /** Language for search results. */
    language?: string;
    /** Project token for restricted projects. */
    projectToken?: string;
    /** Number of pages to fetch in parallel. */
    concurrency?: number;
}

export interface SB2Project {
    costumes: SB2Costume[];
    sounds: SB2Sound[];
    children: Array<SB2ListMonitor | SB2VariableMonitor | SB2Sprite>;
}

export interface SB2ListMonitor {
    listName: string;
}

export interface SB2VariableMonitor {
    target: string;
}

export interface SB2Sprite {
    objName?: string;
    costumes: SB2Costume[];
    sounds: SB2Sound[];
}

export interface SB2Costume {
    costumeName: string;
    baseLayerID: number;
    baseLayerMD5: string;
    bitmapResolution: number;
    rotationCenterX: number;
    rotationCenterY: number;
    textLayerMD5?: string;
    textLayerID?: number;
}

export interface SB2Sound {
    soundName: string;
    soundID: number;
    md5: string;
    sampleCount: number;
    rate: number;
    format: string;
}

export interface SB3Project {
    targets: SB3Target[];
}

export interface SB3Target {
    name: string;
    isStage: boolean;
    sounds: SB3Asset[];
    costumes: SB3Asset[];
}

/** Raw costume or sound data from an sb3 project.json. */
export interface SB3Asset {
    assetId: string;
    dataFormat: string;
    md5ext?: string;
}

export interface ProjectMetadata {
    id: number;
    title: string;
    description: string;
    instructions: string;
    visibility: string;
    public: boolean;
    comments_allowed: boolean;
    is_published: boolean;
    author: {
        id: number;
        username: string;
        scratchteam: boolean;
        history: {
            joined: string;
        };
        profile: {
            id: null;
            images: Record<'90x90' | '60x60' | '55x55' | '50x50' | '32x32', string>;
        };
    };
    image: string;
    images: Record<'282x218' | '216x163' | '200x200' | '144x108' | '135x102' | '100x80', string>;
    history: {
        created: string;
        modified: string;
        shared: string;
    };
    stats: {
        views: number;
        loves: number;
        favorites: number;
        remixes: number;
    };
    remix: {
        parent: number | null;
        root: number | null;
    };
    project_token: string;
}

export interface ProjectSummary {
    id: number;
    title: string;
    author: string;
}
