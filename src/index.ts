const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors')
const request = require('request');
const axios = require('axios');

const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

require('dotenv').config();


io.set('origins', '*:*');

let port = process.env.PORT || 7000;

app.use(express.static('views'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors())
http.listen(port);

console.log(`===============================`)
console.log(`SagiPinas Code API ${port}`)
console.log(`===============================`)

app.get("/", (req, res) => {
  res.send("routes are working properly")
})

