# LLM 信道观测台

一个完全运行在浏览器中的 OpenAI 兼容协议与 Anthropic Claude 信道观测台。项目只有 Vue 静态资源，可由 GitHub Pages 直接托管，不需要 Go 服务、SQLite 或其他应用服务器。

## 能力

- 信道配置、API Key 和探测记录保存在浏览器 IndexedDB
- OpenAI 兼容协议、Anthropic Claude 和完全自定义请求模板
- 请求方法、路径、Headers JSON、Body JSON 与模板变量可编辑
- 支持 `{{apiKey}}`、`{{model}}`、`{{baseUrl}}`、`{{timestamp}}` 变量
- 支持直接请求，以及 `https://proxy.example.com/?url={{url}}` 形式的可选 CORS 代理
- 支持统一代理 URL；信道未单独配置代理时自动使用全局代理
- 手动单信道、批量探测，以及页面打开期间每 60 秒自动探测
- 24 小时可用率、平均延迟、分钟趋势和最近探测日志
- 完整 JSON 备份导入与导出，包含明文 API Key、信道配置、设置和探测记录
- 可通过“导入”功能将本地备份合并到当前浏览器

## CORS

2026-07-24 使用 `https://xiaojiecode.github.io` 作为 Origin 进行了预检：

- `https://api.openai.com/v1/chat/completions`：允许浏览器跨域请求。
- `https://api.anthropic.com/v1/messages`：加入 `anthropic-dangerous-direct-browser-access: true` 后允许跨域请求；内置模板已包含该 Header。
- `https://lucen.cc`：返回 403 且没有 CORS 响应头，无法从 GitHub Pages 直接访问。

其他 OpenAI 兼容服务是否允许跨域取决于服务端配置。无法直连时，在信道设置中填写带 `{{url}}` 的代理 URL。代理应接收编码后的目标 URL，转发请求方法、Headers 和 Body，并返回允许 GitHub Pages Origin 的 CORS 响应头。

仓库内置 `worker/` Cloudflare Worker，默认仅允许 `https://xiaojiecode.github.io` 与本地开发 Origin，仅转发到 `lucen.cc`，并要求 `PROXY_TOKEN`。在仓库 Actions Secrets 配置 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`PROXY_TOKEN` 后，手动运行 `Deploy CORS Proxy`。将生成的地址按 `https://<worker>.workers.dev/?token=<PROXY_TOKEN>&url={{url}}` 填入页面“跨域代理”。

## 本地开发

```powershell
cd web
npm ci
npm run dev
```

打开 `http://localhost:5173`。

## 验证与构建

```powershell
cd web
npm run typecheck
npm test
npm run test:worker
npm run build
```

构建结果位于 `web/dist`。

生产构建通过固定版本的 jsDelivr ESM CDN 加载 Vue、Element Plus、Three.js、GSAP 和 Dexie，并从 CDN 加载 Element Plus 样式；ECharts 与 Lucide 保留本地按需打包。首次打开需要能访问 `cdn.jsdelivr.net`，后续可使用浏览器和 CDN 的长期缓存。开发、类型检查和测试仍使用本地安装的依赖。

## GitHub Pages

`.github/workflows/deploy-pages.yml` 会在 `main` 分支推送后执行类型检查、测试和构建，然后发布到 GitHub Pages。首次使用时，在仓库 `Settings -> Pages -> Build and deployment` 中将 Source 设为 `GitHub Actions`。

当前仓库的预期地址：

`https://xiaojiecode.github.io/llm-availability-console/`

## 数据边界

所有数据按站点 Origin 保存在当前浏览器中，不会在不同设备、浏览器或用户之间同步。浏览器关闭后自动探测停止；重新打开页面后会恢复已保存的自动探测设置。

导出的备份包含明文 API Key，请按敏感文件保管。

原 SQLite 中的 15 个渠道已转换到本地忽略文件 `data/initial-data.json`，不会进入 Git 提交或 GitHub Pages 产物。需要时在页面中点击“导入”，选择该文件并使用合并模式；导入后数据仅保存在当前浏览器 IndexedDB。
