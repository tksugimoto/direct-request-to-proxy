#!/bin/bash
set -e

echo "認証プロキシ有りの透過プロキシを起動する"

# ※ .env の値を環境変数で上書きできなかったので、 docker-compose.proxy.override.yml を使って上書きする
export COMPOSE_FILE="docker-compose.yml:docker-compose.proxy.override.yml"
export COMPOSE_PATH_SEPARATOR=":"

echo COMPOSE_PATH_SEPARATOR: [${COMPOSE_PATH_SEPARATOR}]

readonly proxy_host=${proxy_host:-$(docker-machine ip)}
readonly proxy_port=${proxy_port:-3128}

readonly user=${proxy_user:-admin}

echo "Proxy Host: ${proxy_host}"
echo "Proxy Port: ${proxy_port}"
echo "Proxy User: ${user}"

read -sp "Proxy Password: " pass

echo

readonly url=http://${user}:${pass}@${proxy_host}:${proxy_port}

export http_proxy_with_auth=${url}
export https_proxy_with_auth=${url}

set -x

docker-compose up -d --build --force-recreate

docker-compose logs  -f
