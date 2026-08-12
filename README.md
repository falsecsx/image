# AI 绘图工作台

<p>
  <a href="https://ai.falseai.cn"><img src="https://img.shields.io/badge/在线体验-ai.falseai.cn-2b6de8?style=flat-square" alt="在线体验"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Source--Available-f97316?style=flat-square" alt="License"></a>
  <a href="https://github.com/falsecsx/image"><img src="https://img.shields.io/github/stars/falsecsx/image?style=flat-square&logo=github" alt="GitHub stars"></a>
  <a href="#"><img src="https://img.shields.io/badge/前端-原生_JS_+_ES_Module-646cff?style=flat-square" alt="Tech"></a>
  <a href="#"><img src="https://img.shields.io/badge/后端-PHP_可选-777bb4?style=flat-square&logo=php&logoColor=white" alt="PHP"></a>
  <a href="#"><img src="https://img.shields.io/badge/Docker-就绪-2496ed?style=flat-square&logo=docker&logoColor=white" alt="Docker"></a>
</p>

[功能](#核心功能) · [快速开始](#快速开始) · [部署](#部署) · [项目结构](#项目结构) · [安全说明](#安全说明) · [许可证](#许可证)

一个开箱即用的 AI 图片与视频创作工作台。在浏览器中直连 OpenAI 兼容接口，把 AI 生图、Agent 多轮创作、提示词库和无限画布放在同一个界面里，适合用来探索视觉方案并连续迭代结果。

> [!NOTE]
> 项目持续更新中，不保证历史数据兼容。认证与会员模块仍在开发中，尚未包含在当前公开版本。

## 核心功能

### AI 创作

- 支持文生图、图生图、文生视频、图生视频、多参考图、批量生成和结果续作
- 支持 OpenAI、Gemini、Grok、阿里云百炼、豆包/火山方舟、Replicate Flux、Google Veo 等接口形态
- 支持图片裁剪、局部编辑、产品角度、GIF 和 AI 超分（2x/4x 模型；模型不可用时回退到 Canvas 高质量放大）
- 不内置 API Key，密钥由用户在浏览器中自行输入
- 支持自定义 `Base URL` 和可选 PHP 代理模式

### 无限画布

- 多画布项目管理、节点拖拽缩放、贝塞尔连线、小地图、撤销重做
- Agent 多轮创作：围绕选中节点对话、生图，结果插回画布
- 资源缓存（IndexedDB）与项目导入导出
- 支持从生成结果、历史记录和提示词库把素材加入画布
- 节点工作流：参考图 → 编排节点 → 结果图，支持循环节点批量生成

### 提示词库

- 社区与个人提示词库，支持搜索、分类、封面展示
- 支持提示词导入导出和画布分支创建
- 社区提示词数据保留多个来源链接，外部图片按白名单代理加载

## 快速开始

API Key、Base URL、画布、素材和生成记录默认保存在浏览器本地。

### Docker 运行（推荐）

```bash
git clone https://github.com/falsecsx/image.git
cd image
docker compose up -d
```

运行后访问 `http://localhost:8080`。容器内置 nginx + PHP-FPM，同时支持静态页面和 PHP 代理，无需额外配置。

### 本地开发

```bash
git clone https://github.com/falsecsx/image.git
cd image
npx serve .
```

也可以使用任意静态服务器，将站点根目录指向当前项目目录。直接打开 `index.html` 时，部分浏览器会限制本地 JSON 和模块加载。如果需要 PHP 代理，推荐使用上面的 Docker 方式。

### 首次配置

打开页面后进入右上角设置，填入自己的 OpenAI 兼容 `Base URL` 和 `API Key`。如果默认接口调用方式与你的 API 不同，可自定义生图/视频脚本调用。

## 部署

| 方式 | 说明 |
|------|------|
| Docker | `docker compose up -d`，访问 `http://localhost:8080`，内置 nginx + PHP-FPM |
| 静态部署 | 上传 `index.html`、`assets/`、`data/` 和站点图标到任意静态服务器 |
| PHP 代理部署 | 额外上传 `api-proxy.php`，公开部署前请阅读 [`SECURITY.md`](./SECURITY.md) |
| 宝塔面板 | 部署说明见 [`BT_DEPLOY.md`](./BT_DEPLOY.md) |

社区图片代理会使用白名单、公开地址校验、重定向限制、GitHub 镜像/中继和服务器缓存。缓存、同步脚本、认证数据库和开发测试文件不会进入公开仓库。

## 项目结构

```text
.
├─ index.html              # 入口页面
├─ api-proxy.php           # 可选 PHP 图片代理
├─ assets/
│  ├─ css/                 # 样式
│  ├─ icons/               # 站点图标
│  ├─ js/
│  │  ├─ agent/            # Agent 多轮创作
│  │  ├─ canvas/           # 无限画布（14 个模块）
│  │  └─ core/             # 核心生成逻辑
│  └─ vendor/              # 第三方运行时依赖
├─ data/
│  ├─ community-prompts.json
│  └─ community-image-hosts.json
├─ docker/
│  ├─ nginx.conf           # Docker nginx 站点配置
│  └─ entrypoint.sh        # 容器启动脚本
├─ Dockerfile              # Docker 构建文件
├─ docker-compose.yml      # Docker Compose 编排
├─ .dockerignore           # Docker 构建排除
├─ LICENSE                 # 项目主许可证（非商业源码可见）
├─ LICENSE-MIT-INFINITE-CANVAS  # 上游 MIT 许可证全文
├─ NOTICE                  # 上游来源与分层许可说明
├─ DATA_NOTICE.md          # 社区数据声明
└─ THIRD_PARTY_NOTICES.md  # 第三方依赖许可证
```

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

## 致谢

- [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) — 无限画布的交互设计与数据模型参考来源（MIT License）
- [Marked](https://github.com/markedjs/marked) — Markdown 解析（MIT）
- [DOMPurify](https://github.com/cure53/DOMPurify) — HTML 净化（Apache 2.0 / MPL 2.0）
- [Lucide](https://github.com/lucide-icons/lucide) — 图标库（ISC）
