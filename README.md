# Ai 绘图助手

一个开箱即用的前端 AI 绘图工具，支持：

- 文生图
- 图生图
- OpenAI Images / Chat 兼容接口
- Gemini 原生接口
- 本地历史记录与提示词库
- 提示词优化、翻译、分镜分析等文本能力
- 可选 PHP 代理模式，用于处理部分跨域场景

项目当前是纯前端页面加一个可选的 `api-proxy.php`，适合直接部署到静态站点或支持 PHP 的轻量服务器。

在线体验：[https://ai.falseai.cn](https://ai.falseai.cn)

## 项目特点

- 不内置任何 API Key，密钥由用户在浏览器中自行输入
- 支持为文本模型单独设置专用 Key；留空时默认复用主 API Key
- 支持自定义 `Base URL`，方便接入兼容 OpenAI 协议的第三方服务
- 支持 `OpenAI Images`、`OpenAI Chat`、`Gemini` 三种协议模式切换
- 历史记录默认保存在浏览器本地，不依赖数据库
- 支持提示词库、本地保存路径、移动端使用

## 项目结构

```text
.
├─ index.html
├─ api-proxy.php
├─ assets/
│  ├─ css/main.css
│  └─ js/app.js
└─ data/prompts.json
```

## 本地使用

### 方式 1：只使用前端直连

直接打开 `index.html` 即可使用，但前提是你的 API 服务允许浏览器跨域访问。

### 方式 2：使用 PHP 代理

如果接口存在 CORS 限制，建议在本地或服务器启用 PHP，然后通过 `api-proxy.php` 转发请求。

示例：

```bash
php -S 127.0.0.1:8080
```

然后访问：

```text
http://127.0.0.1:8080/
```

## 使用说明

- 主 API Key 用于图片生成请求，也可作为默认文本请求 Key
- “文本优化模型”旁边的“设置key”可单独指定文本请求使用的 Key
- 若未设置文本专用 Key，优化提示词、翻译、分镜分析等文本请求会默认使用主 API Key
- 需要排查问题时，可在 URL 后追加 `?debug=1` 打开调试日志

## 部署说明

- 静态部署：上传 `index.html`、`assets/`、`data/`
- PHP 代理部署：额外上传 `api-proxy.php`
- 宝塔面板部署说明见 [`BT_DEPLOY.md`](./BT_DEPLOY.md)

## 许可证

本项目当前使用 [Apache License 2.0](./LICENSE)。
