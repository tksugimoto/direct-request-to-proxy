FROM centos:7.6.1810

RUN yum -y install dnsmasq

# 環境変数を展開するため sh 経由で dnsmasq を実行する
CMD ["sh", "-cx", "dnsmasq \
    -d \
    --address=/#/${resolution_ip} \
    --no-hosts \
    --no-resolv \
"]
