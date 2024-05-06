/* A controller for the app, which contains the functions that should be 
 * executed after different requests are made. */

const Story = require('../models/story');

/**
 * Renders the stories/index.ejs page, with all the stories, sorted from the 
 * newest (ontop) to the oldest, by their creation time.
 */
const story_index = (req, res) => {
    Story.find()
        .then((result) => {
            // express sets the header and status code automatically, so no need for: res.setHeader('content-Type', 'text/html'); or res.statusCode = 200;
            res.render('stories/index', {
                title: 'All Stories',
                stories: result.sort(function (d1, d2) {
                    return (new Date(d2.createdAt) - new Date(d1.createdAt));
                })
            });
        })
        .catch((err) => {
            console.error(err);
        });
}

/**
 * Renders the stories/create.ejs page, with the form for posting a new story.
 */
const story_create_get = (req, res) => {
    res.render('stories/create', { title: 'Create a Story' });
}

/**
 * Saves a story to the database, given as a POST request. According to the inner 
 * _method the function either saves it as a new story or updates an existing one.
 */
const story_post = (req, res) => {
    let formData = req.body;  // req.body only exists thanks to express.urlencoded().
    const id = formData._id;

    // Filter out hidden fields, and remain only with the form's content:
    const allowed = Object.keys(formData).filter(key => !key.startsWith('_'));
    const content = allowed.reduce((obj, key) => {
        obj[key] = formData[key];
        return obj;
    }, {})

    // Either we save a new post or update an existing one:
    switch (formData._method) {
        case 'POST':
            story_create_post(content, res);
            break;
        case 'PUT':
            story_edit_post(content, id, res);
            break;
        default:
            break;
    }
}

/**
 * Creates a new story with the given content and save it to the database.
 * @param {object} content - The content of the story.
 * @param {object} res - An "express" response object for handling the result.
 */
const story_create_post = (content, res) => {
    const story = Story.new_document(content);
    story.save()
        .then((result) => { res.redirect('/stories'); })
        .catch((err) => { console.error(err); });
}

/**
 * Loads an existing Story object from the database, with the given "id", and 
 * updates it with the given new content.
 * @param {object} newContent - The new content of the story.
 * @param {any} id - String or Array of strings of the ID(s).
 * @param {object} res - An "express" response object for handling the result.
 */
const story_edit_post = (newContent, id, res) => {
    Story.findById(id, { asDocument: true })  // Find and load the story with the matching id:
        .then((result) => {
            if (result.length === 0)
                res.status(404).render('404', { title: 'Story not found' });
            else {
                let story = result[0];
                story.edit(newContent);  // Edit the story with the new content.
                story.save()  // Update the database with the new version of the story.
                    .then((result) => { res.redirect('/stories'); });
            }
        })
        .catch((err) => { console.error(err); });
}

/**
 * Renders a page with the full requested story.
 */
const story_details = (req, res) => {
    const id = req.params.id;  // The id of the requested story.
    Story.findById(id)
        .then((result) => {
            if (result.length === 0)
                res.status(404).render('404', { title: 'Story not found' });
            else
                res.render('stories/details', { story: result[0], title: 'Story Details' });
        })
        .catch((err) => {
            console.error(err);
        });
}

/**
 * Deletes the requested story from the database.
 */
const story_delete = (req, res) => {
    const id = req.params.id;  // The id of the requested story.
    Story.findByIdAndDelete(id)
        .then((result) => {
            res.json({ redirect: '/stories' });
        })
        .catch((err) => { console.error(err); });
}

/**
 * Renders the stories/edit.ejs page with the form for editing an existing story.
 */
const story_edit_get = (req, res) => {
    const id = req.params.id;

    Story.findById(id)
        .then((result) => {
            if (result.length === 0)
                res.status(404).render('404', { title: 'Story not found' });
            else
                res.render('stories/edit', { title: 'Edit a Story', story: result[0] });
        })
        .catch((err) => {
            console.error(err);
        });
}

// Export the controller functions:
module.exports = {
    story_index,
    story_create_get,
    story_post,
    story_details,
    story_delete,
    story_edit_get
}