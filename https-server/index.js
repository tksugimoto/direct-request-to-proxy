const TlsClientHello = require('./lib/TlsClientHello');
const BufferExtractor = require('./lib/BufferExtractor');

const assert = require('assert');
const net = require('net');
const {
    parse: parseUrl,
} = require('url');

assert(process.env.https_proxy, 'https_proxy env ("http://hostname:port") required.');

const {
    hostname: httpsProxyHost,
    port: httpsProxyPort,
} = parseUrl(process.env.https_proxy);


const CRLF = '\r\n';
const HTTPS_PORT = 443;
const ExtensionValues = {
    SERVER_NAME: 0,
};
const ServerNameType = {
    HOST_NAME: 0,
};

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

const httpsServer = net.createServer();

httpsServer.on('connection', (clientSocket) => {
    clientSocket.once('data', dataBuffer => {
        try {
            const clientHello = TlsClientHello.parse(dataBuffer);

            const serverNameExtension = clientHello.tlsPlaintextFlagment.handshakeBody.extensionData.find(extension => extension.type === ExtensionValues.SERVER_NAME);
            if (!serverNameExtension) {
                log('Request error: (Server Name Indication) SERVER_NAME(0) not found');
                clientSocket.end();
                return;
            }
            const serverNameExtensionDataExtractor = new BufferExtractor(serverNameExtension.data);
            // Server Name Indication Length を読み取って捨てる
            serverNameExtensionDataExtractor.extract(2);
            const nameType = serverNameExtensionDataExtractor.extractAsInt(1);
            if (nameType !== ServerNameType.HOST_NAME) {
                log('Request error: (Server Name Indication) HOST_NAME(0) not found');
                clientSocket.end();
                return;
            }
            const {
                value: hostnameBuffer,
            } = serverNameExtensionDataExtractor.extractVariableField(2);

            const proxyServerSocket = net.createConnection(httpsProxyPort, httpsProxyHost);
            proxyServerSocket.once('connect', () => {
                const hostname = hostnameBuffer.toString();
                log(`forward request to ${hostname}`);

                proxyServerSocket.write(`CONNECT ${hostname}:${HTTPS_PORT} HTTP/1.0${CRLF}`);
                proxyServerSocket.write(CRLF);
                proxyServerSocket.once('data', data => {
                    const response = data.toString();
                    const statusLine = response.split(CRLF)[0];
                    const [/* version */, statusCode] = statusLine.split(' ');
                    if (statusCode !== '200') {
                        console.error(statusLine);
                        clientSocket.end();
                        return;
                    }
                    proxyServerSocket.write(dataBuffer);
                    clientSocket.pipe(proxyServerSocket);
                    proxyServerSocket.pipe(clientSocket);
                });
            });
            proxyServerSocket.on('error', err => {
                log(`Proxy Server Socket error: ${err.message}`);
                console.error(err);
                clientSocket.end();
            });
            clientSocket.on('error', () => {
                proxyServerSocket.end();
            });
        } catch (err) {
            log(`Request error: ${err.message}`);
            console.error(err);
            clientSocket.end();
        }
    });
    clientSocket.on('error', err => {
        log(`Client Socket error: ${err.message}`);
        console.error(err);
    });
});

httpsServer.listen(HTTPS_PORT, '0.0.0.0');
