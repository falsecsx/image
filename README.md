# Ai 创作平台

一个开箱即用的前端 AI 创作工作台，面向图片与视频生成场景，支持多平台接入、提示词反推、提示词管理和本地历史记录。

在线体验：[https://ai.falseai.cn](https://ai.falseai.cn)

## 功能特点

- 支持大部分主流图片与视频生成平台，覆盖 OpenAI、Gemini、Grok、阿里云百炼、豆包/火山方舟、Replicate Flux、Google Veo 等接入形态
- 支持文生图、图生图、文生视频、图生视频、多参考图、批量生成和结果继续生成
- 支持 OpenAI Images、OpenAI Chat、Open Images、Gemini 原生、阿里云百炼、豆包官方、Veo、Seedance、HappyHorse、Grok Video 等协议模式
- 支持提示词反推，可根据参考图生成适合图片或视频复用的中文提示词
- 支持提示词优化、翻译、分镜分析、产品角度等高级能力
- 支持静态公共提示词库、本地提示词库导入导出、本地历史记录
- 不内置任何 API Key，密钥由用户在浏览器中自行输入
- 支持为文本模型单独设置专用 Key；留空时默认复用主 API Key
- 支持自定义 `Base URL` 和可选 PHP 代理模式，用于处理部分跨域场景
- 支持选择本地保存位置，并可配置历史图片保留原图或缩略图

## 项目结构

```text
.
├─ index.html
├─ api-proxy.php
├─ assets/
│  ├─ css/main.css
│  └─ js/app.js
├─ data/
│  └─ prompts.json
├─ LICENSE
└─ NOTICE
```

## 本地使用

推荐通过本地静态服务访问，这样 `data/prompts.json` 等静态资源可以正常加载。

如果你已经安装 Node.js，可以在项目目录运行：

```bash
npx serve .
```

也可以使用任意静态服务器，把站点根目录指向当前项目目录。

直接打开 `index.html` 也可以进入页面，但部分浏览器会在 `file://` 协议下拦截本地 JSON 资源，导致静态公共提示词库无法加载。

## 使用说明

- 点击“设置”打开工作台设置，选择图片或视频平台、协议、模型、Base URL 和 API Key
- 主 API Key 用于图片/视频生成请求，也可作为默认文本请求 Key
- “文本优化模型”旁边的“设置key”可单独指定文本请求使用的 Key
- 若未设置文本专用 Key，优化提示词、翻译、分镜分析和提示词反推会默认使用主 API Key
- 上传参考图后，可在高级能力中使用“反推提示词”，将图片内容转成可复用提示词
- 提示词库支持静态公共提示词、本地保存、导入和导出
- 高级能力中包含反推提示词、分镜生成和产品角度工具
- 需要排查问题时，可在 URL 后追加 `?debug=1` 打开调试日志

## PHP 代理模式

如果接口存在 CORS 限制，建议部署 `api-proxy.php`，然后在页面中开启“兼容代理模式”。

PHP 本地示例：

```bash
php -S 127.0.0.1:8080
```

然后访问：

```text
http://127.0.0.1:8080/
```

## 部署说明

- 静态部署：上传 `index.html`、`assets/`、`data/`
- PHP 代理部署：额外上传 `api-proxy.php`
- 宝塔面板部署说明见 [`BT_DEPLOY.md`](./BT_DEPLOY.md)

## 许可证

本项目当前使用 [Apache License 2.0](./LICENSE)，署名信息见 [NOTICE](./NOTICE)。
