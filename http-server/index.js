const assert = require('assert');
const net = require('net');
const {
    parse: parseUrl,
} = require('url');

assert(process.env.http_proxy, 'http_proxy env ("http://hostname:port") required.');

const {
    hostname: httpProxyHost,
    port: httpProxyPort,
    auth: httpProxyAuth,
} = parseUrl(process.env.http_proxy);


const CRLF = '\r\n';
const HTTP_PORT = 80;

const currentTime = () => {
    const date = new Date();
    const h = date.getHours();
    const m = date.getMinutes();
    const s = date.getSeconds();
    const ms = date.getMilliseconds();
    return `${h}:${m}:${s}.${ms}`;
};

const log = text => {
    console.info(`[${currentTime()}] ------------- ${text} -------------`);
};

const httpServer = net.createServer();

httpServer.on('connection', (clientSocket) => {
    clientSocket.once('data', dataBuffer => {
        // 非同期処理をするときは flowing mode から paused mode に切り替えないと、クライアントから来るデータが分割されている場合失われる可能性がある(HTTP Header と Body が分割された場合など)
        clientSocket.pause();

        const httpRequestArray = dataBuffer.toString().split(CRLF);
        const hostHeader = httpRequestArray.find(header => header.startsWith('Host:'));
        if (!hostHeader) {
            log('Request error: Host header not found');
            clientSocket.end();
            return;
        }

        const proxyServerSocket = net.createConnection(httpProxyPort, httpProxyHost);
        proxyServerSocket.once('connect', () => {
            const hostname = hostHeader.slice('Host:'.length).trim().replace(/:.*/, '');
            log(`forward request to ${hostname}`);
            httpRequestArray[0] = httpRequestArray[0].replace(' ', ` http://${hostname}`);
            if (httpProxyAuth) {
                httpRequestArray.splice(1, 0, `Proxy-Authorization: Basic ${Buffer.from(httpProxyAuth).toString('base64')}`);
            }
            proxyServerSocket.write(httpRequestArray.join(CRLF));
            clientSocket.pipe(proxyServerSocket);
            proxyServerSocket.pipe(clientSocket);
        });
        proxyServerSocket.on('error', err => {
            log(`Proxy Server Socket error: ${err.message}`);
            console.error(err);
            clientSocket.end();
        });
        clientSocket.on('error', () => {
            proxyServerSocket.end();
        });
    });
    clientSocket.on('error', err => {
        log(`Client Socket error: ${err.message}`);
        console.error(err);
    });
});

httpServer.listen(HTTP_PORT, '0.0.0.0');
