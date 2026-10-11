// Keeps a Codex auth.json that the supplier imported from this machine in step with the platform.
// Codex CLI processes already share auth.json this way: reload the file before refreshing, refresh
// only when it is unchanged, then write the rotated tokens back. The node applies the same rule for
// the platform, so supply and local Codex never spend each other's single-use refresh token.
import {readFileSync,writeFileSync,renameSync,rmSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizeCodexAuthJson} from './codex-auth-json.mjs';

export const tokenHash=value=>createHash('sha256').update(String(value)).digest('base64url');
const token=x=>typeof x==='string'&&x.length>=12&&x.length<=24000&&!/[\s\x00-\x1f\x7f]/.test(x);
const accountOf=jwt=>{try{return JSON.parse(Buffer.from(jwt.split('.')[1],'base64url'))['https://api.openai.com/auth']?.chatgpt_account_id;}catch{return undefined;}};

export function readBindings(file){try{const value=JSON.parse(readFileSync(file,'utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}}
export function saveBinding(file,credentialId,path){const all=readBindings(file);if(path)all[credentialId]={path};else delete all[credentialId];writeFileSync(file,JSON.stringify(all),{mode:0o600});}

// known: hashes of refresh tokens the platform already holds or expects the file to still hold.
export function readLocal(path,known){
  const t=normalizeCodexAuthJson(JSON.parse(readFileSync(path,'utf8')));
  if(known.includes(tokenHash(t.refreshToken)))return {ok:true,changed:false};
  return {ok:true,changed:true,tokens:{accessToken:t.accessToken,refreshToken:t.refreshToken,idToken:t.idToken}};
}

export function writeLocal(path,expected,tokens){
  if(!tokens||![tokens.accessToken,tokens.refreshToken,tokens.idToken].every(token))return {ok:false,error:'invalid_tokens'};
  const raw=JSON.parse(readFileSync(path,'utf8')),current=normalizeCodexAuthJson(raw);
  // Local Codex renewed or signed in again since the platform read the file: its newer login wins.
  if(tokenHash(current.refreshToken)!==expected)return {ok:false,error:'changed'};
  const account=current.accountId||accountOf(current.accessToken);
  if(!account||accountOf(tokens.accessToken)!==account)return {ok:false,error:'account_mismatch'};
  raw.tokens={...raw.tokens,access_token:tokens.accessToken,refresh_token:tokens.refreshToken,id_token:tokens.idToken};
  raw.last_refresh=new Date().toISOString();
  const temp=path+'.eonai-'+process.pid+'.tmp';writeFileSync(temp,JSON.stringify(raw,null,2),{mode:0o600});
  // Windows refuses the rename while another process briefly holds auth.json open.
  for(let attempt=0;;attempt++){try{renameSync(temp,path);return {ok:true};}catch(e){if(attempt>=4||!['EPERM','EBUSY','EACCES'].includes(e.code)){if(existsSync(temp))rmSync(temp,{force:true});throw e;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100*(attempt+1));}}
}

export function handleSyncRequest(bindingsFile,m){
  try{
    const binding=readBindings(bindingsFile)[m.credentialBindingId];
    if(m.action==='forget'){if(binding)saveBinding(bindingsFile,m.credentialBindingId,null);return {ok:true};}
    if(!binding?.path)return {ok:false,error:'not_bound'};
    if(m.action==='read')return readLocal(binding.path,Array.isArray(m.knownRefreshSha256)?m.knownRefreshSha256:[]);
    if(m.action==='write')return writeLocal(binding.path,m.expectedRefreshSha256,m.tokens);
    return {ok:false,error:'invalid_action'};
  }catch{return {ok:false,error:'local_file_unavailable'};}
}
