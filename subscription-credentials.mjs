const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const token=x=>typeof x==='string'&&x.length>=12&&x.length<=24000&&!/[\s\x00-\x1f\x7f]/.test(x);
export function normalizeSubscriptionCredentials(vendor,value){
  if(!object(value))throw new Error('subscription_file_invalid');
  let b=value;
  if(vendor==='anthropic')b=value.claudeAiOauth||value;
  if(vendor==='xai'){
    b=value['https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828']||value;
    if(b.auth_mode&& !['oidc','Oidc'].includes(b.auth_mode)||b.oidc_issuer&&b.oidc_issuer!=='https://auth.x.ai'||b.oidc_client_id&&b.oidc_client_id!=='b1a00492-073a-47ea-816f-4c329264a828')throw new Error('subscription_file_invalid');
  }
  if(!['anthropic','xai','moonshot'].includes(vendor)||!object(b))throw new Error('subscription_vendor_not_supported');
  const accessToken=b.accessToken||b.access_token||(vendor==='xai'?b.key:undefined),refreshToken=b.refreshToken||b.refresh_token;
  if(!token(accessToken)||!token(refreshToken))throw new Error('subscription_file_invalid');
  let expiresAt=b.expiresAt??b.expires_at;
  if(typeof expiresAt==='string'&&!/^\d+(?:\.\d+)?$/.test(expiresAt))expiresAt=Date.parse(expiresAt);else expiresAt=Number(expiresAt);
  if(expiresAt>0&&expiresAt<1e11)expiresAt*=1000;
  if(!Number.isSafeInteger(expiresAt)||expiresAt<=0||expiresAt>Date.now()+370*86400000)throw new Error('subscription_expiry_required');
  const scope=Array.isArray(b.scopes)?b.scopes.join(' '):b.scope||'';
  if(typeof scope!=='string'||scope.length>2000||/[\r\n\x00]/.test(scope))throw new Error('subscription_file_invalid');
  return {accessToken,refreshToken,expiresAt,scope};
}
