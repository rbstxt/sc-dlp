import kleur from "kleur";
import * as SBDL from "./export-node.js";
import { parseArguments, printHelp } from "./cli/args.js";
import { extractProjectInfo, isURL } from "./cli/utils.js";
import { makeDownloader } from "./cli/download.js";
import { createDisplayManager } from "./cli/download/display.js";
import { createConflictResolver } from "./cli/download/conflict.js";
import { login, checkStatus, logout } from "./cli/auth.js";
import { loadConfig } from "./cli/config.js";
import { handleConfigCommand } from "./cli/config_command.js";
import { closeProxyAgent } from "./fetch-wrapper.js";

const run = async (): Promise<number> => {
  const parsedArgs = parseArguments(process.argv.slice(2));
  const config = loadConfig();

  if (parsedArgs.config) {
    await handleConfigCommand(parsedArgs.inputs);
    return 0;
  }

  if (parsedArgs.login) {
    await login();
    return 0;
  }

  if (parsedArgs.status) {
    await checkStatus();
    return 0;
  }

  if (parsedArgs.logout) {
    await logout();
    return 0;
  }

  if (parsedArgs.deleteAccount) {
    parsedArgs.inputs.push("https://scratch.mit.edu/accounts/settings/delete_account_confirmation/");
  }

  if (parsedArgs.inputs.length === 0 || parsedArgs.help) {
    printHelp();
    return 0;
  }

  const allProjectsToDownload: any[] = [];
  const isTTY = Boolean(process.stdout.isTTY);

  for (const input of parsedArgs.inputs) {
    let projectList: any[] = [];
    const info = extractProjectInfo(input, config);
    const id = info ? info.id : null;
    const projectToken = info ? info.token : null;
    const projectUrlStr = info ? info.projectUrl : null;

    const lowerInput = input.toLowerCase();
    const isPlaylist =
      (!id && !projectUrlStr) ||
      (input !== id &&
        !projectToken &&
        !projectUrlStr &&
        (isURL(input) ||
          input.startsWith("@") ||
          input.includes("/") ||
          lowerInput.startsWith("mystuff") ||
          lowerInput.startsWith("recent") ||
          lowerInput.startsWith("featured") ||
          lowerInput.startsWith("trending") ||
          lowerInput.startsWith("popular") ||
          lowerInput.startsWith("explore") ||
          lowerInput.startsWith("search")));

    if (isPlaylist) {
      if (isTTY) {
        process.stdout.write(kleur.dim(`Checking if ${input} is a playlist... `));
      }
      try {
        const playlistProjects = await SBDL.getProjectsFromPlaylistURL(input, {
          token: config.token,
          sessionId: config.sessionId,
          username: config.username,
          language: parsedArgs.language || config.language || "en",
          limit: parsedArgs.limit,
          page: parsedArgs.page ?? undefined,
          concurrency: parsedArgs.jobs,
          onProgress: (type, loaded) => {
            if (type === "metadata" && isTTY) {
              process.stdout.write(
                `\r${kleur.dim(`Checking if ${input} is a playlist... Found ${loaded} projects.`)}`
              );
            }
          },
        });
        if (playlistProjects) {
          projectList = playlistProjects;
          if (isTTY) {
            process.stdout.write("\r\x1b[K");
          }
          console.log(kleur.green(`Found ${projectList.length} projects.`));
          if (parsedArgs.verbose) {
            projectList.forEach((p, idx) => {
              console.log(
                kleur.dim(
                  `  [${idx + 1}] ID: ${p.id}, Title: ${p.title || "Unknown"}`
                )
              );
            });
          }
          if (projectList.length === 0) {
            // Avoid falling back to single project download for valid but empty playlists
            continue;
          }
        } else if (isTTY) {
          process.stdout.write("\r\x1b[K");
        }
      } catch (e: any) {
        if (isTTY) {
          process.stdout.write("\r\x1b[K");
        }
        console.error(kleur.red(`Error: ${e.message}`));
        if (parsedArgs.verbose && e.stack) {
          console.error(kleur.dim(e.stack));
        }
        return 1;
      }
    }

    if (projectList.length === 0) {
      projectList.push({
        id: projectUrlStr ? null : id || input,
        projectUrl: projectUrlStr,
        isSingle: true,
      });
    }

    // Filter playlist
    const filteredList = projectList.filter((_, index) => {
      const playlistIndex = index + 1;
      if (parsedArgs.playlistItems) {
        return parsedArgs.playlistItems.has(playlistIndex);
      }
      return (
        playlistIndex >= parsedArgs.playlistStart &&
        playlistIndex <= parsedArgs.playlistEnd
      );
    });

    for (let i = 0; i < filteredList.length; i++) {
      allProjectsToDownload.push({
        ...filteredList[i],
        projectToken: filteredList[i].projectToken || projectToken,
        projectUrl: filteredList[i].projectUrl || projectUrlStr,
        index: i + 1,
        totalInInput: filteredList.length,
      });
    }
  }

  if (allProjectsToDownload.length === 0) {
    console.warn(kleur.yellow("No projects to download after filtering."));
    return 0;
  }

  const display = createDisplayManager();
  const conflictResolver = createConflictResolver(display);

  const downloaderOptions = {
    ...parsedArgs,
    conflictAction: parsedArgs.conflictAction || config.conflictAction,
    language: parsedArgs.language || config.language || "en",
  };
  const downloadProject = makeDownloader(downloaderOptions, display, conflictResolver);

  const queue = [...allProjectsToDownload];
  const totalToDownload = allProjectsToDownload.length;
  const numWorkers = Math.max(1, Math.min(parsedArgs.jobs, queue.length));

  let startedCount = 0;
  let completedCount = 0;
  let succeededCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const totalBar = totalToDownload > 1 ? display.createTotalBar(totalToDownload) : null;
  // Allocate one fixed bar slot per worker to avoid MultiBar remove/create cursor desyncs
  const workerBars = Array.from({ length: numWorkers }, (_, idx) =>
    display.createWorkerBar(numWorkers > 1 ? `[worker-${idx + 1}]` : "[download]")
  );

  const formatTotalInfo = () => {
    const parts = [`${completedCount}/${totalToDownload}`];
    if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
    if (failedCount > 0) parts.push(`${failedCount} failed`);
    return parts.join(" | ");
  };

  const worker = async (workerIndex: number) => {
    const bar = workerBars[workerIndex];
    while (queue.length > 0) {
      const project = queue.shift();
      if (!project) break;

      const projectIndex = ++startedCount;
      if (totalToDownload > 1) {
        const label = project.id || project.projectUrl || "project";
        display.log(
          `${kleur.blue("[batch]".padEnd(12))} ${kleur.bold(
            `[${projectIndex}/${totalToDownload}]`
          )} Starting: ${kleur.yellow(String(label))}\n`
        );
      }

      const status = await downloadProject(project, bar);
      completedCount++;
      if (status === "downloaded") {
        succeededCount++;
      } else if (status === "skipped") {
        skippedCount++;
      } else {
        failedCount++;
      }

      totalBar?.update(completedCount, { info: formatTotalInfo() });
    }

    if (numWorkers > 1) {
      bar.setTotal(1);
      bar.update(1, {
        id: kleur.dim(`[worker-${workerIndex + 1}]`.padEnd(12)),
        info: "idle",
      });
    }
  };

  try {
    const workers = Array.from({ length: numWorkers }, (_, i) => worker(i));
    await Promise.all(workers);

    if (totalToDownload > 0) {
      if (failedCount === 0) {
        const summary =
          skippedCount > 0
            ? `Processed ${totalToDownload} projects (${succeededCount} downloaded, ${skippedCount} skipped).`
            : `All ${totalToDownload} projects processed successfully.`;
        display.log(`${kleur.green("[success]".padEnd(12))} ${summary}\n`);
      } else {
        display.log(
          `${kleur.yellow("[summary]".padEnd(12))} Processed ${totalToDownload} projects (${succeededCount} downloaded, ${skippedCount} skipped, ${failedCount} failed).\n`
        );
      }
    }
  } finally {
    display.stop();
    SBDL.clearAssetCache();
    await closeProxyAgent();
  }

  return failedCount > 0 ? 1 : 0;
};

run()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch(async (err) => {
    console.error(kleur.red(`\nSomething went wrong: ${err.message}`));
    if (process.env.DEBUG || process.argv.includes("--verbose") || process.argv.includes("-v")) {
      console.error(kleur.dim(err.stack));
    }
    await closeProxyAgent();
    process.exit(1);
  });
