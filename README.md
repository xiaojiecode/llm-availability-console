# LLM 信道观测台

LLM 信道观测台是一个完全运行在浏览器中的模型接口可用性工具，支持 OpenAI 兼容协议、Anthropic、自定义请求模板、批量巡检、趋势统计，以及包含信道和探测记录的本地导入导出。配置与 API Key 保存在当前浏览器的 IndexedDB，不依赖应用后端或远程数据库。

项目默认使用[油猴跨域请求桥](https://xiaojiecode.github.io/llm-availability-console/llmping.user.js)执行 HTTP/HTTPS 跨域请求；油猴脚本未连接时，依次使用信道代理、统一代理或浏览器直连。网页由 GitHub Pages 自动发布至 <https://xiaojiecode.github.io/llm-availability-console/>。

安装 Tampermonkey 后打开上面的油猴脚本链接并确认安装。脚本只在观测台线上地址、`localhost` 和 `127.0.0.1` 页面运行，目标请求通过 `GM_xmlhttpRequest` 发送，不受页面 CORS 限制。

## 同步 sub2api 中转站

点击顶部的“同步中转站”，输入 sub2api 站点地址后可以使用 refresh token 或账号密码登录。同步流程会读取当前账号可用分组，删除账号内的全部已有密钥，再为每个可用分组创建新密钥和 `/v1/models` 零消耗状态探测信道。被删除的旧密钥会立即失效。

refresh token 在调用 `/api/v1/auth/refresh` 后会轮换，旧 token 随即失效；观测台只在结果页显示新的 token，不会把 refresh token、邮箱或密码保存到 IndexedDB。启用 CAPTCHA 的站点需要油猴跨域请求桥才能在观测台内完成验证。
