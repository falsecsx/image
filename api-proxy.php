<?php
declare(strict_types=1);

require_once __DIR__ . '/api/bootstrap.php';
require_once __DIR__ . '/api/quota.php';

const MAX_PROXY_BODY_BYTES = 60 * 1024 * 1024;
const MAX_COMMUNITY_MEDIA_BYTES = 15 * 1024 * 1024;
const MEDIA_CACHE_DIR = __DIR__ . '/cache/media';
const MEDIA_CACHE_TTL = 7 * 86400;
const MEDIA_CACHE_FAILURE_TTL = 10 * 60;
const MEDIA_CACHE_KEY_VERSION = '20260813-4';
const MEDIA_CACHE_MAX_SIZE = 500 * 1024 * 1024;

function media_cache_dir(): string
{
    $env = getenv('AI_CACHE_DIR');
    if (is_string($env) && trim($env) !== '') {
        return rtrim(trim($env), '/\\') . '/media';
    }
    return MEDIA_CACHE_DIR;
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

function is_public_host(string $host): bool
{
    $ips = resolve_host_ips($host);
    if (!$ips) {
        return false;
    }
    foreach ($ips as $ip) {
        if (is_private_ip($ip)) {
            return false;
        }
    }
    return true;
}

function apply_curl_ca($ch): void
{
    $ca = getenv('AI_CA_BUNDLE');
    if (is_string($ca) && trim($ca) !== '' && is_file($ca)) {
        curl_setopt($ch, CURLOPT_CAINFO, $ca);
        return;
    }
    $gitCa = 'C:/Program Files/Git/mingw64/etc/ssl/certs/ca-bundle.crt';
    if (is_file($gitCa)) {
        curl_setopt($ch, CURLOPT_CAINFO, $gitCa);
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
    $path = ai_data_dir() . '/community-image-hosts.json';
    if (!is_file($path)) {
        return [];
    }
    $payload = json_decode((string) file_get_contents($path), true);
    $hosts = is_array($payload['hosts'] ?? null) ? $payload['hosts'] : [];
    return array_values(array_filter(array_map(static fn($host) => strtolower(trim((string) $host)), $hosts)));
}

function load_community_auxiliary_hosts(): array
{
    $path = ai_data_dir() . '/community-image-hosts.json';
    if (!is_file($path)) {
        return ['images.weserv.nl', 'wsrv.nl', 'cdn.jsdelivr.net'];
    }
    $payload = json_decode((string) file_get_contents($path), true);
    $hosts = is_array($payload['auxiliary'] ?? null) ? $payload['auxiliary'] : ['images.weserv.nl', 'wsrv.nl', 'cdn.jsdelivr.net'];
    return array_values(array_filter(array_map(static fn($host) => strtolower(trim((string) $host)), $hosts)));
}

function load_community_relay_hosts(): array
{
    $path = ai_data_dir() . '/community-image-hosts.json';
    if (!is_file($path)) {
        return ['pbs.twimg.com', 'linux.do', 'i.mji.rip', 'i.mij.rip'];
    }
    $payload = json_decode((string) file_get_contents($path), true);
    $hosts = is_array($payload['relay'] ?? null) ? $payload['relay'] : ['pbs.twimg.com', 'linux.do', 'i.mji.rip', 'i.mij.rip'];
    return array_values(array_filter(array_map(static fn($host) => strtolower(trim((string) $host)), $hosts)));
}

function load_model_output_media_hosts(): array
{
    return [
        'googleusercontent.com',
        'lh3.googleusercontent.com',
        'images.googleusercontent.com',
    ];
}

function build_github_mirror_url(string $target): string
{
    $parts = parse_url($target);
    if (!$parts) return '';
    $host = strtolower((string) ($parts['host'] ?? ''));
    $path = (string) ($parts['path'] ?? '');
    $query = isset($parts['query']) ? '?' . $parts['query'] : '';
    $segments = explode('/', trim($path, '/'));

    if ($host === 'raw.githubusercontent.com' && count($segments) >= 4) {
        [$owner, $repo, $ref] = array_slice($segments, 0, 3);
        $filePath = implode('/', array_slice($segments, 3));
        return 'https://cdn.jsdelivr.net/gh/' . $owner . '/' . $repo . '@' . $ref . '/' . $filePath . $query;
    }

    if ($host === 'github.com' && count($segments) >= 5 && ($segments[2] === 'blob' || $segments[2] === 'raw')) {
        [$owner, $repo, , $ref] = array_slice($segments, 0, 4);
        $filePath = implode('/', array_slice($segments, 4));
        return 'https://cdn.jsdelivr.net/gh/' . $owner . '/' . $repo . '@' . $ref . '/' . $filePath . $query;
    }

    if ($host === 'cdn.jsdelivr.net' && count($segments) >= 4 && $segments[0] === 'gh') {
        $owner = $segments[1];
        $repoRef = $segments[2];
        $separator = strpos($repoRef, '@');
        if ($owner !== '' && $separator !== false) {
            $repo = substr($repoRef, 0, $separator);
            $ref = substr($repoRef, $separator + 1);
            $filePath = implode('/', array_slice($segments, 3));
            if ($repo !== '' && $ref !== '' && $filePath !== '') {
                return 'https://raw.githubusercontent.com/' . $owner . '/' . $repo . '/' . $ref . '/' . $filePath . $query;
            }
        }
    }

    return '';
}

function build_community_relay_urls(string $target): array
{
    $parts = parse_url($target);
    if (!$parts) return [];
    $host = strtolower((string) ($parts['host'] ?? ''));
    if ($host === '' || !in_array($host, load_community_relay_hosts(), true)) return [];
    $encoded = urlencode($target);
    return [
        'https://images.weserv.nl/?url=' . $encoded . '&we',
        'https://wsrv.nl/?url=' . $encoded,
    ];
}

function validate_community_media_target(string $target): array
{
    $parts = parse_url($target);
    if (!$parts || strtolower((string) ($parts['scheme'] ?? '')) !== 'https') {
        send_json(400, ['error' => 'community media proxy requires https']);
    }

    $host = strtolower((string) ($parts['host'] ?? ''));
    $allowedHosts = array_merge(load_community_media_hosts(), load_model_output_media_hosts());
    if ($host === '' || !in_array($host, $allowedHosts, true)) {
        send_json(400, ['error' => 'community media host is not allowlisted']);
    }

    assert_public_host($host, 'private media address is not allowed or could not be verified');

    return $parts;
}

function normalize_redirect_path(string $path): string
{
    $segments = [];
    foreach (explode('/', $path) as $segment) {
        if ($segment === '' || $segment === '.') {
            continue;
        }
        if ($segment === '..') {
            array_pop($segments);
            continue;
        }
        $segments[] = $segment;
    }
    return '/' . implode('/', $segments);
}

function resolve_community_media_redirect(string $base, string $location): string
{
    $location = trim($location);
    if ($location === '') {
        return '';
    }

    $locationParts = parse_url($location);
    if ($locationParts !== false && isset($locationParts['scheme'])) {
        return $location;
    }

    $baseParts = parse_url($base);
    if (!$baseParts || empty($baseParts['scheme']) || empty($baseParts['host'])) {
        return '';
    }

    $scheme = strtolower((string) $baseParts['scheme']);
    $authority = $scheme . '://' . $baseParts['host'];
    if (isset($baseParts['port'])) {
        $authority .= ':' . (int) $baseParts['port'];
    }
    if (str_starts_with($location, '//')) {
        return $scheme . ':' . $location;
    }
    if (str_starts_with($location, '?')) {
        return $authority . ((string) ($baseParts['path'] ?? '/')) . $location;
    }
    if (str_starts_with($location, '#')) {
        return $base;
    }
    if (str_starts_with($location, '/')) {
        return $authority . $location;
    }

    $basePath = (string) ($baseParts['path'] ?? '/');
    $directory = substr($basePath, 0, (int) strrpos($basePath, '/') + 1);
    $relativeParts = parse_url($location);
    $relativePath = (string) ($relativeParts['path'] ?? $location);
    $query = isset($relativeParts['query']) ? '?' . $relativeParts['query'] : '';
    return $authority . normalize_redirect_path($directory . $relativePath) . $query;
}

function get_media_cache_path(string $target): string
{
    $hash = hash('sha256', MEDIA_CACHE_KEY_VERSION . "\0" . $target);
    return media_cache_dir() . '/' . substr($hash, 0, 2) . '/' . $hash;
}

function open_media_cache_lock(string $path)
{
    $handle = @fopen($path . '.lock', 'c');
    if ($handle === false || !@flock($handle, LOCK_EX)) {
        if (is_resource($handle)) {
            @fclose($handle);
        }
        return null;
    }
    return $handle;
}

function close_media_cache_lock($handle): void
{
    if (!is_resource($handle)) {
        return;
    }
    @flock($handle, LOCK_UN);
    @fclose($handle);
}

function write_media_cache_meta(string $path, array $meta): bool
{
    $encoded = json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        return false;
    }

    $tempPath = $path . '.tmp-meta.' . bin2hex(random_bytes(4));
    if (@file_put_contents($tempPath, $encoded, LOCK_EX) === false) {
        @unlink($tempPath);
        return false;
    }
    if (!@rename($tempPath, $path)) {
        @unlink($tempPath);
        return false;
    }
    return true;
}

function get_cached_media(string $target): ?array
{
    $path = get_media_cache_path($target);
    $metaPath = $path . '.meta';
    if (!is_file($path) && !is_file($metaPath)) return null;

    $lock = open_media_cache_lock($path);
    if ($lock === null) return null;

    try {
        $meta = json_decode((string) file_get_contents($metaPath), true);
        if (!is_array($meta) || !isset($meta['time'], $meta['status'])) return null;

        $isFailure = !empty($meta['failure']);
        $ttl = $isFailure ? MEDIA_CACHE_FAILURE_TTL : MEDIA_CACHE_TTL;
        if (time() - (int) $meta['time'] > $ttl) return null;

        if ($isFailure) {
            $meta['accessTime'] = time();
            write_media_cache_meta($metaPath, $meta);
            return [(int) $meta['status'], (string) ($meta['contentType'] ?? 'text/plain'), ''];
        }

        if (!isset($meta['contentType'])) return null;
        if (!is_file($path)) return null;
        $body = file_get_contents($path);
        if ($body === false) return null;

        $meta['accessTime'] = time();
        write_media_cache_meta($metaPath, $meta);
        return [(int) $meta['status'], (string) $meta['contentType'], $body];
    } finally {
        close_media_cache_lock($lock);
    }
}

function save_cached_media(string $target, int $status, string $contentType, string $body): void
{
    if (strlen($body) > MAX_COMMUNITY_MEDIA_BYTES) return;

    $path = get_media_cache_path($target);
    $dir = dirname($path);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
        if (!is_dir($dir)) return;
    }

    $lock = open_media_cache_lock($path);
    if ($lock === null) return;

    try {
        $tmpPath = $path . '.tmp.' . bin2hex(random_bytes(4));
        if (file_put_contents($tmpPath, $body, LOCK_EX) === false) {
            @unlink($tmpPath);
            return;
        }

        if (!@rename($tmpPath, $path)) {
            @unlink($tmpPath);
            return;
        }

        write_media_cache_meta($path . '.meta', [
            'status' => $status,
            'contentType' => $contentType,
            'time' => time(),
            'accessTime' => time(),
            'url' => $target,
            'size' => strlen($body),
        ]);
    } finally {
        close_media_cache_lock($lock);
    }

    if (random_int(1, 100) === 1) {
        clean_media_cache();
    }
}

function save_media_failure(string $target, int $status, string $reason): void
{
    $path = get_media_cache_path($target);
    $dir = dirname($path);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) return;

    $lock = open_media_cache_lock($path);
    if ($lock === null) return;

    try {
        write_media_cache_meta($path . '.meta', [
            'status'      => $status,
            'contentType' => 'text/plain',
            'time'        => time(),
            'accessTime'  => time(),
            'url'         => $target,
            'size'        => 0,
            'failure'     => true,
            'reason'      => $reason,
        ]);
    } finally {
        close_media_cache_lock($lock);
    }
}

function clean_media_cache(): void
{
    if (!is_dir(media_cache_dir())) return;

    $files = [];
    $totalSize = 0;
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator(media_cache_dir(), FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY
    );

    foreach ($iterator as $file) {
        if (!$file->isFile()) continue;
        $fileName = $file->getFilename();
        if ($fileName === '' || str_ends_with($fileName, '.meta') || str_ends_with($fileName, '.lock') || str_contains($fileName, '.tmp')) continue;
        $metaFile = $file->getPathname() . '.meta';
        $time = $file->getMTime();
        if (is_file($metaFile)) {
            $meta = json_decode((string) file_get_contents($metaFile), true);
            if (is_array($meta) && isset($meta['time'])) {
                $time = (int) ($meta['accessTime'] ?? $meta['time']);
            }
        }
        $size = $file->getSize();
        $files[] = ['path' => $file->getPathname(), 'time' => $time, 'size' => $size];
        $totalSize += $size;
    }

    if ($totalSize <= MEDIA_CACHE_MAX_SIZE) return;

    usort($files, static fn($a, $b) => $a['time'] <=> $b['time']);

    foreach ($files as $file) {
        if ($totalSize <= MEDIA_CACHE_MAX_SIZE) break;
        $lock = @fopen($file['path'] . '.lock', 'c');
        if ($lock === false || !@flock($lock, LOCK_EX | LOCK_NB)) {
            if (is_resource($lock)) @fclose($lock);
            continue;
        }
        @unlink($file['path']);
        @unlink($file['path'] . '.meta');
        @flock($lock, LOCK_UN);
        @fclose($lock);
        $totalSize -= $file['size'];
    }
}

function fetch_community_media(string $target): array
{
    if (!function_exists('curl_init')) {
        send_json(500, ['error' => 'community media proxy requires PHP cURL']);
    }

    $modelOutputHosts = load_model_output_media_hosts();
    $allowedHosts = array_merge(load_community_media_hosts(), $modelOutputHosts);
    $auxiliaryHosts = load_community_auxiliary_hosts();
    $allAllowedHosts = array_merge($allowedHosts, $auxiliaryHosts);
    $googleApiKey = get_request_header('X-Goog-Api-Key');

    $validateTarget = static function (string $url) use ($allAllowedHosts): bool {
        $parts = parse_url($url);
        if (!$parts || strtolower((string) ($parts['scheme'] ?? '')) !== 'https') {
            return false;
        }
        $host = strtolower((string) ($parts['host'] ?? ''));
        if ($host === '' || !in_array($host, $allAllowedHosts, true)) {
            return false;
        }
        if (!is_public_host($host)) {
            return false;
        }
        return true;
    };

    $tryFetch = static function (string $url) use ($validateTarget, $googleApiKey, $modelOutputHosts): ?array {
        $current = $url;
        for ($hop = 0; $hop <= 3; $hop++) {
            if (!$validateTarget($current)) {
                return null;
            }
            $ch = curl_init($current);
            apply_curl_ca($ch);
            $body = '';
            $tooLarge = false;
            $location = '';
            $contentType = '';
            $currentHost = strtolower((string) (parse_url($current, PHP_URL_HOST) ?? ''));
            $requestHeaders = [
                'Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
                $currentHost !== '' ? 'Referer: https://' . $currentHost . '/' : 'Referer: https://ai.falseai.cn/',
            ];
            if ($googleApiKey !== '' && in_array($currentHost, $modelOutputHosts, true)) {
                $requestHeaders[] = 'X-Goog-Api-Key: ' . $googleApiKey;
            }

            curl_setopt_array($ch, [
                CURLOPT_CUSTOMREQUEST => 'GET',
                CURLOPT_RETURNTRANSFER => false,
                CURLOPT_HEADER => false,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_ENCODING => '',
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_TIMEOUT => 20,
                CURLOPT_HTTPHEADER => $requestHeaders,
                CURLOPT_HEADERFUNCTION => static function ($handle, string $line) use (&$location, &$contentType): int {
                    $trimmed = trim($line);
                    if (stripos($trimmed, 'location:') === 0) {
                        $location = trim(substr($trimmed, strlen('location:')));
                    } elseif (stripos($trimmed, 'content-type:') === 0) {
                        $contentType = trim(substr($trimmed, strlen('content-type:')));
                    }
                    return strlen($line);
                },
                CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$body, &$tooLarge): int {
                    if (strlen($body) + strlen($chunk) > MAX_COMMUNITY_MEDIA_BYTES) {
                        $tooLarge = true;
                        return 0;
                    }
                    $body .= $chunk;
                    return strlen($chunk);
                }
            ]);
            $response = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $reportedType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
            if ($reportedType !== '') {
                $contentType = $reportedType;
            }

            if ($tooLarge) {
                curl_close($ch);
                send_json(413, ['error' => 'community image is too large']);
            }
            if ($response === false) {
                curl_close($ch);
                return null;
            }
            curl_close($ch);

            if ($status >= 300 && $status < 400 && $location !== '') {
                if ($hop >= 3) {
                    return null;
                }
                $next = resolve_community_media_redirect($current, $location);
                if ($next === '') {
                    return null;
                }
                $current = $next;
                continue;
            }

            if ($status < 200 || $status >= 300 || stripos($contentType, 'image/') !== 0) {
                return null;
            }
            return [$status, $contentType ?: 'image/png', $body];
        }
        return null;
    };

    // 1. Try original target
    $result = $tryFetch($target);
    if ($result !== null) {
        return $result;
    }

    // 2. Try GitHub mirror if applicable
    $mirror = build_github_mirror_url($target);
    if ($mirror !== '') {
        $result = $tryFetch($mirror);
        if ($result !== null) {
            return $result;
        }
    }

    // 3. Try relay if host is in relay-allowed list
    $targetParts = parse_url($target);
    $targetHost = strtolower((string) ($targetParts['host'] ?? ''));
    $relayHosts = load_community_relay_hosts();
    if (in_array($targetHost, $relayHosts, true)) {
        foreach (build_community_relay_urls($target) as $relayUrl) {
            $result = $tryFetch($relayUrl);
            if ($result !== null) {
                return $result;
            }
        }
    }

    // Keep failures briefly so a transient upstream outage does not poison the cache.
    save_media_failure($target, 502, 'all attempts exhausted');

    send_json(502, ['error' => 'community media proxy failed: all attempts exhausted']);
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

    $forceRefresh = !empty($_GET['retry'])
        || !empty($_GET['refresh'])
        || !empty($_GET['prompt-library-retry']);
    $cached = $forceRefresh ? null : get_cached_media($target);
    if ($cached !== null) {
        [$status, $contentType, $body] = $cached;
        http_response_code($status);
        set_cors_headers();
        header('Content-Type: ' . ($contentType ?: 'image/png'));
        header('Cache-Control: public, max-age=86400');
        header('X-Cache: HIT');
        echo $body;
        exit;
    }

    [$status, $contentType, $body] = fetch_community_media($target);
    save_cached_media($target, $status, $contentType, $body);

    http_response_code($status);
    set_cors_headers();
    header('Content-Type: ' . ($contentType ?: 'image/png'));
    header('Cache-Control: public, max-age=86400');
    header('X-Cache: ' . ($forceRefresh ? 'BYPASS' : 'MISS'));
    echo $body;
    exit;
}

$parts = validate_target($target);

// === Quota Check ===
$targetPath = $parts['path'] ?? '';
$isGenerationRequest = preg_match('#/(images/generations|images/edits|videos|video/create|video/generations|multimodal-generation|aigc/video)#i', $targetPath);
$isUpscaleRequest = isset($_GET['upscale']) && $_GET['upscale'] === '1';
$quotaChecked = false;
$quotaImageCount = 0;
$quotaCost = 0;
$quotaRequestType = 'generate';
$quotaRawBody = null;
$quotaTxnId = null;

if ($isGenerationRequest || $isUpscaleRequest) {
    // Read body early for quota check (php://input can only be read once)
    if ($method === 'POST') {
        $quotaRawBody = file_get_contents('php://input');
        if ($quotaRawBody === false) $quotaRawBody = '';
    } else {
        $quotaRawBody = '';
    }

    $quotaImageCount = $isUpscaleRequest ? 1 : parse_image_count($quotaRawBody);
    $quotaRequestType = $isUpscaleRequest ? 'upscale' : 'generate';
    // Upscale: fixed 1 per image, not affected by proxy multiplier
    $quotaCost = $isUpscaleRequest ? $quotaImageCount : $quotaImageCount * get_multiplier('proxy');

    $preDeduct = pre_deduct($quotaImageCount, 'proxy', $target, $quotaRequestType, $quotaCost);
    if (!$preDeduct['allowed']) {
        send_json(429, [
            'error' => '今日生成次数已达上限',
            'quota' => $preDeduct['quota'] ?? [
                'daily_limit'            => 0,
                'daily_used'             => 0,
                'monthly_bonus_remaining'=> 0,
                'quota_cost'             => $quotaCost,
                'mode'                   => 'proxy',
            ],
        ]);
    }
    $quotaTxnId = $preDeduct['txn_id'] ?? null;
    $quotaChecked = true;
}

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
    // Reuse body already read during quota check if available
    if ($quotaRawBody !== null) {
        $rawBody = $quotaRawBody;
    } else {
        $rawBody = file_get_contents('php://input');
        if ($rawBody === false) {
            $rawBody = '';
        }
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
apply_curl_ca($ch);
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
    // Rollback quota deduction if proxy request failed
    if ($quotaChecked && $quotaTxnId !== null) {
        rollback_transaction($quotaTxnId);
    }
    send_json(502, ['error' => '代理请求失败: ' . $error]);
}

$status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$responseHeaders = substr($response, 0, $headerSize);
$body = substr($response, $headerSize);
curl_close($ch);

if ($quotaChecked && $quotaTxnId !== null) {
    if ($status >= 200 && $status < 400) {
        confirm_transaction($quotaTxnId);
    } else {
        rollback_transaction($quotaTxnId);
    }
}

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

// Inject quota status headers for frontend
if ($quotaChecked) {
    $quotaStatus = get_quota_status();
    header('X-Quota-Daily-Limit: ' . $quotaStatus['daily_limit']);
    header('X-Quota-Daily-Remaining: ' . max(0, $quotaStatus['daily_remaining']));
    header('X-Quota-Monthly-Bonus-Remaining: ' . $quotaStatus['monthly_bonus_remaining']);
    header('X-Quota-Mode: proxy');
    header('X-Quota-Multiplier: ' . $quotaStatus['proxy_multiplier']);
}

echo $body;
