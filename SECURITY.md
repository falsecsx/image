# Security Policy

## Supported Versions

当前仓库以 `main` 分支上的最新版本为准。

## Reporting a Vulnerability

如果你发现以下问题，建议不要直接公开提交包含利用细节的 Issue：

- 代理绕过
- SSRF 风险
- API Key 泄露
- 任意文件读取
- XSS / 注入类问题

更稳妥的方式：

1. 先最小化复现问题。
2. 单独整理影响范围、复现步骤、修复建议。
3. 私下联系维护者处理后，再决定是否公开披露。

## Security Notes

- `api-proxy.php` 只允许代理 `https://` 且限制到 `/v1` / `/v1beta` 路径
- 请不要把真实密钥写进前端源码
- 如果你在生产环境启用了代理，建议同时开启 HTTPS
