import * as SBDL from './lib/bundle-node.cjs';

console.time('Download project');
SBDL.downloadProjectFromID('60917032', {
  onProgress: (type, loaded, total) => {
    console.log(type, loaded, total);
  }
})
  .then((project) => {
    console.timeEnd('Download project');
    console.log(project);
  }).catch((err) => {
    console.error(err);
  });
