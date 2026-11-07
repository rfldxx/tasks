export default function appSrc(express, crypto, db_collection) {
    const app = express();

    const LOGIN = 'rfldxx';
    const FULL_NAME = '...';

    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept,Access-ControlAllow-Headers');
        next();
    });


    app.get('/login/', (req, res) => { res.type('text/plain').send(LOGIN); });
    
    
    // Безопасное сравнение (время сравнения постоянное, а не сразу "прерывается" на первом несовпадении)
    function tokenMatches(provided, expected) {
        const a = Buffer.from(String(provided));
        const b = Buffer.from(String(expected));
        return a.length == b.length && crypto.timingSafeEqual(a, b);
    }
    
    
    // Все /api/ требуют Authorization: Bearer <токен>; без правильного токена - 401
    app.use('/api', (req, res, next) => {
        const { authorization } = req.headers;
        if( !authorization || !tokenMatches(authorization, `Bearer ${process.env.BEARER_TOKEN}`) ) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        next();
    });

    app.get('/api/author/', (req, res) => { res.json({ login: LOGIN, fullName: FULL_NAME }); });




    let FieldValidators = {
        'id'   : (val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val),
        'title': (val) => typeof val === 'string' && val.trim().length >= 1 && val.trim().length <= 200,
        'runId': (val) => typeof val === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(val),
        'done' : (val) => typeof val === 'boolean'
    };


    // делаем функцию возвращающую middleware (по типу express.json())
    // топовая функция получилась!
    function CheckFields(property, requiredFields = [], allowedFields = requiredFields, validators = FieldValidators) {
        // allowedFields должно содержать в себе requiredFields
        return (req, res, next) => {
            let obj = req[property];

            // Отсекаем лишнее, потому что express.json() "пропускает" (считает корректными): отсутствие тела, строку, число, массив.
            if( !obj || typeof obj !== 'object' || Array.isArray(obj) ) {
                return res.status(400).json({ error: `req.${property} must be a object.` });
            }

            const receivedFields = Object.keys(obj);

            if( !receivedFields.length ) {
                return res.status(400).json({ error: `Empty req.${property} forbidden.` });
            }

            if( requiredFields.some( field => !receivedFields.includes(field) ) ) {
                return res.status(400).json({ error: `req.${property} Required fields: [${requiredFields.join(', ')}].` });
            }

            if( receivedFields.some( field => !allowedFields.includes(field) ) ) {
                return res.status(400).json({ error: `req.${property} Allowed fields: [${allowedFields.join(', ')}].` });
            }

            let invalidField = receivedFields.find( field => validators[field] && !validators[field](obj[field]) );
            if( invalidField !== undefined ) {
                return res.status(400).json({ error: `Invalid value for field: req.${property}.${invalidField }.` });
            }

            next();
        }
    }


    app.use(express.json());

    // POST /api/tasks/ JSON: title, runId. Ответ 201 и созданное дело
    app.post('/api/tasks/', CheckFields('body', ['title', 'runId']), async (req, res) => {
        req.body.id = crypto.randomUUID();
        req.body.ownerLogin = LOGIN;
        req.body.done = false;
        req.body.title = req.body.title.trim();
        req.body.createdAt = new Date().toISOString();
        try {
            await db_collection.insertOne(req.body);
            res.status(201).json(req.body);
        } catch (e) {
            res.status(503).json({ error: "Database error" });
        }
    });


    // GET /api/tasks/?runId=... 200; JSON-массив дел автора с этим runId; пустой результат - [].
    app.get('/api/tasks/', CheckFields('query', ['runId']), async (req, res) => {

    });

    // GET /api/tasks/:id/ 200 и дело; отсутствующее дело - 404.
    app.get('/api/tasks/:id/', CheckFields('params', ['id']), async (req, res) => {

    });

    // PATCH /api/tasks/:id/ JSON: title и/или done. Ответ 200 и обновленное дело; отсутствующее - 404.
    app.patch('/api/tasks/:id/', CheckFields('body', [], ['title', 'done']), CheckFields('params', ['id']), async (req, res) => {

    });

    // DELETE /api/tasks/:id/ 204 без тела; отсутствующее дело - 404
    app.delete('/api/tasks/:id/', CheckFields('params', ['id']), async (req, res) => {

    });

   
    app.use((err, req, res, next) => {
        if( err.type === 'entity.parse.failed' ) {
            return res.status(400).json({ error: "Invalid JSON format" });
        }
        res.status(500).json({ error: "Internal server error" });
    });

    return app;
}
