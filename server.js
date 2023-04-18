const express = require('express');
require('dotenv').config();
const app = express();
const pool = require('./db');
// require('./knex');
const cors = require('cors');
const bodyParser = require('body-parser');

app.use(cors());


app.use(express.json({extended:false}))


app.use('/users',require('./routes/user'));
app.use('/unusers',require('./routes/unuser'));
app.use('/posts',require('./routes/post'));
app.use('/search',require('./routes/search'));
app.use('/recruiter',require('./routes/recruiter'));


const PORT = process.env.PORT || 4000;

app.listen(PORT, ()=> console.log('Server run on port 4000'))