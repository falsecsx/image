# AI 绘图工作台

一个开箱即用的 AI 图片与视频创作工作台，支持多平台接入、提示词库、Agent 和无限画布。

在线体验：[https://ai.falseai.cn](https://ai.falseai.cn)

## 功能

- 支持 OpenAI、Gemini、Grok、阿里云百炼、豆包/火山方舟、Replicate Flux、Google Veo 等接口形态
- 支持文生图、图生图、文生视频、图生视频、多参考图、批量生成和结果续作
- 支持社区与个人提示词库、搜索、分类、封面、导入导出和画布分支
- 支持 Agent 多轮创作、无限画布、节点连接、资源缓存和项目导入导出
- 支持图片裁剪、局部编辑、产品角度、GIF 和 AI 超分
- AI 超分支持 2x/4x 模型；模型不可用时自动回退到 Canvas 高质量放大
- 支持从生成结果、历史记录和提示词库把素材加入画布
- 不内置 API Key，密钥由用户在浏览器中自行输入
- 支持自定义 `Base URL` 和可选 PHP 代理模式

> 认证与会员模块仍在开发中，尚未包含在当前公开版本。

## 项目结构

```text
.
├─ index.html
├─ api-proxy.php
├─ assets/
│  ├─ css/
│  ├─ icons/
│  ├─ js/
│  │  ├─ agent/
│  │  ├─ canvas/
│  │  └─ core/
│  └─ vendor/
├─ data/
│  ├─ community-prompts.json
│  └─ community-image-hosts.json
├─ LICENSE
├─ LICENSE-MIT-INFINITE-CANVAS
├─ NOTICE
├─ DATA_NOTICE.md
└─ THIRD_PARTY_NOTICES.md
```

## 本地使用

推荐通过本地静态服务器访问，以便浏览器正常加载社区提示词 JSON 和 ES 模块：

```bash
npx serve .
```

也可以使用任意静态服务器，将站点根目录指向当前项目目录。直接打开 `index.html` 时，部分浏览器会限制本地 JSON 和模块加载。

## 部署

- 静态部署：上传 `index.html`、`assets/`、`data/` 和站点图标
- PHP 代理部署：额外上传 `api-proxy.php`
- 宝塔面板部署说明见 [`BT_DEPLOY.md`](./BT_DEPLOY.md)
- 公开部署 PHP 代理前，请阅读 [`SECURITY.md`](./SECURITY.md)

社区图片代理会使用白名单、公开地址校验、重定向限制、GitHub 镜像/中继和服务器缓存。缓存、同步脚本、认证数据库和开发测试文件不会进入公开仓库。

## 安全说明

- 仓库不包含 API Key、管理员密钥或浏览器私有数据
- 社区图片代理只允许 HTTPS、白名单域名、公开地址和不超过 15 MB 的图片响应
- 请勿把 `.env`、服务端密钥、本地日志、同步黑名单、同步报告或 `data/auth.db` 提交到仓库

## 许可证

本项目采用分层许可：

- **项目原始代码**：按 [PolyForm Noncommercial License 1.0.0](./LICENSE) 发布。该许可证允许非商业目的的使用、复制、修改和分发，但不授予商业使用权；它是源码可见（source-available）许可证，不是 OSI 批准的开源许可证。
- **改编自上游的代码**：基于 [`basketikun/infinite-canvas`](https://github.com/basketikun/infinite-canvas) 的上游改编部分继续适用 MIT 许可证，来源、历史许可证和范围见 [NOTICE](./NOTICE)，完整文本见 [LICENSE-MIT-INFINITE-CANVAS](./LICENSE-MIT-INFINITE-CANVAS)。
- **第三方依赖**：`assets/vendor/` 下的运行时依赖保留各自原始许可证，详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
- **社区数据**：`data/` 下的提示词、作者信息和外部图片 URL 不自动适用项目许可证，来源、归属和下架方式见 [DATA_NOTICE.md](./DATA_NOTICE.md)。

本许可证生效前的历史发布版本依据 AGPL-3.0 授权，继续有效。本项目没有向原创代码授予商业使用权；如需商业授权，请通过项目仓库联系作者。
