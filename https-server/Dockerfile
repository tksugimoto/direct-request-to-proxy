FROM node:10-alpine

RUN apk --update add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

# TZ環境変数でタイムゾーンを変更できるようにするため
RUN apk --update --no-cache add tzdata

COPY ./index.js /opt/https-server/
COPY ./lib/     /opt/https-server/lib/

CMD ["node", "/opt/https-server/index.js"]
