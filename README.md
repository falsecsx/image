# AI 绘图工作台

一个开箱即用的前端绘图工作台，支持：

- 文生图
- 图生图
- OpenAI Images / Chat 兼容接口
- Gemini 原生接口
- 本地历史记录与提示词库
- 可选 PHP 代理模式，用于处理部分跨域场景

项目当前是纯前端页面加一个可选的 `api-proxy.php`，适合直接部署到静态站点或支持 PHP 的轻量服务器。

## 项目特点

- 不内置任何 API Key，密钥由用户在浏览器中自行输入
- 历史记录默认保存在浏览器本地，不依赖数据库
- 支持自定义 `Base URL`，方便接入兼容 OpenAI 协议的第三方服务
- 支持移动端使用

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

## 部署说明

- 静态部署：上传 `index.html`、`assets/`、`data/`
- PHP 代理部署：额外上传 `api-proxy.php`
- 宝塔面板部署说明见 [`BT_DEPLOY.md`](./BT_DEPLOY.md)

## 开源发布前的安全建议

- 不要提交任何真实 API Key
- 不要把私人域名、个人交流群、推广链接硬编码进默认界面
- 如果你后续增加后台接口，优先用 `.env` 或服务器环境变量管理密钥
- 发布前用全文搜索再检查一次 `key`、`token`、`secret`、`password`

## 许可证

本项目当前使用 [MIT License](./LICENSE)。

如果你希望限制商用、二次分发或闭源再发布，可以改成其他许可证。
