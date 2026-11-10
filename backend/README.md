# 皿星 Cloudflare 后端

部署在账号 `44b43c410230bef3aea9e5812e1eff61` 的独立 Worker `minxing-ai`。

GitHub Pages → Cloudflare Worker → 阿里云百炼 Qwen3.7-Plus。密钥在 Worker 的 Secret `MINXING_MODEL_API_KEY` 中，不写入仓库或前端。

D1 保存限额计数、按日散列的限流标识，以及保留 30 天的使用统计事件；不保存对话、原始 IP 或培养存档。全站每日最多 50 次合法请求尝试，北京时间零点换日；每 IP 每分钟 3 次。失败也计数。CORS 限制浏览器来源，并不代替身份认证；非浏览器调用仍受同样总额度约束。

请求最多 20,000 字节、问题 300 字符，最多输出 650 tokens。当前是上下文问答，没有自主工具调用。所有培养数值仍来自教学模型。

`npm test` 验证输入检查、并发额度和失败处理。`npm ci` 安装锁定的 Wrangler 后，登录对应账号即可使用 `npm run deploy`。首次部署前，创建 D1 并将数据库 ID 填入 `wrangler.jsonc`，执行 `drizzle/0000_request_quotas.sql`；通过 Cloudflare 控制台添加密钥 Secret。

## 近 7 日统计

管理页为 Worker 同源 `/admin`，使用独立的 `MINXING_ADMIN_PASSWORD` Secret 登录（至少 24 字符随机密码），与模型密钥无关。登录产生 8 小时 HttpOnly、Secure、SameSite=Strict 签名 Cookie。管理接口不开放 CORS；密码和统计数据不写入 GitHub。维护页面源码为 `worker/admin.html`，`npm run build:admin` 生成 `worker/admin-page.js` 及 CSP 脚本哈希；测试、部署前会自动更新。

已有部署仅需执行 `drizzle/0001_analytics.sql` 新增统计表，再配置独立管理密码、部署 Worker。不要重新创建配额库。前端执行 `npm run build` 后发布。

- 统计窗口为北京时间近 7 个自然日（含今天），7 日总访客跨天去重，不能相加每日访客得到总访客。
- 打开次数为页面加载；访客按随机浏览器编号去重；实际使用为用户培养皿接种成功或 AI 成功返回；AI 成功/失败由服务端记录。失败包含限流，不等于模型供应商计费次数。
- 回访依据保留的 30 日记录，指另一天再次打开的浏览器。设备切换、清缓存、隐私模式会影响去重；拦截统计可能少计，不等于准确自然人数。
- 前端只发送事件类型、随机编号和时间由服务端记录；旧访问不能补记。公开上报可能被伪造，统计只用于试用趋势判断，不用于计费或身份确认。
- 首页底部提供说明与关闭开关。`https://buu206.github.io/minxing/?analytics=off#home` 排除此浏览器后续访问，`analytics=on` 恢复；本地预览默认不统计。开发测试优先使用本地数据库，线上验证用独立测试编号并清理这些测试行。

验证：后端 `npm test`；仓库根目录 `node --test src/test/analytics.test.cjs`。
