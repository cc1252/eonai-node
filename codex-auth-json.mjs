// Codex auth.json importer for ChatGPT-mode logins (access, refresh and ID tokens).
// Only the explicitly selected file is read.
export function normalizeCodexAuthJson(value){
  const bad=()=>{throw Object.assign(new Error('codex_auth_json_invalid'),{status:400});};
  if(!value||typeof value!=='object'||Array.isArray(value)||value.OPENAI_API_KEY||value.auth_mode&&value.auth_mode!=='chatgpt')bad();
  const t=value.tokens;if(!t||typeof t!=='object')bad();
  for(const name of ['access_token','refresh_token','id_token'])if(typeof t[name]!=='string'||t[name].length<12||t[name].length>24000||/[\s\x00-\x1f\x7f]/.test(t[name]))bad();
  if(t.account_id!==undefined&&(typeof t.account_id!=='string'||! /^[a-zA-Z0-9:_-]{1,180}$/.test(t.account_id)))bad();
  return {accessToken:t.access_token,refreshToken:t.refresh_token,idToken:t.id_token,accountId:t.account_id};
}
