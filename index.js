const http = require('http');

const s = http.createServer(async (req, res) => {
    let my_text = 'rfldxx';

    if( req.url.slice(0, 4) == '/id/' ) {
        const response =  await fetch('https://nd.kodaktor.ru/users/' + req.url.slice(4));
        my_text        = (await response.json()).login;
    }

    res.end(my_text);
});

s.listen(process.env.PORT);
