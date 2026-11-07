export default function appSrc(express, bodyParser, createReadStream, crypto, http) {
    const app = express();

    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,OPTIONS,DELETE');
        next();
    });

    app.get('/code/', (req, res) => {
        createReadStream(import.meta.url.substring(7)).pipe(res);
    });

    app.get('/sha1/:input/', (req, res) => {
        res.send(crypto.createHash('sha1').update(req.params.input).digest('hex'));
    });

    function buffer_reader(call_on_end) {
        return (req, res) => {
            let buffer = '';
            console.log('[buffer_reader] start, url=', req.url);
            req.on('data', (c) => { buffer += c; });
            req.on('end', () => {
                console.log('[buffer_reader] end, buffer length=', buffer.length);
                call_on_end(req, res, buffer);
            });
            req.on('error', (e) => {
                console.log('[buffer_reader] req error:', e.message);
            });
        };
    }

    app.all('/req/', buffer_reader(
        (req1, res1, buffer1) => {
            const addr = req1.query.addr || decodeURIComponent(buffer1.slice(5));
            console.log('[/req/] addr =', addr);

            let upstreamReq;
            try {
                upstreamReq = http.get(addr, buffer_reader(
                    (req2, res2, buffer2) => {
                        console.log('[/req/] upstream done, body length =', buffer2.length);
                        console.log('[/req/] upstream body preview =', buffer2.slice(0, 200));
                        res1.send(buffer2);
                    }
                ));
            } catch (e) {
                console.log('[/req/] http.get THREW:', e.message);
                res1.status(502).send('http.get threw: ' + e.message);
                return;
            }

            upstreamReq.on('error', (e) => {
                console.log('[/req/] http.get ERROR event:', e.message);
                res1.status(502).send('upstream error: ' + e.message);
            });

            upstreamReq.on('timeout', () => {
                console.log('[/req/] http.get TIMEOUT');
                upstreamReq.destroy();
                res1.status(504).send('upstream timeout');
            });
        }
    ));

    function my_default(req, res) { res.send('rfldxx'); }
    app.get('/login/', my_default);
    app.all('*', my_default);

    return app;
}
