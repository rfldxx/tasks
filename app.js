export default function appSrc(express, bodyParser, createReadStream, crypto, http) {
    // будем вкуривать ошибку
    const app = express();

    app.use((req, res, next) => {
        // 1. Строго по заданию
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,OPTIONS,DELETE');
        
        // 2. Разрешаем кастомные заголовки (например, ngrok-skip-browser-warning)
        res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*');
        
        // 3. ВАЖНО: Никакого Access-Control-Allow-Credentials! Иначе браузер блокирует "*"

        // 4. Запрещаем Layero кэшировать ответ, чтобы стереть старые ошибки из CDN
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // 5. Отвечаем на preflight-запрос
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }
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
            req.on('data', (c) => { buffer += c; });
            req.on('end' , ( ) => {
                call_on_end(req, res, buffer);
            });
        }
    }

    app.all('/req/', buffer_reader(
        (req1, res1, buffer1) => {
            const addr = req1.query.addr || decodeURIComponent(buffer1.slice(5));
            try {
                http.get(addr, buffer_reader(
                    (req2, res2, buffer2) => {
                        res1.send(buffer2);
                    }
                )).on('error', (e) => {
                    res1.status(502).send('upstream error');
                });
            } catch (e) {
                res1.status(502).send('invalid url');
            }
        }
    ));

    app.get('/login/', (req, res) => {
        res.type('text/plain').send('rfldxx');
    });
    
    app.all('*', (req, res) => {
        res.type('text/plain').send('rfldxx');
    });

    return app;
}
