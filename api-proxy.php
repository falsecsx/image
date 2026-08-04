<?php
declare(strict_types=1);

const MAX_PROXY_BODY_BYTES = 60 * 1024 * 1024;
const MAX_COMMUNITY_MEDIA_BYTES = 15 * 1024 * 1024;

function set_cors_headers(): void
{
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin === '') {
        return;
    }

    $originHost = strtolower((string) (parse_url($origin, PHP_URL_HOST) ?? ''));
    $serverHost = strtolower((string) (parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST) ?? ''));
    if ($originHost !== '' && $originHost === $serverHost) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
}

function send_json(int $status, array $payload): void
{
    http_response_code($status);
    set_cors_headers();
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function get_request_header(string $name): string
{
    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    if (isset($_SERVER[$serverKey])) {
        return trim((string) $_SERVER[$serverKey]);
    }

    if (strtolower($name) === 'authorization') {
        return trim((string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? ''));
    }

    if (function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $headerName => $value) {
            if (strcasecmp($headerName, $name) === 0) {
                return trim((string) $value);
            }
        }
    }

    return '';
}

function is_private_ip(string $ip): bool
{
    return filter_var(
        $ip,
        FILTER_VALIDATE_IP,
        FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
    ) === false;
}

function resolve_host_ips(string $host): array
{
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        return [$host];
    }

    $ips = [];
    if (function_exists('dns_get_record')) {
        $records = @dns_get_record($host, DNS_A | DNS_AAAA);
        if (is_array($records)) {
            foreach ($records as $record) {
                foreach (['ip', 'ipv6'] as $key) {
                    $ip = trim((string) ($record[$key] ?? ''));
                    if ($ip !== '') {
                        $ips[] = $ip;
                    }
                }
            }
        }
    }

    if (!$ips) {
        $fallback = @gethostbynamel($host);
        if (is_array($fallback)) {
            $ips = $fallback;
        }
    }

    return array_values(array_unique($ips));
}

function assert_public_host(string $host, string $error): void
{
    $ips = resolve_host_ips($host);
    if (!$ips) {
        send_json(400, ['error' => $error]);
    }

    foreach ($ips as $ip) {
        if (is_private_ip($ip)) {
            send_json(400, ['error' => $error]);
        }
    }
}

function validate_target(string $target): array
{
    $parts = parse_url($target);
    if (!$parts || strtolower((string) ($parts['scheme'] ?? '')) !== 'https') {
        send_json(400, ['error' => '代理模式只允许 https:// API 地址']);
    }

    $host = strtolower((string) ($parts['host'] ?? ''));
    $path = (string) ($parts['path'] ?? '');
    if ($host === '' || $path === '') {
        send_json(400, ['error' => '目标 API 地址无效']);
    }

    if ($host === 'localhost' || substr($host, -10) === '.localhost') {
        send_json(400, ['error' => '不允许代理本机地址']);
    }

    $allowedPathPatterns = [
        '#(^|/)(v1|v1beta)(/|$)#',
        '#(^|/)compatible-mode/v1(/|$)#',
        '#(^|/)api/v1(/|$)#',
        '#(^|/)api/v3(/|$)#',
        '#(^|/)alibailian/api/v1(/|$)#',
        '#(^|/)volc/v1(/|$)#',
    ];
    $pathAllowed = false;
    foreach ($allowedPathPatterns as $pattern) {
        if (preg_match($pattern, $path)) {
            $pathAllowed = true;
            break;
        }
    }

    // Media download proxy: known model-output hosts + media-like paths only.
    $mediaHosts = [
        'oaidalleapiprodscus.blob.core.windows.net',
        'cdn.openai.com',
        'videos.openai.com',
        'replicate.delivery',
        'pbxt.replicate.delivery',
        'storage.googleapis.com',
    ];
    $isMediaHost = in_array($host, $mediaHosts, true)
        || preg_match('/\.replicate\.delivery$/', $host)
        || preg_match('/\.blob\.core\.windows\.net$/', $host);
    $isMediaPath = (bool) preg_match('#\.(png|jpe?g|webp|gif|mp4|webm|mov|m4v)(\?|$)#i', $path)
        || strpos($path, '/files/') !== false
        || strpos($path, '/oai/') !== false;
    if (!$pathAllowed && !($isMediaHost && $isMediaPath)) {
        send_json(400, ['error' => '代理模式只允许常见 AI API 路径或受支持的媒体下载地址']);
    }

    assert_public_host($host, '不允许代理私密或无法验证的地址');

    return $parts;
}

function load_community_media_hosts(): array
{
    $path = __DIR__ . '/data/community-image-hosts.json';
    if (!is_file($path)) {
        return [];
    }
    $payload = json_decode((string) file_get_contents($path), true);
    $hosts = is_array($payload['hosts'] ?? null) ? $payload['hosts'] : [];
    return array_values(array_filter(array_map(static fn($host) => strtolower(trim((string) $host)), $hosts)));
}

function validate_community_media_target(string $target): array
{
    $parts = parse_url($target);
    if (!$parts || strtolower((string) ($parts['scheme'] ?? '')) !== 'https') {
        send_json(400, ['error' => 'community media proxy requires https']);
    }

    $host = strtolower((string) ($parts['host'] ?? ''));
    if ($host === '' || !in_array($host, load_community_media_hosts(), true)) {
        send_json(400, ['error' => 'community media host is not allowlisted']);
    }

    assert_public_host($host, 'private media address is not allowed or could not be verified');

    return $parts;
}

function build_forward_headers(bool $skipContentType = false, string $contentTypeOverride = ''): array
{
    $headers = [];
    $allowed = ['Authorization', 'Content-Type', 'Accept', 'X-Goog-Api-Key'];
    foreach ($allowed as $name) {
        if ($skipContentType && strcasecmp($name, 'Content-Type') === 0) {
            continue;
        }
        $value = get_request_header($name);
        if ($value !== '') {
            $headers[] = $name . ': ' . $value;
        }
    }
    if ($contentTypeOverride !== '') {
        $headers[] = 'Content-Type: ' . $contentTypeOverride;
    }
    return $headers;
}

function escape_multipart_name(string $value): string
{
    return str_replace(['\\', '"', "\r", "\n"], ['\\\\', '\\"', '', ''], $value);
}

function normalize_files(array $files): array
{
    $normalized = [];
    foreach ($files as $field => $info) {
        if (is_array($info['name'])) {
            $count = count($info['name']);
            for ($i = 0; $i < $count; $i++) {
                if (($info['error'][$i] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                    continue;
                }
                $normalized[] = [
                    'field' => $field,
                    'tmp_name' => $info['tmp_name'][$i],
                    'name' => $info['name'][$i],
                    'type' => $info['type'][$i] ?: 'application/octet-stream',
                ];
            }
            continue;
        }

        if (($info['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            continue;
        }

        $normalized[] = [
            'field' => $field,
            'tmp_name' => $info['tmp_name'],
            'name' => $info['name'],
            'type' => $info['type'] ?: 'application/octet-stream',
        ];
    }
    return $normalized;
}

function append_multipart_field(string &$body, string $boundary, string $name, string $value): void
{
    $body .= '--' . $boundary . "\r\n";
    $body .= 'Content-Disposition: form-data; name="' . escape_multipart_name($name) . '"' . "\r\n\r\n";
    $body .= $value . "\r\n";
}

function append_multipart_fields(string &$body, string $boundary, string $name, $value): void
{
    if (is_array($value)) {
        foreach ($value as $item) {
            append_multipart_fields($body, $boundary, $name . '[]', $item);
        }
        return;
    }

    append_multipart_field($body, $boundary, $name, (string) $value);
}

function build_multipart_body(array $fields, array $files): array
{
    $boundary = '----ai-proxy-' . bin2hex(random_bytes(12));
    $body = '';

    foreach ($fields as $name => $value) {
        append_multipart_fields($body, $boundary, (string) $name, $value);
    }

    foreach (normalize_files($files) as $file) {
        $content = file_get_contents($file['tmp_name']);
        if ($content === false) {
            continue;
        }

        $body .= '--' . $boundary . "\r\n";
        $body .= 'Content-Disposition: form-data; name="' . escape_multipart_name((string) $file['field']) . '"; filename="' . escape_multipart_name((string) $file['name']) . '"' . "\r\n";
        $body .= 'Content-Type: ' . ((string) $file['type']) . "\r\n\r\n";
        $body .= $content . "\r\n";
    }

    $body .= '--' . $boundary . "--\r\n";

    return [
        'body' => $body,
        'content_type' => 'multipart/form-data; boundary=' . $boundary,
    ];
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if ($method === 'OPTIONS') {
    http_response_code(204);
    set_cors_headers();
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept, X-Goog-Api-Key');
    exit;
}

if (!in_array($method, ['GET', 'POST'], true)) {
    send_json(405, ['error' => '代理模式只支持 GET 和 POST']);
}

$target = trim((string) ($_GET['target'] ?? ''));
if ($target === '') {
    send_json(400, ['error' => '缺少 target 参数']);
}

$isCommunityMedia = (string) ($_GET['media'] ?? '') === '1';
if ($isCommunityMedia) {
    if ($method !== 'GET') {
        send_json(405, ['error' => 'community media proxy only supports GET']);
    }
    validate_community_media_target($target);
    $ch = curl_init($target);
    $body = '';
    $tooLarge = false;
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => 'GET',
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_HEADER => false,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => ['Accept: image/*'],
        CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$body, &$tooLarge): int {
            $body .= $chunk;
            if (strlen($body) > MAX_COMMUNITY_MEDIA_BYTES) {
                $tooLarge = true;
                return 0;
            }
            return strlen($chunk);
        }
    ]);
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $contentType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    if ($tooLarge) {
        curl_close($ch);
        send_json(413, ['error' => 'community image is too large']);
    }
    if ($response === false) {
        $error = curl_error($ch);
        curl_close($ch);
        send_json(502, ['error' => 'community media proxy failed: ' . $error]);
    }
    curl_close($ch);
    if ($status < 200 || $status >= 300 || stripos($contentType, 'image/') !== 0) {
        send_json($status >= 400 ? $status : 502, ['error' => 'community target did not return an image']);
    }
    http_response_code($status);
    set_cors_headers();
    header('Content-Type: ' . ($contentType ?: 'image/png'));
    header('Cache-Control: public, max-age=86400');
    echo $body;
    exit;
}

validate_target($target);

$contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > MAX_PROXY_BODY_BYTES) {
    send_json(413, ['error' => '请求体过大']);
}

if (!function_exists('curl_init')) {
    send_json(500, ['error' => '服务器未启用 PHP cURL 扩展']);
}

$rawBody = '';
$postFields = null;
$skipContentType = false;
$contentTypeOverride = '';

if ($method === 'POST') {
    $rawBody = file_get_contents('php://input');
    if ($rawBody === false) {
        $rawBody = '';
    }
    if ($rawBody !== '' && strlen($rawBody) > MAX_PROXY_BODY_BYTES) {
        send_json(413, ['error' => '请求体过大']);
    }
    if (($rawBody === '') && (!empty($_POST) || !empty($_FILES))) {
        $multipart = build_multipart_body($_POST, $_FILES);
        $postFields = $multipart['body'];
        if (strlen((string) $postFields) > MAX_PROXY_BODY_BYTES) {
            send_json(413, ['error' => '请求体过大']);
        }
        $skipContentType = true;
        $contentTypeOverride = $multipart['content_type'];
    }
}

$ch = curl_init($target);
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_CONNECTTIMEOUT => 30,
    CURLOPT_TIMEOUT => 600,
    CURLOPT_HTTPHEADER => build_forward_headers($skipContentType, $contentTypeOverride),
]);

if ($method === 'POST') {
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields ?? ($rawBody === false ? '' : $rawBody));
}

$response = curl_exec($ch);
if ($response === false) {
    $error = curl_error($ch);
    curl_close($ch);
    send_json(502, ['error' => '代理请求失败: ' . $error]);
}

$status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$responseHeaders = substr($response, 0, $headerSize);
$body = substr($response, $headerSize);
curl_close($ch);

http_response_code($status ?: 502);
set_cors_headers();

$contentType = 'application/json; charset=utf-8';
foreach (explode("\r\n", $responseHeaders) as $line) {
    if (stripos($line, 'Content-Type:') === 0) {
        $contentType = trim(substr($line, strlen('Content-Type:')));
        break;
    }
}
header('Content-Type: ' . $contentType);

echo $body;
