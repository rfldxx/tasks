const http = require('http');
const { privateDecrypt } = require('crypto');
const busboy = require('busboy');

let s = http.createServer((req, res) => {
    if( req.url != '/decypher' ) {
        res.end('rfldxx');
        return;
    }
    
    let f = { key: [], secret: [] };
    const bb = busboy({ headers: req.headers });

    bb.on('file', (name, file) => {
        file.on('data', (c) =>   f[name].push(c)                    );
        file.on('end',  ( ) => { f[name] = Buffer.concat(f[name]); });
    });

    bb.on('close', () => {
        res.end(privateDecrypt(f.key, f.secret).toString('utf8'));
    });

    req.pipe(bb);
});

s.listen(process.env.PORT);
