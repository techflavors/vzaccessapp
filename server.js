const express = require('express')
const HTTP = require('http')
const app = express()

const server = HTTP.createServer(app);

const TokenExchanger = require('./modules/TokenExchanger');

TokenExchanger.init(app);

app.use(express.static('public'));

server.listen(process.env.PORT || 5000, () => console.log('Server Running'))
