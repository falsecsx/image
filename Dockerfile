FROM php:8.2-fpm-alpine

LABEL org.opencontainers.image.title="AI Image Studio"
LABEL org.opencontainers.image.url="https://ai.falseai.cn"

RUN apk add --no-cache nginx ca-certificates curl sqlite-libs \
    && apk add --no-cache --virtual .php-build-deps $PHPIZE_DEPS curl-dev sqlite-dev \
    && docker-php-ext-install opcache pdo_sqlite fileinfo curl \
    && apk del .php-build-deps

# PHP timeout config for long-running API proxy requests
RUN echo "max_execution_time = 600\n" \
         "max_input_time = 600\n" \
         "default_socket_timeout = 600\n" \
         "memory_limit = 256M\n" \
         > /usr/local/etc/php/conf.d/proxy-timeouts.ini

COPY . /var/www/html
COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && rm -rf /var/www/html/docker \
    && mkdir -p /var/www/html/cache/media \
    && chown -R www-data:www-data /var/www/html/cache \
    && chown -R www-data:www-data /var/www/html/data

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
