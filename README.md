# LLM 信道观测台

LLM 信道观测台是一个完全运行在浏览器中的模型接口可用性工具，支持 OpenAI 兼容协议、Anthropic、自定义请求模板、批量巡检、趋势统计，以及包含信道和探测记录的本地导入导出。配置与 API Key 保存在当前浏览器的 IndexedDB，不依赖应用后端或远程数据库。

项目默认使用仓库内的 Chrome/Edge 请求桥扩展执行跨域请求；扩展未连接时，依次使用信道代理、统一代理或浏览器直连。网页由 GitHub Pages 自动发布至 <https://xiaojiecode.github.io/llm-availability-console/>。
