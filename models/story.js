/* A model of a story for my database object. */

const mydb = require('../myDatabase/mydb');
const Schema = mydb.Schema;

const storySchema = new Schema({
    title: {
        type: String,
        required: true
    },
    snippet: {
        type: String,
        required: true
    },
    body: {
        type: String,
        required: true
    },
}, { timestamps: true });

// Creates a model object based on the given Scheme above:
const Story = mydb.model('Story', storySchema);
module.exports = Story;