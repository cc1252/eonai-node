# EonAI 供应节点（v0.4.4）

## 已实现的接入方式

在 https://eonaibusiness.com/supplier/ 使用现有 EonAI 账号登记供应商。没有账号时，由站点管理员开通账号。

节点开源：https://github.com/cc1252/eonai-node 。工作台公布当前版本和下载包的 SHA-256，可自行核对。

1. 下载节点包，解压到自己的受控机器；安装 Node.js 24.19 或更新版本。
2. 在工作台创建绑定码，保存为 `binding-code.txt`。有效期 10 分钟，只能使用一次。
3. 在节点目录运行 `npm ci --omit=dev`。
4. 运行 `node node.mjs bind /path/to/binding-code.txt`，随后删除绑定码文件。
5. 运行 `node node.mjs run`。Windows 也可以使用普通本地文件路径。长期运行请交给自己机器的进程管理器。
6. Codex 订阅：在工作台自己在线的节点点击“连接 Codex 订阅”，本人去官方页面输入设备码。也可在工作台主动选择 auth.json，或另一个终端执行 `node node.mjs import-codex /path/to/auth.json [credential-id]`。官方页面显示 Codex 授权，凭据会交给 EonAI 加密托管用于供应。
   - 设备码授权得到的是一个独立的登录会话，与本机 Codex 互不影响。
   - auth.json 与本机 Codex 共用一个会轮换的刷新凭据。用节点命令导入时默认开启同步：平台续期前先让节点重读这个文件，续期后再写回，本机 Codex 继续可用。请保持 `node node.mjs run` 运行。加 `--no-sync` 或在网页上传则不同步，双方各自续期会互相失效。
   - 撤销与本机共用的授权时，平台只清除自己的副本，不在官方处注销，本机登录保持有效。
7. Claude、Grok、Kimi：在在线节点点击对应厂商，Claude 使用官方授权码，Grok/Kimi 使用设备码；也可以主动选择对应登录 JSON，或执行 `node node.mjs import-subscription anthropic /path/to/credentials.json [credential-id]`（Grok 用 `xai`、Kimi 用 `moonshot`）。Kimi 中国与国际账号分开，首次导入国际账号用 `node node.mjs import-subscription moonshot /path/to/auth.json - global`。
8. API Key：工作台主动选择只含 Key 的文本文件，选择厂商与接口类型；也可执行 `node node.mjs import-key openai /path/to/key.txt`。共 13 家固定预设：OpenAI、Anthropic、xAI、Moonshot、Qwen、智谱、MiniMax、MiMo、DeepSeek、Ollama Cloud、Google Gemini、火山方舟、OpenCode Go。Moonshot/智谱 Coding 用 `coding`，MiMo Token Plan 用 `token-cn`、`token-sgp` 或 `token-ams`。成功后可删除原始 Key 文件。
9. 在工作台刷新凭据列表，订阅或 Key 点击“查看可用模型”选择账号实际模型；提交输入/输出供应价（人民币 / 百万 Token）。零售价自动按供应价上浮 50%，管理员确认模型能力后上架。

节点主动连接 `wss://api.eonaibusiness.com/internal/provider/connect`，无需开放入站端口。节点身份默认保存到 `~/.eonai-node/identity.json`；可用 `EONAI_NODE_HOME` 修改存放目录。身份文件相当于节点访问凭证，请勿分享。平台拒绝重复绑定码、无效身份、已暂停或已撤销的节点。

Linux/macOS 上身份文件设为 0600。Windows 的 chmod 无法代替 NTFS ACL，请把该目录和授权文件放在只允许本机运行账号访问的位置。

工作台可暂停/恢复节点、撤销绑定、撤销凭据授权。撤销绑定会清除该节点托管凭据并停用报价，不能直接恢复旧身份；撤销某项凭据只停用对应供给，不会断开其他凭据的整个节点。要彻底废止官方 Key，还应在对应厂商后台撤销原始 Key。

## 凭据和网络边界

平台加密托管供应商主动导入的官方 API Key 和订阅 OAuth 凭据（AES-256-GCM，独立平台密钥）。节点传递官方出口的 TLS 加密字节，TLS 会话在平台终止；因此**平台能够看到请求、响应并使用所授权的密钥**。这不是“密钥永远不离开本机”的模式。工作台和节点状态接口不返回原始 Key。

节点只读取明确指定的文件，不扫描浏览器、Claude Code 或其他本机账号。Codex 文件导入与设备码接入已开放；后台验签，核对账号并读取官方模型目录，必要时先续期。建议给供应使用独立的 Codex 登录会话，避免原 CLI 和平台同时轮换同一份刷新凭据。一个官方账号只允许一个活动供应授权；重新授权需保持同一账号，跨节点迁移应先撤销旧授权。备用的 EonAI 注册应用 OAuth 另行配置，不影响 Codex 入口。Claude、Grok、Kimi 订阅由各自官方 profile 确认不透明 Token 的账号身份，模型目录也须从官方读取，不能采用文件自报账号信息。Claude 接受含刷新凭据的 claudeAiOauth JSON，不接受无法续期的 setup-token。

本版仅允许包内 `providers.mjs` 列出的固定官方主机与 443 端口，覆盖上述厂商及订阅授权地址；平台校验官方证书，不接受客户自定义上游地址、Host、认证头或自签证书。单节点最多 2 个出口会话，平台最多 4 个客户交付并发，请求最多 1 MiB，响应最多 8 MiB。节点主动断线、暂停或撤销后停止派发，不自动切换到另一家供应商。

## 客户如何调用

上架后，工作台会展示独立 `pool-…` 模型名，并提供接入说明文件。客户使用**自己的 EonAI API Key**。

- Base URL：`https://api.eonaibusiness.com/supply/relay`
- OpenAI Responses：`POST /v1/responses`
- OpenAI/xAI Chat Completions：`POST /v1/chat/completions`
- Anthropic Messages：`POST /v1/messages`
- 模型名：使用审核上架后的 `pool-…` 别名。
- 首版只支持非流式文字请求；`stream: true`、图片、视频、文件、工具、后台任务、显式缓存写入均被拒绝。
- Codex 订阅只使用 Responses：当前适配不接收 max_output_tokens/max_tokens、temperature 等额外参数，明确报错，不会悄悄丢弃输出限制。按成功响应的实际用量计费。

供应节点通道由 EonAI 计费网关 执行客户认证、额度扣减与记录。客户直接在普通 `/v1/…` 路径选择供应节点模型会被拒绝，避免绕过独立入口的请求关联检查。

本系统不会主动测试生成视频或其他计费内容。管理员连接检查仅发送无凭据 HEAD 请求。订阅导入、模型查询与上架审核会使用授权凭据读取官方账号资料和模型目录；这些操作不生成内容，也不等同于推理已成功。

## 贡献、收益和结算

平台不保存提示词或回答正文。成功响应会产生交付记录，随后与 EonAI 计费网关 的真实消费日志按请求 ID、通道和模型进行逐项核对。只有唯一、成功且实际计费的日志才可确认收益；失败不计收益，异常保留待复核。输入/输出供应价按核对日志中的对应 Token 数计算，USD 微单位记账，幂等结算。未核对的交付不能提现。

平台用 Ed25519 签名贡献凭据。它是**平台账本记录**，不是 Nitro 硬件证明，不证明模型权重或模型纯度。本站已有的专用文字验证通道保持独立。

最低申请结算金额按当前人民币换算价显示（当前为 ¥6.7094）。申请后冻结金额，管理员完成外部付款后登记真实凭证；驳回会解冻。收益来自已确认的实际调用，付款由管理员人工处理。

## 开源与许可

源码仓库：https://github.com/cc1252/eonai-node 。每个版本打一个 `v版本号` 标签，节点包内的文件与对应标签一致。

- EonAI 编写的节点代码按 Apache-2.0 发布，见 `LICENSE`。包括 `node.mjs`、`codex-auth-json.mjs`、`codex-local-sync.mjs`、`subscription-credentials.mjs`、`providers.mjs`、`build.mjs`。
- 官方出口引擎是第三方 Apache-2.0 组件，源文件原样保存在 `vendor/official-exit/`，编译为 `dist/official-exit.mjs`。版权与来源说明见 `NOTICE`。
- 自行重新编译出口引擎：`npm i --no-save esbuild@0.28.1 && node build.mjs`。
- 运行时依赖 `ws`、`jose` 为 MIT 许可，安装后许可文件位于各自依赖目录。
- 平台后端不在本仓库。节点只连接 EonAI 平台和 `providers.mjs` 列出的固定官方主机。

## Codex 订阅状态

工作台分别展示 Codex 接入与备用注册应用 OAuth 状态。Codex 使用公开 Codex 协议及用户主动授予的账号凭据，其客户端标识不能作为本站独立应用登记或商业许可证明。合成样本测试不代表生产订阅账号已授权；实际使用需供应商完成自己的账号授权，模型、额度与上游准入以官方账号实际结果为准。

Codex 上游使用 `chatgpt.com/backend-api/codex/responses`；备用注册应用授权使用公共 `/v1/responses`。两者均 `store:false`、SSE，完整接收后转为客户非流式 JSON。成功用量与 EonAI 计费网关 日志核对后记收益。续期在调用与读取模型时按需进行；失败不重试生成。撤销先清除本站凭据，再尝试官方撤销，未确认时应在官方设置结束该登录会话。

## 多厂商订阅的实际边界

Claude 官方限制第三方托管 Claude.ai OAuth 凭据和代用户转发订阅请求，详见 https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use 。本页提供独立协议适配和限制提示，不表示官方已允许该用途，不伪装官方 CLI 或绕过拒绝。商用请选允许该用途的 API 或正式合作。其他厂商订阅也须核对套餐允许用途；接入预设不等于转售许可。

所有厂商统一绑定节点、保存加密凭据、读取模型、提交报价、撤销。已有凭据刷新轮换后先加密保存，身份/目录暂不可用时标为“等待校验”，该状态不能接单；稍后查看模型可复核。

导入的登录文件与写出它的本机客户端（Claude Code、Grok CLI、Kimi Code）共用一个会轮换的刷新凭据，标为“与本机共用登录”：

- 文件已过期或两分钟内到期时拒绝导入（`subscription_local_login_expired`），平台不替本机续期，否则本机登录随即失效。先在本机运行一次对应客户端，再导入。
- 导入后平台与本机各自续期会互相失效。这三家目前没有 Codex 那样的本机同步续期；要本机继续正常使用，请在工作台用授权码（Claude）或设备码（Grok、Kimi）登录一个独立会话。
- 撤销导入的授权只清除平台副本，不调用官方撤销，本机登录保持有效。工作台授权的独立会话撤销时，Grok 会尝试官方撤销；Claude、Kimi 没有远程撤销接口，需在官方设置结束会话。生产真实账号调用仍需本人授权后验证；合成测试和 TLS 检查不证明订阅可推理。

Claude/Grok/Kimi 按保存的固定原生路由调用，不自动回退到 API Key、不替换供应商。未确认官方撤销的，请在对应官方设置结束该会话。
