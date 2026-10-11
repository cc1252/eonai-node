import {build} from 'esbuild';
await build({entryPoints:['vendor/official-exit/provider-node/official-exit.ts'], outfile:'dist/official-exit.mjs', bundle:true, platform:'node', format:'esm', target:'node24', legalComments:'eof'});
