// テスト用: node -r で読み込み、プロキシサーバーへの接続完了(connect イベント)を
// PROXY_CONNECT_DELAY_MS ミリ秒遅らせる (遠くにあるプロキシサーバーを再現する)
const net = require('net');

const delay = Number(process.env.PROXY_CONNECT_DELAY_MS);
const originalCreateConnection = net.createConnection;

net.createConnection = (...args) => {
    const socket = originalCreateConnection(...args);
    const originalEmit = socket.emit;
    socket.emit = function (eventName, ...eventArgs) {
        if (eventName === 'connect') {
            setTimeout(() => originalEmit.call(this, eventName, ...eventArgs), delay);
            return true;
        }
        return originalEmit.call(this, eventName, ...eventArgs);
    };
    return socket;
};
