# 宝塔部署教程

这个项目现在是前端多文件结构，不再是单个 `index` 文件。

当前部署需要关注的文件是：

- `index.html`
- `assets/css/main.css`
- `assets/js/app.js`
- `data/prompts.json`
- `api-proxy.php`（可选，但推荐一起上传）

## 1. 先判断你要用哪种部署方式

### 方式 A：纯静态部署

适合：

- 你填的第三方 `Base URL` 本身已经允许浏览器跨域访问
- 页面里不需要开启“兼容代理模式”

特点：

- 最简单
- 不依赖数据库
- 不依赖 Node.js
- 只需要网站能正常提供静态文件

### 方式 B：静态页面 + PHP 代理

适合：

- 某些中转站没有配 CORS
- 页面里直接请求接口时报 `Failed to fetch`
- 页面里直接请求接口时报 `No 'Access-Control-Allow-Origin'`

特点：

- 页面仍然是静态页面
- 但需要宝塔站点启用 PHP
- 通过 `api-proxy.php` 转发请求

如果你不确定，直接按“方式 B”部署最稳，因为这样后面要开代理模式时不用再补环境。

## 2. 宝塔里需要安装什么

推荐最小环境：

- `Nginx`
- `PHP 8.0` 或 `PHP 8.1`

不需要：

- MySQL
- Redis
- PM2
- Node 项目管理器

PHP 里至少确认这些可用：

- `curl`
- `openssl`
- `json`

## 3. 在宝塔中新建站点

在宝塔面板中：

1. 进入“网站”
2. 新建站点
3. 域名填你的正式域名
4. PHP 版本选择 `8.0` 或 `8.1`
5. 数据库选择“不创建”

说明：

- 就算你暂时只想纯静态部署，也建议把站点建成 PHP 站点，这样以后可以直接启用 `api-proxy.php`
- 网站根目录下面直接放本项目文件，不要再套一层 `public`

## 4. 上传哪些文件

把下面这些文件和目录上传到网站根目录：

```text
index.html
api-proxy.php
assets/
data/
```

上传后目录结构应类似：

```text
/www/wwwroot/你的域名/
├─ index.html
├─ api-proxy.php
├─ assets/
│  ├─ css/
│  │  └─ main.css
│  └─ js/
│     └─ app.js
└─ data/
   └─ prompts.json
```

## 5. 宝塔站点的关键设置

### 默认首页

在站点配置里确认默认首页包含：

```text
index.html index.php
```

并且 `index.html` 放前面。

### 运行目录

运行目录就是网站根目录，不要改成别的子目录。

### 伪静态

这个项目不需要伪静态规则，保持“关闭”或空白即可。

## 6. HTTPS

建议直接开启 HTTPS。

原因：

- 页面里默认接口地址是 `https://...`
- `api-proxy.php` 只允许代理 `https://` 的目标地址
- 手机端和桌面浏览器对 HTTPS 环境兼容更稳定

宝塔里做法：

1. 打开站点
2. 进入“SSL”
3. 申请 Let's Encrypt 证书
4. 开启“强制 HTTPS”

## 7. 部署完成后先检查这 4 个地址

部署完先手动访问：

- `https://你的域名/`
- `https://你的域名/assets/css/main.css`
- `https://你的域名/assets/js/app.js`
- `https://你的域名/data/prompts.json`

如果这几个地址里有任何一个是 `404`，页面就会异常。

## 8. 如果你要启用兼容代理模式

页面里已经支持相对路径代理：

- `apiProxyEndpoint: 'api-proxy.php'`

也就是说，只要 `api-proxy.php` 和 `index.html` 在同一个站点根目录即可。

### 需要确认的 PHP 条件

在宝塔里确认：

- 当前站点已绑定 PHP
- `curl` 扩展已启用
- 没有把 `api-proxy.php` 拦截掉

### 页面里的使用方式

打开网站后：

1. 填你的 `Base URL`
2. 填 `API Key`
3. 如果直连报跨域错，再打开“兼容代理模式”

说明：

- 代理模式只是在你的服务器中转请求
- API Key 仍然是用户在浏览器里输入
- 服务端不会把 Key 写入项目文件

### 长时间生图的超时设置

如果开启“兼容代理模式”后遇到 `524`、`timeout`、`error code: 524`，通常是生图请求耗时太久，Nginx、PHP-FPM 或 CDN 在上游接口返回前先断开了连接。

先在宝塔里确认 PHP 超时已经调大：

1. 进入“软件商店”
2. 找到当前站点使用的 PHP 版本
3. 点击“设置”
4. 在“配置修改”中调整：

```ini
max_execution_time = 600
max_input_time = 600
default_socket_timeout = 600
memory_limit = 256M
```

然后在 PHP 的“性能调整”或 FPM 配置中确认：

```ini
request_terminate_timeout = 600
```

如果这个值是 `0`，一般表示不主动限制，也可以保持不改。

再到“网站” -> 你的站点 -> “设置” -> “配置文件”，在 `server { ... }` 里面加入下面配置，建议放在 `#SSL-END` 后面、`#ERROR-PAGE-START` 前面：

```nginx
    # Long-running API proxy timeout
    client_body_timeout 600s;
    client_header_timeout 600s;
    send_timeout 600s;
    keepalive_timeout 65s;

    fastcgi_connect_timeout 600s;
    fastcgi_send_timeout 600s;
    fastcgi_read_timeout 600s;

    proxy_connect_timeout 600s;
    proxy_send_timeout 600s;
    proxy_read_timeout 600s;
```

保存后执行：

1. Nginx 配置检查
2. 重载 Nginx
3. 重启对应 PHP 版本

注意：如果域名套了 Cloudflare 或其他 CDN 代理，CDN 自己也可能在 60-100 秒左右断开，继续报 `524`。这种情况下宝塔里调到 600 秒也不一定有效，建议把用于 `api-proxy.php` 的域名改成 DNS only，或者单独建一个不走 CDN 的代理子域名。

## 9. 关于 `prompts.json`

公共提示词库来自：

- `data/prompts.json`

所以以后如果你只想更新提示词库，通常只要替换这个文件即可，不需要改 JS。

## 10. 这个项目在宝塔上为什么不需要数据库

因为当前数据存储方式是：

- 浏览器本地设置：`localStorage`
- 历史记录：`IndexedDB`

也就是说：

- 历史记录保存在用户自己的浏览器里
- 不是保存在你的服务器数据库里

所以：

- 换浏览器看不到原历史
- 换设备看不到原历史
- 清浏览器数据后历史会消失

这属于当前项目设计，不是部署故障。

## 11. 手机端有一个你要知道的限制

页面里有“选择保存文件夹”等能力，这依赖浏览器的 File System Access API。

这意味着：

- 桌面版 Chrome / Edge 支持更好
- 某些手机浏览器不一定完整支持
- 微信里内置浏览器通常兼容性更差

这和宝塔无关，是浏览器能力差异。

## 12. 建议的宝塔缓存策略

建议：

- `index.html` 不要长缓存
- `assets/*.css`、`assets/*.js`、`data/*.json` 可以开缓存

原因：

- `index.html` 变更频率高，缓存太久容易让用户看到旧版
- CSS/JS/JSON 是独立文件，缓存后刷新会更快

如果你用了宝塔/Nginx 缓存或 CDN，改完页面后最好：

1. 清缓存
2. 浏览器强刷一次

## 13. 常见问题

### 1. 页面能打开，但样式丢了

通常是：

- `assets/` 没上传完整
- 路径不对
- CDN/缓存还在用旧版本

优先检查：

- `/assets/css/main.css`
- `/assets/js/app.js`

### 2. 提示词库加载失败

通常是：

- `data/prompts.json` 没上传
- 文件路径不对
- 文件内容不是合法 JSON

先直接访问：

- `https://你的域名/data/prompts.json`

### 3. 生成时报 `Failed to fetch`

通常是：

- 目标接口不支持浏览器跨域

处理方法：

1. 保留 `api-proxy.php`
2. 站点启用 PHP
3. 页面里打开“兼容代理模式”

### 4. `api-proxy.php` 打开是 500

通常检查：

- PHP 版本过低
- `curl` 没开
- PHP 被禁用了某些基础函数

先去宝塔的：

- PHP 错误日志
- 网站错误日志

看具体报错。

### 5. 页面刷新后历史记录没了

这通常不是服务器问题。

因为历史记录在浏览器本地：

- 用户换设备会没有
- 清缓存会没有
- 无痕模式里可能不会长期保留

## 14. 最稳的上线做法

推荐你在宝塔上按下面方式落地：

1. 新建一个 PHP 站点
2. 上传 `index.html`、`assets/`、`data/`、`api-proxy.php`
3. 开 HTTPS
4. 检查 `main.css`、`app.js`、`prompts.json` 能直接访问
5. 先测试直连接口
6. 如果跨域，再开启页面里的“兼容代理模式”

## 15. 当前版本的部署结论

你现在这个项目已经适合直接上宝塔，不需要再改成 Node 项目。

最简单的理解就是：

- 页面本体是静态站
- `api-proxy.php` 只是一个可选兼容层
- 直接按上面目录上传就能跑
