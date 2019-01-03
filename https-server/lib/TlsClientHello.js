const BufferExtractor = require('./BufferExtractor');

class TlsClientHello {
    /**
     *
     * @param {Buffer} data
     */
    static parse(data) {
        const bufferExtractor = new BufferExtractor(data);
        const tlsContentType = bufferExtractor.extractAsInt(1);
        const tlsProtocolVersion = bufferExtractor.extract(2);
        const {
            length: tlsPlaintextFlagmentLength,
            value: tlsPlaintextFlagment,
        } = bufferExtractor.extractVariableField(2);

        const tlsPlaintextFlagmentExtractor = new BufferExtractor(tlsPlaintextFlagment);
        const handshakeType = tlsPlaintextFlagmentExtractor.extractAsInt(1);
        const {
            length: handshakeBodyLength,
            value: handshakeBody,
        } = tlsPlaintextFlagmentExtractor.extractVariableField(3);

        const handshakeBodyExtractor = new BufferExtractor(handshakeBody);
        const clientProtocolVersion = handshakeBodyExtractor.extract(2);
        const random = handshakeBodyExtractor.extract(32);
        const sessionID = handshakeBodyExtractor.extractVariableField(1);
        const cipherSuites = handshakeBodyExtractor.extractVariableField(2);
        const compressionMethods = handshakeBodyExtractor.extractVariableField(1);
        const {
            length: extensionDataLength,
            value: extensionData,
        } = handshakeBodyExtractor.extractVariableField(2);

        const extensionDataExtractor = new BufferExtractor(extensionData);
        const extensions = [];
        while (extensionDataExtractor.hasNext) {
            const type = extensionDataExtractor.extractAsInt(2);
            const {
                value,
            } = extensionDataExtractor.extractVariableField(2);
            extensions.push({
                type,
                data: value,
            });
        }

        return {
            tlsContentType,
            tlsProtocolVersion,
            tlsPlaintextFlagmentLength,
            tlsPlaintextFlagment: {
                handshakeType,
                handshakeBodyLength,
                handshakeBody: {
                    clientProtocolVersion,
                    random,
                    sessionID,
                    cipherSuites,
                    compressionMethods,
                    extensionDataLength,
                    extensionData: extensions,
                },
            },
        };
    }
}

module.exports = TlsClientHello;
