'use strict';

const express = require('express');


// Constants
const PORT = process.env.PORT || "8082";
const HOST = process.env.HOST || "0.0.0.0";
const VERSION = process.env.VERSION || "0.0";

// App
const app = express();
app.get('/', (req, res) => {
  res.send('Hello cdCon 2021! \nVERSION '+VERSION);
});

app.listen(PORT, HOST);
console.log('Running on http://%s:%s',HOST,PORT);