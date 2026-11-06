const assert = require('assert');
const net = require('net');
const tls = require('tls');
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

/**
 * Node.js の TLS クライアントが送る ClientHello を取得する
 * @param {string} [servername] Server Name Indication (省略時は SNI 無し)
 * @returns {Promise<Buffer>}
 */
const captureClientHello = servername => new Promise(resolve => {
    const server = net.createServer(socket => {
        socket.once('data', data => {
            socket.destroy();
            server.close();
            resolve(data);
        });
    });
    server.listen(0, '127.0.0.1', () => {
        // host が IP アドレスで servername が無い場合、SNI は送られない
        const tlsSocket = tls.connect({
            host: '127.0.0.1',
            port: server.address().port,
            servername,
        });
        tlsSocket.on('error', () => {});
    });
});

// Buffer をそのまま deepStrictEqual すると差分の出力が膨大になるため、長さと一致のみ報告する
const assertBufferEqual = (actual, expected) => {
    assert.ok(actual.equals(expected), `受信データが一致しない (actual: ${actual.length} bytes, expected: ${expected.length} bytes)`);
};

const CONNECT_ESTABLISHED = `HTTP/1.1 200 Connection established${CRLF}${CRLF}`;

const setup = async (t, {
    proxyAuth = '',
    proxyResponse = CONNECT_ESTABLISHED,
    proxyConnectDelay,
} = {}) => {
    const proxy = await startFakeProxy(t, {
        onRequest: socket => socket.write(proxyResponse),
    });
    const server = await startServer(t, 'https-server', {
        env: {
            https_proxy: `http://${proxyAuth}127.0.0.1:${proxy.port}`,
        },
        proxyConnectDelay,
    });
    const client = await connectClient(t, server.port);
    return {
        proxy,
        client,
    };
};

test('SNI のドメインへの CONNECT をプロキシサーバーへ送り、ClientHello 以降を中継する', async t => {
    const clientHello = await captureClientHello('example.com');
    const {
        proxy,
        client,
    } = await setup(t);

    client.socket.write(clientHello);
    const expected = Buffer.concat([Buffer.from(`CONNECT example.com:443 HTTP/1.0${CRLF}${CRLF}`), clientHello]);
    await waitFor(() => proxy.received().length >= expected.length);
    assertBufferEqual(proxy.received(), expected);

    proxy.sockets[0].write('FROM-SERVER');
    await waitFor(() => client.received().length > 0);
    assert.strictEqual(client.received().toString(), 'FROM-SERVER');
});

test('https_proxy に認証情報があれば Proxy-Authorization ヘッダーを付ける', async t => {
    const clientHello = await captureClientHello('example.com');
    const {
        proxy,
        client,
    } = await setup(t, {
        proxyAuth: 'user:pass@',
    });

    client.socket.write(clientHello);
    await waitFor(() => proxy.received().includes(CRLF + CRLF));

    const requestHeader = proxy.received().subarray(0, proxy.received().indexOf(CRLF + CRLF) + 4).toString();
    assert.strictEqual(requestHeader, [
        'CONNECT example.com:443 HTTP/1.0',
        `Proxy-Authorization: Basic ${Buffer.from('user:pass').toString('base64')}`,
        '',
        '',
    ].join(CRLF));
});

test('SNI が無ければプロキシサーバーへ接続せずにクライアントとの接続を閉じる', async t => {
    const clientHello = await captureClientHello();
    const {
        proxy,
        client,
    } = await setup(t);

    client.socket.write(clientHello);
    await waitFor(() => client.isClosed());

    assert.ok(client.isClosed());
    assert.strictEqual(proxy.sockets.length, 0);
});

test('CONNECT が 200 以外ならクライアントとの接続を閉じ、ClientHello を送らない', async t => {
    const clientHello = await captureClientHello('example.com');
    const {
        proxy,
        client,
    } = await setup(t, {
        proxyResponse: `HTTP/1.1 407 Proxy Authentication Required${CRLF}${CRLF}`,
    });

    client.socket.write(clientHello);
    await waitFor(() => client.isClosed());

    assert.ok(client.isClosed());
    assert.strictEqual(proxy.received().toString(), `CONNECT example.com:443 HTTP/1.0${CRLF}${CRLF}`);
});

test('ClientHello の後のデータが CONNECT 完了前に届いても転送する', {
    todo: 'issue #1',
}, async t => {
    const clientHello = await captureClientHello('example.com');
    const {
        proxy,
        client,
    } = await setup(t, {
        // プロキシサーバーへの接続中に後続データが届くようにする
        proxyConnectDelay: 200,
    });

    client.socket.write(clientHello);
    await sleep(50);
    client.socket.write('AFTER-CLIENT-HELLO');
    const expected = Buffer.concat([Buffer.from(`CONNECT example.com:443 HTTP/1.0${CRLF}${CRLF}`), clientHello, Buffer.from('AFTER-CLIENT-HELLO')]);
    await waitFor(() => proxy.received().length >= expected.length);

    assertBufferEqual(proxy.received(), expected);
});

test('ClientHello が分割して届いても転送する', {
    todo: 'issue #3',
}, async t => {
    const clientHello = await captureClientHello('example.com');
    const {
        proxy,
        client,
    } = await setup(t);

    client.socket.write(clientHello.subarray(0, 10));
    await sleep(50);
    client.socket.write(clientHello.subarray(10));
    const expected = Buffer.concat([Buffer.from(`CONNECT example.com:443 HTTP/1.0${CRLF}${CRLF}`), clientHello]);
    await waitFor(() => proxy.received().length >= expected.length);

    assertBufferEqual(proxy.received(), expected);
});
