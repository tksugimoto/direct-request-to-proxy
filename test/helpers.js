const net = require('net');
const path = require('path');
const {
    spawn,
} = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DELAY_PROXY_CONNECT_SCRIPT = path.join(__dirname, 'fixtures', 'delay-proxy-connect.js');

const CRLF = '\r\n';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * predicate が true になるまで待つ (timeout を過ぎたら諦める。判定は呼び出し側の assert で行う)
 * @param {() => boolean} predicate
 */
const waitFor = async (predicate, timeout = 2000) => {
    const start = Date.now();
    while (!predicate() && Date.now() - start < timeout) {
        await sleep(10);
    }
};

const getFreePort = () => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
        const {
            port,
        } = server.address();
        server.close(() => resolve(port));
    });
});

const canConnect = port => new Promise(resolve => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
        socket.destroy();
        resolve(true);
    });
    socket.once('error', () => resolve(false));
});

/**
 * 偽のプロキシサーバーを起動する
 * 受信したデータをすべて記録し、最初のリクエストヘッダーを受信し終えたら onRequest を呼ぶ
 * @param {import('node:test').TestContext} t
 * @param {{ onRequest?: (socket: net.Socket) => void }} options
 */
const startFakeProxy = async (t, {
    onRequest = () => {},
} = {}) => {
    const sockets = [];
    let received = Buffer.alloc(0);
    const server = net.createServer(socket => {
        sockets.push(socket);
        let requestHeaderReceived = false;
        socket.on('data', data => {
            received = Buffer.concat([received, data]);
            if (!requestHeaderReceived && received.includes(CRLF + CRLF)) {
                requestHeaderReceived = true;
                onRequest(socket);
            }
        });
        socket.on('error', () => {});
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
        sockets.forEach(socket => socket.destroy());
        server.close();
    });
    return {
        port: server.address().port,
        sockets,
        received: () => received,
    };
};

/**
 * http-server / https-server を子プロセスとして起動する
 * @param {import('node:test').TestContext} t
 * @param {string} serverDir 'http-server' or 'https-server'
 * @param {{ env?: object, proxyConnectDelay?: number }} options
 */
const startServer = async (t, serverDir, {
    env = {},
    proxyConnectDelay,
} = {}) => {
    const port = await getFreePort();
    const nodeArgs = proxyConnectDelay ? ['-r', DELAY_PROXY_CONNECT_SCRIPT] : [];
    let output = '';
    const serverProcess = spawn(process.execPath, [...nodeArgs, path.join(ROOT_DIR, serverDir, 'index.js')], {
        env: {
            ...process.env,
            ...env,
            LISTEN_PORT: String(port),
            PROXY_CONNECT_DELAY_MS: String(proxyConnectDelay || 0),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout.on('data', data => output += data);
    serverProcess.stderr.on('data', data => output += data);
    t.after(() => serverProcess.kill());

    const start = Date.now();
    while (!await canConnect(port)) {
        if (serverProcess.exitCode !== null || Date.now() - start > 5000) {
            throw new Error(`${serverDir} の起動に失敗しました${CRLF}${output}`);
        }
        await sleep(20);
    }
    return {
        port,
    };
};

/**
 * サーバーに接続するクライアント
 * @param {import('node:test').TestContext} t
 * @param {number} port
 */
const connectClient = async (t, port) => {
    const socket = net.connect(port, '127.0.0.1');
    // 細切れに送ったデータがまとめられないようにする
    socket.setNoDelay(true);
    let received = Buffer.alloc(0);
    let closed = false;
    socket.on('data', data => received = Buffer.concat([received, data]));
    socket.on('close', () => closed = true);
    socket.on('error', () => {});
    t.after(() => socket.destroy());
    await new Promise(resolve => socket.once('connect', resolve));
    return {
        socket,
        received: () => received,
        isClosed: () => closed,
    };
};

module.exports = {
    CRLF,
    sleep,
    waitFor,
    startFakeProxy,
    startServer,
    connectClient,
};
