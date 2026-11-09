# 皿星 Cloudflare 后端

部署在账号 `44b43c410230bef3aea9e5812e1eff61` 的独立 Worker `minxing-ai`。

GitHub Pages → Cloudflare Worker → 阿里云百炼 Qwen3.7-Plus。密钥在 Worker 的 Secret `MINXING_MODEL_API_KEY` 中，不写入仓库或前端。

D1 仅保存限额计数和按日散列的 IP 标识，不保存对话、原始 IP 或培养存档。全站每日最多 50 次合法请求尝试，北京时间零点换日；每 IP 每分钟 3 次。失败也计数。CORS 限制浏览器来源，并不代替身份认证；非浏览器调用仍受同样总额度约束。

请求最多 20,000 字节、问题 300 字符，最多输出 650 tokens。当前是上下文问答，没有自主工具调用。所有培养数值仍来自教学模型。

`npm test` 验证输入检查、并发额度和失败处理。`npm ci` 安装锁定的 Wrangler 后，登录对应账号即可使用 `npm run deploy`。首次部署前，创建 D1 并将数据库 ID 填入 `wrangler.jsonc`，执行 `drizzle/0000_request_quotas.sql`；通过 Cloudflare 控制台添加密钥 Secret。
