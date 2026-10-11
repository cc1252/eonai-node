#!/usr/bin/env node
// EonAI supplier node. The TCP exit engine in dist/ is compiled from unmodified third-party
// Apache-2.0 source in vendor/official-exit/; see NOTICE.
import {readFileSync,writeFileSync,chmodSync,existsSync,mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import WebSocket from 'ws';
import {ProviderOfficialExitTunnelManager} from './dist/official-exit.mjs';
import {normalizeCodexAuthJson} from './codex-auth-json.mjs';
import {saveBinding,handleSyncRequest} from './codex-local-sync.mjs';
import {normalizeSubscriptionCredentials} from './subscription-credentials.mjs';
import {vendors,officialHosts,vendorEndpoint,supplyVersion} from './providers.mjs';
const dir=process.env.EONAI_NODE_HOME||join(homedir(),'.eonai-node');mkdirSync(dir,{recursive:true,mode:0o700});
const file=join(dir,'identity.json'),syncFile=join(dir,'codex-sync.json'),args=process.argv.slice(2),command=args.shift();
const platform='https://api.eonaibusiness.com';
let identity=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null;
async function api(path,body){const response=await fetch(platform+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(identity?{'x-provider-node-id':identity.nodeId,'x-provider-node-secret':identity.providerNodeSecret}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(path==='/internal/provider/credentials'&&body?150000:20000),redirect:'error'});if(!response.ok){let message;try{message=(await response.json()).message;}catch{}throw new Error(/^[a-z_]{3,80}$/.test(message||'')?message:'platform_rejected_'+response.status);}return response.json();}
if(command==='bind'){
  const path=args[0];if(!path)throw new Error('Usage: node node.mjs bind <binding-code-file> (code is not a command-line argument)');
  if(identity)throw new Error('Already bound. Revoke the old node in the supplier portal before changing the identity.');
  identity=await api('/internal/provider/bind',{bindingCode:readFileSync(resolve(path),'utf8').trim(),nodeId:randomUUID(),nodeVersion:'eonai-'+supplyVersion});
  writeFileSync(file,JSON.stringify(identity),{mode:0o600});chmodSync(file,0o600);
  console.log('Node bound to EonAI. Identity saved locally; do not share identity.json.');
}else if(command==='import-key'){
  if(!identity)throw new Error('Bind first.');const [vendor,path,variant='default']=args;
  if(!vendorEndpoint(vendor,variant)||!path)throw new Error('Usage: node node.mjs import-key <vendor> <key-file> [default|coding]. Vendors: '+Object.keys(vendors).join(', '));
  const result=await api('/internal/provider/credentials',{vendor,variant,apiKey:readFileSync(resolve(path),'utf8').trim()});
  console.log('Encrypted credential registered:',result.data.id,'vendor:',vendor);
}else if(command==='import-codex'){
  if(!identity)throw new Error('Bind first.');const localSync=!args.includes('--no-sync'),[path,credentialBindingId]=args.filter(a=>a!=='--no-sync');if(!path)throw new Error('Usage: node node.mjs import-codex <explicit-auth-json-file> [credential-id] [--no-sync]');
  const bytes=readFileSync(resolve(path));if(bytes.length>128*1024)throw new Error('auth.json exceeds 128 KiB.');const authJson=JSON.parse(bytes);normalizeCodexAuthJson(authJson);
  const result=await api('/internal/provider/credentials',{vendor:'openai',credentialSource:'codex',...normalizeCodexAuthJson(authJson),credentialBindingId,localSync}).catch(e=>{throw e.message==='codex_local_login_expired'?new Error('Local Codex login has expired. Run Codex once on this machine so it renews its own login, then import again.'):e;});
  console.log('Verified Codex subscription registered:',result.data.id,'expires:',new Date(result.data.expiresAt).toISOString());
  if(localSync){saveBinding(syncFile,result.data.id,resolve(path));console.log('Local sync on: renewals are exchanged through this file, so local Codex keeps working. Keep "node node.mjs run" running on this machine.');}
  else console.log('Local sync off: this login is shared with any Codex CLI using the same file, and whichever side renews first invalidates the other. Prefer device-code authorization for an independent session.');
}else if(command==='import-subscription'){
  if(!identity)throw new Error('Bind first.');const [vendor,path,bindingArgument,region='cn']=args;const credentialBindingId=bindingArgument==='-'?undefined:bindingArgument;if(!path)throw new Error('Usage: node node.mjs import-subscription <anthropic|xai|moonshot> <explicit-credential-json-file> [credential-id] [cn|global]');
  const bytes=readFileSync(resolve(path));if(bytes.length>128*1024)throw new Error('Credential file exceeds 128 KiB.');const credentials=normalizeSubscriptionCredentials(vendor,JSON.parse(bytes));
  const result=await api('/internal/provider/credentials',{vendor,credentialSource:vendor==='anthropic'?'claude-code':vendor==='xai'?'grok-cli':'kimi-code',credentials,credentialBindingId,region}).catch(e=>{throw e.message==='subscription_local_login_expired'?new Error('This login file has expired. Run the vendor CLI once on this machine so it renews its own login, then import again. The platform does not renew an imported file, because that would sign the CLI out.'):e;});
  console.log('Official account and model catalog checked:',result.data.id,'vendor:',vendor,'expires:',new Date(result.data.expiresAt).toISOString());
  console.log('This login is shared with any CLI using the same file, and whichever side renews first invalidates the other. For an independent session, authorize in the supplier portal instead. Revoking this credential only removes the platform copy; the local CLI stays signed in.');
}else if(command==='import-oauth'){
  if(!identity)throw new Error('Bind first.');const path=args[0];if(!path)throw new Error('Usage: node node.mjs import-oauth <explicit-oauth-bundle-file>');
  const bundle=JSON.parse(readFileSync(resolve(path),'utf8'));
  const result=await api('/internal/provider/credentials',{...bundle,vendor:'openai'});
  console.log('Verified OAuth credential registered:',result.data.id,'expires:',new Date(result.data.expiresAt).toISOString());
}else if(command==='run'){
  if(!identity)throw new Error('Bind first.');
  const wsURL=new URL(identity.platformWsUrl);if(wsURL.protocol!=='wss:'||wsURL.hostname!=='api.eonaibusiness.com'||wsURL.pathname!=='/internal/provider/connect')throw new Error('Unexpected platform address');
  let stopping=false,ws,manager,heartbeat,retry,attempt=0;
  const connect=()=>{
    ws=new WebSocket(wsURL,{headers:{'x-provider-node-id':identity.nodeId,'x-provider-node-secret':identity.providerNodeSecret},maxPayload:256*1024,perMessageDeflate:false,handshakeTimeout:15000});
    manager=new ProviderOfficialExitTunnelManager(()=>({enabled:true,officialExit:{enabled:true},runtimeMode:'official_exit',nodeId:identity.nodeId,providerId:identity.providerId}), (message,options)=>{
      if(ws.readyState!==WebSocket.OPEN||ws.bufferedAmount>1024*1024)return {accepted:false,error:new Error('websocket_backpressure')};
      ws.send(typeof message==='object'&&!Buffer.isBuffer(message)?JSON.stringify(message):message,error=>options?.onComplete?.(error));return {accepted:true,bufferedBytes:ws.bufferedAmount};
    },officialHosts);
    ws.on('open',()=>{attempt=0;console.log('Connected to EonAI; no inbound ports required.');ws.send(JSON.stringify({type:'provider.hello',nodeId:identity.nodeId,providerId:identity.providerId,nodeVersion:'eonai-'+supplyVersion,runtimeMode:'official_exit',acceptingSessions:true,capabilities:[{routeMode:'official_exit',officialExit:{dataProtocols:['json_base64_v1']}}],transportCapabilities:{officialExitDataProtocols:['json_base64_v1']},eonaiCapabilities:['codex_local_sync_v1']}));heartbeat=setInterval(()=>{if(ws.readyState===1)ws.send(JSON.stringify({type:'provider.heartbeat',nodeId:identity.nodeId,inFlight:manager.activeSessionCount(),healthy:true,acceptingSessions:!stopping}));},30000);});
    ws.on('message',async data=>{try{const m=JSON.parse(data);if(m.type==='platform.ready')manager.setNegotiatedDataProtocol('json_base64_v1');else if(m.type==='eonai.codex_sync.request'&&typeof m.requestId==='string'){const result=handleSyncRequest(syncFile,m);if(m.action==='write'&&result.ok)console.log('Codex login file updated after a platform renewal; local Codex keeps working.');ws.send(JSON.stringify({type:'eonai.codex_sync.result',requestId:m.requestId,...result}));}else if(m.type.startsWith('official_exit.')){if(m.type==='official_exit.open'&&(m.targetPort!==443||manager.activeSessionCount()>=2||m.maxBytesIn>8*1024*1024||m.maxBytesOut>8*1024*1024)){ws.send(JSON.stringify({type:'official_exit.open_response',sessionId:m.sessionId,accepted:false,reasonCode:'local_policy'}));return;}await manager.handleMessage(m);}}catch{ws.close(4003,'invalid message');}});
    ws.on('error',()=>console.error('Connection unavailable; retrying.'));
    ws.on('close',code=>{clearInterval(heartbeat);clearTimeout(retry);manager.closeAll('connection_closed');if(!stopping){if(code===4004||code===4401){console.error('Node paused or revoked. Exiting.');process.exitCode=1;}else retry=setTimeout(connect,Math.min(30000,1000*2**Math.min(attempt++,5)));}});
  };connect();
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;clearTimeout(retry);clearInterval(heartbeat);manager?.setAcceptingSessions(false);manager?.closeAll('operator_stopped');ws?.close(1000,'operator stopped');setTimeout(()=>process.exit(0),1000).unref();});
}else if(command==='status'){
  if(!identity)throw new Error('Bind first.');const result=await api('/internal/provider/status');console.log(JSON.stringify(result.data,null,2));
}else console.log('EonAI supplier node '+supplyVersion+'. Commands: bind <code-file>, import-key <vendor> <key-file> [variant], import-codex <auth-json-file> [credential-id] [--no-sync], import-subscription <anthropic|xai|moonshot> <credential-json-file> [credential-id] [region], import-oauth <bundle-file>, run, status. Start the node in one terminal, then authorize in https://eonaibusiness.com/supplier/ or import an explicitly selected file in another terminal. Only explicitly selected files are read. See README.md.');
