/* This is the main server for a "EPIC STORIES" website. It's based on 
 * a Blog tutorial for nodeJs I watched on "Net Ninja" YouTube channel. */

const express = require('express');
const morgan = require('morgan');
const mydb = require('./myDatabase/mydb');
const storyRoutes = require('./routes/storyRouts');

let port = 3000;

//express app:
const app = express();

// Connet to mydb:
const dbURI = './data/Stories.json';
mydb.connect(dbURI)
    .then((result) => {
        // Listen to requests:
        app.listen(port);  // if no hostname is given, it automatically listens to localhost. Also returns a server object, but it's not needed here.
    })
    .catch(err => console.error(err));

// register view engine:
app.set('view engine', 'ejs');  // Default lookup folder: ./views/
// app.set('views', 'myviews'); // Setup a new lookup folder (not needed here since we use the default ./views/).

// Middlewares to use:

// Allow the client to access files inside ./public/ folder, such as img or JS. Files inside ./public/ are accessed by html files as if they're in the ./views/ folder:
app.use(express.static('public'));
// A better logger:
app.use(morgan('dev'));  // 'dev' is a format for the output. There's also 'tiny' and others.
// Parses data from incoming URL requests into an object, whose fields matches the names from the request's body:
app.use(express.urlencoded({ extended: true }));

// Log the request:
app.use((req, res, next) => {
    console.log('A new request made:');
    console.log(`hostname: ${req.hostname}`);
    console.log(`path: ${req.path}`);
    console.log(`method: ${req.method}`);
    console.log();
    next();  // Tells the server to continue to the next functions (down bellow).
});

/* After a response is sent via one of the following methods (get, use), it 
* ends the process and waits for a new request, without continuing to the 
* next ones. */

// home page:
app.get('/', (req, res) => {
    res.redirect('/stories');
});

// about page:
app.get('/about', (req, res) => {
    res.render('about', { title: 'About' });
});

// story routes:
app.use('/stories', storyRoutes);

// redirect:
app.get('/about-us', (req, res) => {
    res.redirect('/about');
});

// 404 page:
app.use((req, res) => {
    res.status(404).render('404', { title: '404' });
});
