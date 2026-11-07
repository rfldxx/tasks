const http = require('http');

const s = http.createServer((req, res) => {
  if( req.url === '/rfldxx' ) {
    res.setHeader('exam', 'Web');
    res.setHeader('Content-Type', 'application/json');

    // гыгыгы, объект, у которого есть поле date с текстовым значением, равным сегодняшней дате в формате YYYY-MM-DD
    res.end("{ \"date\" : \"2026-11-07\"}");
    return;
  }

  res.end('rfldxx');
});

s.listen(process.env.PORT);
