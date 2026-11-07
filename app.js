export default function appSrc(express, bodyParser, createReadStream, crypto, http, MongoClient) {
    const app = express();

    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,OPTIONS,DELETE');

        // вся проблема была в этой строчке?
        res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*');

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
            
            http.get(addr, buffer_reader(
                (req2, res2, buffer2) => {
                    res1.send(buffer2);
                }
            ));

        }
    ));


    app.post('/insert/', bodyParser.urlencoded({ extended: true }), async (req, res) => {
        const { login, password, URL } = req.body;

        let client = await MongoClient.connect(URL);
        const collection = client.db().collection('users');
        await collection.insertOne({ login, password });
        await client.close();

        res.send('ok');
    });

    function my_default(req, res) { res.send('rfldxx'); }
    app.get('/login/', my_default);
    app.all('*',       my_default);

    return app;
}
