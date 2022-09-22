const express = require('express')
const HTTP = require('http')
const bodyParser = require('body-parser');
const app = express()

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const server = HTTP.createServer(app);

const TokenExchanger = require('./modules/TokenExchanger');

TokenExchanger.init(app);

app.use(express.static('public'));

server.listen(process.env.PORT || 5000, () => console.log('Server Running'))
