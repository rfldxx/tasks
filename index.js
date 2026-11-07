const http   = require('http'  );
const busboy = require('busboy');

const s = http.createServer((req, res) => {
    if( req.url != '/size2json/' ) {
        res.end('rfldxx');
        return;
    }

    const bb = busboy({ headers: req.headers });
    const chunks = [];

    bb.on('file', (name, file) => {
        file.on('data', (c) => chunks.push(c));
    });

    bb.on('close', () => {
        const buf = Buffer.concat(chunks);
        // readUInt32BE читает UInt32 в big-endian, что соответствует формату PNG. Смещения 16 и 20 — фиксированные для любого валидного PNG.
        let w = buf.readUInt32BE(16);
        let h = buf.readUInt32BE(20);
        res.end(`{"width":${w},"height":${h}}`);
    });

    req.pipe(bb);
});

s.listen(process.env.PORT);
