FROM node:10-alpine

RUN apk --update add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

COPY ./index.js /opt/http-server/

CMD ["node", "/opt/http-server/index.js"]
