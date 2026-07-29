# AI 绘图工作台

一个开箱即用的 AI 图片与视频创作工作台。项目采用纯前端实现，并提供可选的 PHP 同源代理。

在线体验：[https://ai.falseai.cn](https://ai.falseai.cn)

## 功能

- 支持 OpenAI、Gemini、Grok、阿里云百炼、豆包/火山方舟、Replicate Flux、Google Veo 等接口形态
- 支持文生图、图生图、文生视频、图生视频、多参考图、批量生成和结果续作
- 支持提示词优化、翻译、反推、分镜分析和产品角度等辅助能力
- 支持 Agent 对话式创作与本地会话记录
- 支持无限画布、节点连接、局部编辑、项目导入导出和素材复用
- 支持公共提示词库、本地提示词管理和本地历史记录
- 不内置 API Key，密钥由用户在浏览器中自行输入
- 支持自定义 `Base URL` 和可选 PHP 代理模式

## 项目结构

```text
.
├─ index.html
├─ api-proxy.php
├─ assets/
│  ├─ css/
│  ├─ icons/
│  └─ js/
│     ├─ agent/
│     ├─ canvas/
│     └─ core/
├─ data/
│  └─ prompts.json
├─ LICENSE
└─ NOTICE
```

## 本地使用

推荐通过本地静态服务器访问，以便浏览器正常加载 `data/prompts.json` 和 ES 模块。

```bash
npx serve .
```

也可以使用任意静态服务器，将站点根目录指向当前项目目录。直接打开 `index.html` 时，部分浏览器会限制本地 JSON 和模块加载。

## 部署

- 静态部署：上传 `index.html`、`assets/`、`data/` 和站点图标
- PHP 代理部署：额外上传 `api-proxy.php`
- 宝塔面板部署说明见 [`BT_DEPLOY.md`](./BT_DEPLOY.md)

## 安全说明

- 仓库不包含 API Key 或管理员密钥
- 请勿把 `.env`、服务端密钥、浏览器导出的私有数据或本地日志提交到仓库
- 公开部署 PHP 代理前，请阅读 [`SECURITY.md`](./SECURITY.md) 并配置访问限制

## 许可证

本项目按 [GNU Affero General Public License v3.0](./LICENSE) 发布。
无限画布包含基于 [`basketikun/infinite-canvas`](https://github.com/basketikun/infinite-canvas) 二次开发 改写的原生 JavaScript 实现，来源和修改范围见 [NOTICE](./NOTICE)。
