FROM node:12-alpine

RUN apk add --update-cache --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

# TZ環境変数でタイムゾーンを変更できるようにするため
RUN apk add --update-cache --no-cache tzdata

COPY ./index.js /opt/http-server/

CMD ["node", "/opt/http-server/index.js"]
