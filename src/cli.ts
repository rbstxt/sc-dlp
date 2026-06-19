import kleur from "kleur";
import * as cliProgress from "cli-progress";
import * as SBDL from "./export-node.js";
import { parseArguments, printHelp } from "./cli/args.js";
import { extractProjectID, extractProjectInfo, isURL, logError } from "./cli/utils.js";
import { makeDownloader } from "./cli/download.js";
import { login, checkStatus, logout } from "./cli/auth.js";
import { loadConfig } from "./cli/config.js";
import { handleConfigCommand } from "./cli/config_command.js";

const run = async () => {
  const parsedArgs = parseArguments(process.argv.slice(2));
  const config = loadConfig();

  if (parsedArgs.config) {
    await handleConfigCommand(process.argv.slice(3));
    return;
  }

  if (parsedArgs.login) {
    await login();
    return;
  }

  if (parsedArgs.status) {
    await checkStatus();
    return;
  }

  if (parsedArgs.logout) {
    await logout();
    return;
  }

  if (parsedArgs.deleteAccount) {
    parsedArgs.inputs.push("https://scratch.mit.edu/accounts/settings/delete_account_confirmation/");
  }

  if (parsedArgs.inputs.length === 0 || parsedArgs.help) {
    printHelp();
    return;
  }

  const allProjectsToDownload = [];

  for (const input of parsedArgs.inputs) {
    let projectList: any[] = [];
    const info = extractProjectInfo(input, config);
    const id = info ? info.id : null;
    const projectToken = info ? info.token : null;
    const projectUrlStr = info ? info.projectUrl : null;

    const isPlaylist = !id && !projectUrlStr || (input !== id && !projectToken && !projectUrlStr && (isURL(input) || input.startsWith("@") || input.includes("/") || input.toLowerCase().startsWith("mystuff") || input.toLowerCase().startsWith("recent") || input.toLowerCase().startsWith("featured") || input.toLowerCase().startsWith("trending") || input.toLowerCase().startsWith("popular") || input.toLowerCase().startsWith("explore")));

    if (isPlaylist) {
      process.stdout.write(kleur.dim(`Checking if ${input} is a playlist... `));
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
            if (type === 'metadata') {
              process.stdout.write(`\r${kleur.dim(`Checking if ${input} is a playlist... Found ${loaded} projects.`)}`);
            }
          }
        });
        if (playlistProjects) {
          projectList = playlistProjects;
          process.stdout.write("\r\x1b[K");
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
            // Keep it as an empty list to avoid falling back to single project download
            // which would likely fail anyway with IDs like "trending/all"
            projectList = [null]; // Placeholder to prevent fallback below
            projectList.pop(); // Make it empty again
            continue; // Move to next input
          }
        } else {
          process.stdout.write("\r");
        }
      } catch (e: any) {
        process.stdout.write("\r");
        console.error(kleur.red(`Error: ${e.message}`));
        if (parsedArgs.verbose) {
          console.error(kleur.dim(e.stack));
        }
        return;
      }
    }

    if (projectList.length === 0) {
      projectList.push({
        id: id || input,
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
    return;
  }

  const multibar = new cliProgress.MultiBar(
    {
      clearOnComplete: false,
      hideCursor: true,
      format: "{id} {bar} {percentage}% | {value}/{total} | {info}",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      forceRedraw: true,
      fps: 10,
      noTTYOutput: !process.stdout.isTTY,
    },
    cliProgress.Presets.shades_grey,
  );

  const downloaderOptions = {
    ...parsedArgs,
    proxy: config.proxy,
    language: parsedArgs.language || config.language || "en",
  };
  const downloadProject = makeDownloader(downloaderOptions, multibar);

  const queue = [...allProjectsToDownload];
  const workers = [];
  const numWorkers = Math.min(parsedArgs.jobs, queue.length);

  const totalToDownload = allProjectsToDownload.length;
  let downloadedCount = 0;

  const totalBar = multibar.create(totalToDownload, 0, {
    id: kleur.bold().green("[total]".padEnd(12)),
    info: `0/${totalToDownload}`,
  });

  const worker = async () => {
    while (queue.length > 0) {
      const project = queue.shift();
      if (!project) break;

      const projectIndex = ++downloadedCount;
      if (totalToDownload > 1) {
        multibar.log(
          `${kleur.blue("[batch]".padEnd(12))} ${kleur.bold(
            `[${projectIndex}/${totalToDownload}]`,
          )} Starting: ${kleur.yellow(project.id)}\n`,
        );
      }

      await downloadProject(project);
      totalBar.update(downloadedCount, { info: `${downloadedCount}/${totalToDownload}` });
    }
  };

  for (let i = 0; i < numWorkers; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  if (totalToDownload > 0) {
    const successPrefix = `[success]`.padEnd(12);
    multibar.log(
      `${kleur.green(successPrefix)} All ${totalToDownload} projects processed successfully.\n`,
    );
  }

  // Wait a bit to ensure all logs reach the terminal before stopping the multibar
  await new Promise((resolve) => setTimeout(resolve, 200));
  multibar.stop();
  SBDL.clearAssetCache();
};

run()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(kleur.red(`\nSomething went wrong: ${err.message}`));
    if (process.env.DEBUG || process.argv.includes("--verbose")) {
      console.error(kleur.dim(err.stack));
    }
    process.exit(1);
  });
