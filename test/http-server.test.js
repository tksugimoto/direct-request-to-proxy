const assert = require('assert');
const {
    test,
} = require('node:test');
const {
    CRLF,
    sleep,
    waitFor,
    startFakeProxy,
    startServer,
    connectClient,
} = require('./helpers');

const setup = async (t, {
    proxyAuth = '',
    proxyConnectDelay,
} = {}) => {
    const proxy = await startFakeProxy(t, {
        onRequest: socket => socket.write(`HTTP/1.1 200 OK${CRLF}Content-Length: 2${CRLF}${CRLF}OK`),
    });
    const server = await startServer(t, 'http-server', {
        env: {
            http_proxy: `http://${proxyAuth}127.0.0.1:${proxy.port}`,
        },
        proxyConnectDelay,
    });
    const client = await connectClient(t, server.port);
    return {
        proxy,
        client,
    };
};

test('Host ヘッダーのドメインで絶対 URL にしたリクエストをプロキシサーバーへ転送し、レスポンスをクライアントへ返す', async t => {
    const {
        proxy,
        client,
    } = await setup(t);

    client.socket.write(`GET /path?q=1 HTTP/1.1${CRLF}Host: example.com${CRLF}${CRLF}`);
    await waitFor(() => client.received().toString().endsWith('OK'));

    assert.strictEqual(proxy.received().toString(), `GET http://example.com/path?q=1 HTTP/1.1${CRLF}Host: example.com${CRLF}${CRLF}`);
    assert.strictEqual(client.received().toString(), `HTTP/1.1 200 OK${CRLF}Content-Length: 2${CRLF}${CRLF}OK`);
});

test('http_proxy に認証情報があれば Proxy-Authorization ヘッダーを付ける', async t => {
    const {
        proxy,
        client,
    } = await setup(t, {
        proxyAuth: 'user:pass@',
    });

    client.socket.write(`GET / HTTP/1.1${CRLF}Host: example.com${CRLF}${CRLF}`);
    await waitFor(() => proxy.received().includes(CRLF + CRLF));

    assert.strictEqual(proxy.received().toString(), [
        'GET http://example.com/ HTTP/1.1',
        `Proxy-Authorization: Basic ${Buffer.from('user:pass').toString('base64')}`,
        'Host: example.com',
        '',
        '',
    ].join(CRLF));
});

test('Host ヘッダーが無ければプロキシサーバーへ接続せずにクライアントとの接続を閉じる', async t => {
    const {
        proxy,
        client,
    } = await setup(t);

    client.socket.write(`GET / HTTP/1.0${CRLF}${CRLF}`);
    await waitFor(() => client.isClosed());

    assert.ok(client.isClosed());
    assert.strictEqual(proxy.sockets.length, 0);
});

test('リクエストヘッダーとリクエストボディが分割して届いてもボディを転送する', {
    todo: 'issue #1',
}, async t => {
    const {
        proxy,
        client,
    } = await setup(t, {
        // プロキシサーバーへの接続中にボディが届くようにする
        proxyConnectDelay: 200,
    });

    client.socket.write(`POST /submit HTTP/1.1${CRLF}Host: example.com${CRLF}Content-Length: 5${CRLF}${CRLF}`);
    await sleep(50);
    client.socket.write('HELLO');
    await waitFor(() => proxy.received().toString().endsWith('HELLO'));

    assert.strictEqual(proxy.received().toString(), `POST http://example.com/submit HTTP/1.1${CRLF}Host: example.com${CRLF}Content-Length: 5${CRLF}${CRLF}HELLO`);
});

test('Host ヘッダーが最初のペイロードに含まれていなくても転送する', {
    todo: 'issue #3',
}, async t => {
    const {
        proxy,
        client,
    } = await setup(t);

    client.socket.write(`GET / HTTP/1.1${CRLF}`);
    await sleep(50);
    client.socket.write(`Host: example.com${CRLF}${CRLF}`);
    await waitFor(() => proxy.received().includes(CRLF + CRLF));

    assert.strictEqual(proxy.received().toString(), `GET http://example.com/ HTTP/1.1${CRLF}Host: example.com${CRLF}${CRLF}`);
});
