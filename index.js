const http = require('http');

const s = http.createServer((req, res) => {
  res.setHeader('X-Author', 'rfldxx');
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end('rfldxx');
});

s.listen(process.env.PORT);
