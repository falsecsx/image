#!/bin/sh
set -e

# Start PHP-FPM in background
php-fpm -D

# Start nginx in foreground
exec nginx -g 'daemon off;'
