// One version for platform, node and the identity sent upstream; literals drifted apart before.
export const supplyVersion='0.4.4';
// Fixed official destinations; the platform cannot inject an arbitrary URL.
const chat='/v1/chat/completions',messages='/v1/messages',responses='/v1/responses';
export const vendors=Object.assign(Object.create(null),{
  openai:{name:'OpenAI / Codex',host:'api.openai.com',routes:[responses,chat]},
  anthropic:{name:'Anthropic / Claude',host:'api.anthropic.com',routes:[messages]},
  xai:{name:'xAI / Grok',host:'api.x.ai',routes:[responses,chat]},
  moonshot:{name:'Moonshot / Kimi',host:'api.moonshot.cn',routes:[chat],variants:{coding:{host:'api.kimi.com',prefix:'/coding',routes:[chat,messages]}}},
  qwen:{name:'Qwen / 阿里百炼',host:'dashscope.aliyuncs.com',prefix:'/compatible-mode',routes:[chat]},
  zhipu:{name:'智谱 / GLM',host:'open.bigmodel.cn',prefix:'/api/paas/v4',replaceVersion:true,routes:[chat],variants:{coding:{prefix:'/api/coding/paas/v4'}}},
  minimax:{name:'MiniMax',host:'api.minimax.io',routes:[chat,messages],messagePrefix:'/anthropic'},
  xiaomi:{name:'Xiaomi MiMo',host:'api.xiaomimimo.com',routes:[responses,chat],variants:{'token-cn':{host:'token-plan-cn.xiaomimimo.com'},'token-sgp':{host:'token-plan-sgp.xiaomimimo.com'},'token-ams':{host:'token-plan-ams.xiaomimimo.com'}}},
  deepseek:{name:'DeepSeek',host:'api.deepseek.com',routes:[chat]},
  ollama:{name:'Ollama Cloud',host:'ollama.com',routes:[chat]},
  google:{name:'Google Gemini',host:'generativelanguage.googleapis.com',prefix:'/v1beta/openai',replaceVersion:true,routes:[chat]},
  volcengine:{name:'火山方舟',host:'ark.cn-beijing.volces.com',prefix:'/api/v3',replaceVersion:true,routes:[chat],catalog:false},
  opencode:{name:'OpenCode Go',host:'opencode.ai',prefix:'/zen/go',routes:[responses,chat,messages]},
});
export function vendorEndpoint(vendor,variant='default'){
  const base=vendors[vendor];if(!base)return null;
  if(variant!=='default'&&!base.variants?.[variant])return null;
  const value={...base,...base.variants?.[variant]};
  return {...value,path:route=>(route==='/v1/messages'&&value.messagePrefix?value.messagePrefix:value.prefix||'')+(value.replaceVersion?route.replace(/^\/v1/,''):route)};
}
export const officialHosts=Object.freeze([...new Set([
  ...Object.values(vendors).flatMap(v=>[v.host,...Object.values(v.variants||{}).map(x=>x.host).filter(Boolean)]),
  'auth.openai.com','chatgpt.com','platform.claude.com','auth.x.ai','cli-chat-proxy.grok.com','auth.kimi.com','auth.kimi.ai','api.kimi.ai',
])]);
export function providerCapabilities(){return Object.entries(vendors).map(([id,v])=>({id,name:v.name,methods:['api_key'],routes:v.routes,variants:['default',...Object.keys(v.variants||{})],variantRoutes:Object.fromEntries(Object.keys(v.variants||{}).map(k=>[k,vendorEndpoint(id,k).routes]))}));}
