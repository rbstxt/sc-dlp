import kleur from "kleur";
import { ParsedArgs } from "./types.js";
import { parsePlaylistItems } from "./utils.js";

const HELP = `
${kleur.bold().cyan("sc-dlp: Downloader for Scratch projects")}

Usage: ${kleur.green("sc-dlp [options...] <projects...>")}

Projects can be:
 - A Scratch project ID eg. ${kleur.yellow("'60917032'")}
 - A Scratch project URL eg. ${kleur.yellow("'https://scratch.mit.edu/projects/60917032/'")}
 - A Scratch user shorthand eg. ${kleur.yellow("'@griffpatch'")}
 - A Scratch user URL eg. ${kleur.yellow("'https://scratch.mit.edu/users/griffpatch/'")}
 - A Scratch studio URL eg. ${kleur.yellow("'https://scratch.mit.edu/studios/36244126/'")}
 - A Scratch search URL eg. ${kleur.yellow("'https://scratch.mit.edu/search/projects?q=a'")}
 - A Scratch explore URL eg. ${kleur.yellow("'https://scratch.mit.edu/explore/projects/all'")}
 - An arbitrary URL eg. ${kleur.yellow("'https://example.com/project.sb3'")}

Options:
 login                         Log in to Scratch interactive
 status                        Check current login status
 logout                        Log out from Scratch
 config [options...]           Manage configuration (use --help for more)
 deleteaccount                 Download projects from account deletion page
 --help                        Shows this screen
 --language CODE               Override language for search results (default: en)\n  --project-token TOKEN         Token to access private projects
 --playlist-start NUMBER       Playlist item to start at (default is 1)
 --playlist-end NUMBER         Playlist item to end at (default is last)
 --playlist-items ITEMS        Playlist items to download. Specify indices separated
                               by commas like: 1,2,5,10-15
 -I ITEMS                      Alias for --playlist-items
 --format EXT                  Output file extension (default: sb3)
 --no-assets                   Do not download any assets
 -a                            Alias for --no-assets
 --json-only                   Download only the project.json file (implies --format json)
 -j                            Alias for --json-only
 --retries NUMBER              Number of times to retry asset downloads (default: 5)
 --concurrency NUMBER          Number of projects to download in parallel (default: 1)
 -c                            Alias for --concurrency
 --conflict ACTION             Conflict action: overwrite, skip, keep-both
 --mtime                       Set file modification time to project last modified date
 -m                            Alias for --mtime
 --write-thumbnail             Download project thumbnail
 -t                            Alias for --write-thumbnail
 --thumbnail-size WIDTHxHEIGHT
                               Thumbnail size (default: 9999x9999)
  -l                           Alias for --limit
  --verbose                    Show more information
  -v                           Alias for --verbose
`;

export const printHelp = () => {
    console.log(HELP.trim());
};

export const parseArguments = (args: string[]): ParsedArgs => {
    const parsedArgs: ParsedArgs = {
        inputs: [],
        playlistStart: 1,
        playlistEnd: Infinity,
        playlistItems: null,
        format: null,
        noAssets: false,
        jsonOnly: false,
        retries: 5,
        jobs: 1,
        mtime: false,
        writeThumbnail: false,
        thumbnailSize: "9999x9999",
        verbose: false,
        help: false,
        login: false,
        status: false,
        logout: false,
        config: false,
        deleteAccount: false,
        page: null,
        limit: Infinity,
        conflictAction: null,
        language: null,
        projectToken: null,
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "login") {
            parsedArgs.login = true;
        } else if (arg === "status") {
            parsedArgs.status = true;
        } else if (arg === "logout") {
            parsedArgs.logout = true;
        } else if (arg === "config") {
            parsedArgs.config = true;
            // Config command takes over the rest of the arguments
            parsedArgs.inputs.push(...args.slice(i + 1));
            break;
        } else if (arg === "deleteaccount") {
            parsedArgs.deleteAccount = true;
        } else if (arg === "--help") {
            parsedArgs.help = true;
        } else if (arg === "--language") {
            parsedArgs.language = args[++i];
        } else if (arg === "--project-token") {
            parsedArgs.projectToken = args[++i];
        } else if (arg === "--playlist-start") {
            parsedArgs.playlistStart = parseInt(args[++i], 10);
        } else if (arg === "--playlist-end") {
            parsedArgs.playlistEnd = parseInt(args[++i], 10);
        } else if (arg === "--playlist-items" || arg === "-I") {
            const items = args[++i];
            parsedArgs.playlistItems = parsePlaylistItems(items);
        } else if (arg === "--format") {
            parsedArgs.format = args[++i];
        } else if (arg === "--no-assets" || arg === "-a") {
            parsedArgs.noAssets = true;
        } else if (arg === "--json-only" || arg === "-j") {
            parsedArgs.jsonOnly = true;
            if (!parsedArgs.format) parsedArgs.format = "json";
        } else if (arg === "--retries") {
            parsedArgs.retries = parseInt(args[++i], 10);
        } else if (arg === "--concurrency" || arg === "-c" || arg === "--jobs") {
            parsedArgs.jobs = parseInt(args[++i], 10);
        } else if (arg === "--conflict") {
            parsedArgs.conflictAction = args[++i] as any;
        } else if (arg === "--limit" || arg === "-l") {
            parsedArgs.limit = parseInt(args[++i], 10);
        } else if (arg === "--mtime" || arg === "-m") {
            parsedArgs.mtime = true;
        } else if (arg === "--write-thumbnail" || arg === "-t") {
            parsedArgs.writeThumbnail = true;
        } else if (arg === "--thumbnail-size") {
            parsedArgs.thumbnailSize = args[++i];
        } else if (arg === "--page") {
            parsedArgs.page = parseInt(args[++i], 10);
        } else if (arg === "--verbose" || arg === "-v") {
            parsedArgs.verbose = true;
        } else if (arg.startsWith("-")) {
            console.warn(kleur.yellow(`Unknown option: ${arg}`));
        } else {
            parsedArgs.inputs.push(arg);
        }
    }

    return parsedArgs;
};
