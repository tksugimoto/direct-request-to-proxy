FROM alpine:3.9

RUN apk add --update-cache --no-cache dnsmasq

# 環境変数を展開するため sh 経由で dnsmasq を実行する
CMD ["sh", "-cx", "dnsmasq \
    -d \
    --address=/#/${resolution_ip} \
    --no-hosts \
    $(printf -- '--server=/%s/# ' ${no_proxy_domains}) \
    --log-queries \
    --dns-loop-detect \
"]
