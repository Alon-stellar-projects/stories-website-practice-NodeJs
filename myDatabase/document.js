
const crypto = require('crypto');
const Schema = require('./schema');
const DBHandler = require('./dbhandler');

// Error message in case of connection loss:
const notConnectedErrMsg = 'Error: The model isn\'t connected to any database! ' +
    'Please connect by calling \"modelObj.connect_dbFilePath(dbFilePath)\"';

/**
 * This class represents a single document for the database. The document 
 * contains the exact data of a single element in the database, and allows 
 * saving it.
 */
class Document {
    #dbHandler = null;  // Private handler for the database file (DBHandler).
    #saved = false;  // Private boolean to indicate if the document was saved at some point.

    static dataMembersToStr = { "_id": "_id", "_createTime": "createdAt", "_updateTime": "updatedAt" }  // A convinient convertor for toString().

    /**
     * Creates a new Document instance, based on the given parameters, and with a unique ID.
     * @param {object} content - A JSON with the data. Must follow the format of the given schema.
     * The content may include additional data such as "id", which can be used to initialize a 
     * copy of another document.
     * @param {Schema} schema - Sets the format and rules for the database.
     * @param {DBHandler} dbHandler - An object that handles the I/O opperations with the database.
     * @param {any} idSeed - string or number. A unique pattern for the new ID generation.
     */
    constructor(content, schema, dbHandler, idSeed) {
        // Check parameters:
        if (!content || !(typeof content === 'object'))
            throw new Error('Invalid content argument. Must be a JSON.');
        if (!schema || !Schema.is_valid_schema(schema))
            throw new Error('Invalid schema argument. Must be an instance of Schema.');
        if (!dbHandler || !(dbHandler instanceof DBHandler))
            throw new Error('Invalid dbHandler argument. Must be an instance of DBHandler.');
        if (!(typeof (idSeed) === 'string' || typeof (idSeed) === 'number'))
            throw new Error('Invalid idSeed argument. Must be a string or a number.');

        // Set datamembers:
        this._content = {};  // The content, based on the schema.
        this._createTime = null;  // Creation time.
        this._updateTime = null;  // Last update time.
        this._id = '';  // The document's ID.
        this._schema = schema;  // schema.
        this.#dbHandler = dbHandler;  // HAndles the I/O operations with the database.
        try {
            this.#init_doc(content);
            this.#set_options();

        } catch (err) {
            // The given content doesn't match the given schema.
            err.message += "\n\tError occured in Document.constructor(): Failed to create an instance object."
            throw err;
        }

        // Everything is OK. Generates a new ID, unless one was set by the content:
        if (this._id === '') {
            this._id = idSeed.toString() + '-' +
                (+new Date()).toString() + '-' +
                crypto.randomBytes(6).toString('hex');
        }
    }

    /**
     * Returns a document object which represents a reconstruction of an older 
     * object that was created and perhaps saved before. Null if not.
     * @param {object} content - A JSON with the data. Must be a legal one that 
     * also include "_id", "createdAt" and "updatedAt" fields.
     * @param {Schema} schema - Sets the format and rules for the database.
     * @param {DBHandler} dbHandler - An object that handles the I/O opperations with the database.
     * @param {boolean} saved - true if the original document was saved into the database before, false otherwize.
     */
    static reconstruct_doc(content, schema, dbHandler, saved) {
        try {
            // Create a new document from the provided parameters, and then check if it already 
            // has valid "_id" and "createdAt" fields, which indicate that the document is indeed 
            // a reconstruction of an old one.
            // Then set doc.#saved to true.
            const timeCheck = new Date();
            let doc = new Document(content, schema, dbHandler, -1);
            if (doc.id[0] === '-')
                throw new Error('Error in reconstruct_doc(): The provided content doesn\'t include a valid "_id" field.');
            if (doc.createdAt >= timeCheck)
                throw new Error('Error in reconstruct_doc(): The provided content doesn\'t include a valid "createdAt" field.');

            doc.#saved = saved ? true : false  // This document might have been already saved once.
            return doc;
        }
        catch (error) {
            // Illegal document's data or structure was provided.
            console.error(error);
            return null;
        }

    }

    /**
     * Returns the ID of this document.
     */
    get id() {
        return this._id;
    }

    /**
     * Returns the creation time (Date object).
     */
    get createdAt() {
        return this._createTime;
    }

    /**
     * Returns the last update time (Date object).
     */
    get updatedAt() {
        return this._updateTime;
    }

    /**
     * Returns True if a working connection to a database was established. False otherwise.
     */
    is_connected() {
        return this.#dbHandler.is_connected();
    }

    /**
     * Saves this document into the database, as a JSON.
     * Returns a Promise. 
     */
    async save() {
        // Will be caught as a Promise.catch():
        if (!this.#dbHandler.is_connected()) {
            throw new Error(notConnectedErrMsg);
        }

        const docStr = this.toString();
        return new Promise((resolve, reject) => {
            if (this.#saved) {
                // Update: First delete the line with the matchig ID:
                this.#dbHandler.delete_by_match(Document.dataMembersToStr['_id'] + '\":\"' + this._id)
                    .then(() => {
                        // Then save the updated doc:
                        this.#dbHandler.save(docStr)
                            .then((result) => {
                                this.#saved = true;
                                resolve(result);
                            });/*
                            .catch(error => { reject(error); });*/
                    })
                    .catch(error => { reject(error); });
            } else {
                // First save: Simply save:
                this.#dbHandler.save(docStr)
                    .then((result) => {
                        this.#saved = true;  // Next time we update.
                        resolve(result);
                    })
                    .catch(error => { reject(error); });
            }
        });
    }

    /**
     * Updates this document's content with a new given one. If fails, throws an error 
     * and this document remains unchanged.
     * @param {object} newContent - A JSON with the data. Must follow the format of the given schema.
     */
    edit(newContent) {
        try {
            let processedContent = this.#setup_content(newContent);
            this._content = processedContent;
        } catch (error) {
            throw error;
        }
        this._updateTime = new Date();
    }

    /**
     * Returns a string that represents this document.
     */
    toString() {
        // Add the content and the ID:
        let docStr = '{\"' + Document.dataMembersToStr['_id'] + '\":\"' + this._id + '\"' +
            ',' + JSON.stringify(this._content).slice(1, -1);
        // If has a value, add the creating time:
        if (this._createTime !== null)
            docStr += ',\"' + Document.dataMembersToStr['_createTime'] + '\":\"' + this._createTime.toISOString() + '\"';
        // If has a value, add the last update time:
        if (this._updateTime !== null)
            docStr += ',\"' + Document.dataMembersToStr['_updateTime'] + '\":\"' + this._updateTime.toISOString() + '\"';
        // Seal the deal:
        docStr += '}';

        return docStr;
    }

    /**
     * Checks the legality of the given "content" according to this._schema, and if 
     * everything is OK it stores it in this document.
     * @param {object} content - A JSON with the data. Must follow the format of the given schema.
     */
    #init_doc(content) {
        try {
            let newContent = this.#setup_content(content);
            this._content = newContent;
        } catch (error) {
            throw error;
        }

        // Allow filling other properties from the content:
        // ID:
        let idMark = Document.dataMembersToStr['_id'];
        if (idMark in content && typeof (content[idMark] === typeof (this._id)))
            this._id = content[idMark];
        // Creation time:
        let createTMark = Document.dataMembersToStr['_createTime'];
        if (createTMark in content && !isNaN(new Date(content[createTMark])))
            this._createTime = new Date(content[createTMark]);
        // LAst update time:
        let updateTMark = Document.dataMembersToStr['_updateTime'];
        if (updateTMark in content && !isNaN(new Date(content[updateTMark])))
            this._updateTime = new Date(content[updateTMark]);
        else if (this._createTime !== null && this._updateTime === null)  // Set _updateTime to be equals to _createTime
            this._updateTime = new Date(this._createTime);

    }

    /**
     * Setup a content JSON object with the values of the given "content", but while checking 
     * its validity (as dictated by the schema). If succeeded, returns the new copy-content. 
     * If not, throws an error.
     * @param {object} content - A JSON with the data. Must follow the format of the given schema.
     */
    #setup_content(content) {
        let newContent = {};
        const schemaDef = this._schema.definition;
        for (let param in schemaDef) {
            // First we need to verify the legality of "content":
            if (!(param in content)) {
                if (schemaDef[param].required) {
                    // The missing parameter is required -> error!
                    throw new Error(`Missing required parameter \"${param}\" in \"content\"!`);
                } else {
                    // The missing parameter isn't required -> OK! Add with default value.
                    newContent[param] = schemaDef[param].default;
                }
            }
            else if (schemaDef[param].type === Schema.typeX(content[param])) {
                // The parameter is in doc and has the right value type.
                newContent[param] = content[param];
            }
            else {
                // In doc but has an invalid type.
                throw new Error(`Wrong parameter \"${param}\" type in \"content\"!`);
            }
        }

        // Returns only if succeeded!
        return newContent;
    }

    /**
     * Setup the relevan optional parameters from this._schema.options in this 
     * document (s.a "timestamps").
     */
    #set_options() {
        const options = this._schema.options;
        if (options.timestamps === true && this._createTime === null) {
            this._createTime = new Date();
            this._updateTime = this._createTime;
        }
        else if (options.timestamps === false && this._createTime !== null) {
            options.timestamps = true;
        }
    }
}

module.exports = Document;  // Exporting the class.