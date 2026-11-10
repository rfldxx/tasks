export default function appSrc(express, crypto, db_collection, bearer_token, my_login, my_full_name) {
    const app = express();

    app.use(express.static('public'));

    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept,Access-ControlAllow-Headers,Authorization');
        next();
    });

    app.get('/login/', (req, res) => { res.type('text/plain').send(my_login); });
    
    
    // Безопасное сравнение (время сравнения постоянное, а не сразу "прерывается" на первом несовпадении)
    function tokenMatches(provided, expected) {
        const a = Buffer.from(String(provided));
        const b = Buffer.from(String(expected));
        return a.length == b.length && crypto.timingSafeEqual(a, b);
    }
    
    // Все /api/ требуют Authorization: Bearer <токен>; без правильного токена - 401
    app.use('/api', (req, res, next) => {
        const { authorization } = req.headers;
        if( !authorization || !tokenMatches(authorization, `Bearer ${bearer_token}`) ) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        next();
    });

    app.get('/api/author/', (req, res) => { res.json({ login: my_login, fullName: my_full_name }); });




    let FieldValidators = {
        'id'   : (val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val),
        'title': (val) => typeof val === 'string' && val.trim().length >= 1 && val.trim().length <= 200,
        'runId': (val) => typeof val === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(val),
        'done' : (val) => typeof val === 'boolean'
    };

    // Создание функции возвращающей middleware проверку аргументов (по типу express.json())
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

    function extractPublicFields(obj) {
        const extractedFields = ['id', 'ownerLogin', 'title', 'done', 'runId', 'createdAt'];
        const result = {};
        for(const field of extractedFields) result[field] = obj[field];
        return result;
    }




    app.use(express.json());


    function wrapTryCatch(f) {
        return async (req, res) => {
            try {
                await f(req, res);
            } catch (err) {
                res.status(503).json({ error: "Database error" });
            }
        };
    }

    // POST /api/tasks/ JSON: title, runId. Ответ 201 и созданное дело
    app.post('/api/tasks/', CheckFields('body', ['title', 'runId']), wrapTryCatch(async (req, res) => {
        req.body.id         = crypto.randomUUID();
        req.body.ownerLogin = my_login;
        req.body.done       = false;
        req.body.title      = req.body.title.trim();
        req.body.createdAt  = new Date().toISOString();
        await db_collection.insertOne(req.body);
        res.status(201).json(extractPublicFields(req.body));
    }));


    // GET /api/tasks/?runId=... 200; JSON-массив дел автора с этим runId; пустой результат - [].
    app.get('/api/tasks/', CheckFields('query', ['runId']), wrapTryCatch(async (req, res) => {
        const db_result = await db_collection.find(
            { ownerLogin: my_login, runId: req.query.runId }
        ).toArray();

        res.json( db_result.map(extractPublicFields) );
    }));


    // ИЗМЕНЕНИЯ: новый запрос получить все уникальные runId автора
    app.get('/api/tasks/runids/', wrapTryCatch(async (req, res) => {
        const runIds = await db_collection.distinct('runId', { ownerLogin: my_login });
        res.json(runIds);
    }));


    // GET /api/tasks/:id/ 200 и дело; отсутствующее дело - 404.
    app.get('/api/tasks/:id/', CheckFields('params', ['id']), wrapTryCatch(async (req, res) => {
        const task = await db_collection.findOne(
            { id: req.params.id, ownerLogin: my_login }
        );

        if( !task ) return res.status(404).json({ error: "Task not found" });
        res.json( extractPublicFields(task) );
    }));


    // ИЗМЕНЕНИЯ: можно менять и/или поле 'runId'
    // PATCH /api/tasks/:id/ JSON: title и/или done. Ответ 200 и обновленное дело; отсутствующее - 404.
    app.patch('/api/tasks/:id/', CheckFields('params', ['id']), CheckFields('body', [], ['title', 'done', 'runId']), wrapTryCatch(async (req, res) => {
        if( req.body.title !== undefined ) req.body.title = req.body.title.trim();

        const result = await db_collection.findOneAndUpdate(
            { id: req.params.id, ownerLogin: my_login },
            { $set: req.body },
            { returnDocument: 'after' }
        );

        if( !result || !result.value ) return res.status(404).json({ error: "Task not found" });
        res.json( extractPublicFields(result.value) );
    }));


    // DELETE /api/tasks/:id/ 204 без тела; отсутствующее дело - 404
    app.delete('/api/tasks/:id/', CheckFields('params', ['id']), wrapTryCatch(async (req, res) => {
        const result = await db_collection.deleteOne(
            { id: req.params.id, ownerLogin: my_login }
        );
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Task not found" });
        }
        res.status(204).end();
    }));

    
    app.use((err, req, res, next) => {
        if( err.type === 'entity.parse.failed' ) {
            return res.status(400).json({ error: "Invalid JSON format" });
        }
        res.status(500).json({ error: "Internal server error" });
    });

    return app;
}
