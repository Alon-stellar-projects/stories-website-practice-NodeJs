/* A router for all the requests that start with "/stories". It connects 
 * them to the control functions that take the exact action for each 
 * request. */

const express = require('express');
const storyController = require('../controllers/storyController');

const router = express.Router();

// stories page:
router.get('/', storyController.story_index);

// create-story page:
router.get('/create', storyController.story_create_get);

// Saves a new story or updates an existing one, and redirect to /stories:
router.post('/', storyController.story_post);

// Edit a story page:
router.get('/edit/:id', storyController.story_edit_get);

// Show a single story details page:
router.get('/:id', storyController.story_details);

// Delete a single story and redirect to /stories:
router.delete('/:id', storyController.story_delete);

// Export the router:
module.exports = router;