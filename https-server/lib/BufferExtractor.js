class BufferExtractor {
    /**
     *
     * @param {Buffer} buffer
     */
    constructor(buffer) {
        this._buffer = buffer;
    }
    /**
     * @returns {Buffer}
     */
    get remainBuffer() {
        return this._buffer;
    }
    get hasNext() {
        return this.remainBuffer.length > 0;
    }
    /**
     * 先頭 bytes 文字を取り出す（次回は続きから抽出する）
     * @param {number} bytes
     */
    extract(bytes) {
        const value = this.remainBuffer.slice(0, bytes);
        // ※ 型推論させるために getter と _変数を使い分けている
        this._buffer = this.remainBuffer.slice(bytes);
        return value;
    }
    /**
     * @param {number} bytes
     */
    extractAsInt(bytes) {
        return this.extract(bytes).reduce((acc, cur) => acc * 256 + cur);
    }
    /**
     * @param {number} lengthBytes
     */
    extractVariableField(lengthBytes) {
        const length = this.extractAsInt(lengthBytes);
        const value = this.extract(length);
        return {
            length,
            value,
        };
    }
}

module.exports = BufferExtractor;
