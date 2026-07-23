# LLM 信道观测台

一个 Go 单二进制的 OpenAI 兼容协议与 Anthropic Claude 可用性监控控制台。Vue 生产资源内嵌到 Go 可执行文件，探测结果保存在本地 SQLite。

## 能力

- 多信道管理：名称、协议、Base URL、API Key、模型、启停状态
- OpenAI 兼容协议：调用 `/v1/chat/completions`
- Anthropic Claude 协议：调用 `/v1/messages`
- 固定 `max_tokens: 1`，服务启动后立即探测，此后每 60 秒探测一次
- 手动单信道或批量探测
- 24 小时可用率、平均延迟、分钟级趋势聚合和最近探测日志
- 趋势图优先展示，信道状态以响应式卡片网格呈现，支持快速探测、启停、编辑和删除
- SQLite WAL 存储
- API Key 使用本地随机主密钥进行 AES-GCM 加密，前端不回显明文

Base URL 同时支持带或不带 `/v1` 的形式。

## 构建

```powershell
.\build.ps1
```

也可以手动构建：

```powershell
cd web
npm install
npm run typecheck
npm run build
cd ..
go test ./...
go build -o monitor.exe ./cmd/monitor
```

## 运行

```powershell
.\monitor.exe
```

默认监听 `http://127.0.0.1:8080`，数据写入 `data/monitor.db`，加密主密钥写入 `data/master.key`。默认只绑定本机回环地址。

可通过环境变量调整：

```powershell
$env:MONITOR_ADDR = ':18080'
$env:MONITOR_DATA_DIR = 'D:\llm-monitor-data'
.\monitor.exe
```

备份或迁移时需要同时保存数据库和 `master.key`，丢失主密钥后无法解密已有 API Key。

## 安全提示

`data/`、本地数据库、加密主密钥、构建产物和临时工作目录默认不会提交到 Git。公开部署前请使用环境隔离的数据目录，并通过应用界面重新配置 API Key。
