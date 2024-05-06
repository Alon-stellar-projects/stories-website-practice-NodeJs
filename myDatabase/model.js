
const ReadWriteLock = require('rwlock');
const Schema = require('./schema');
const DBHandler = require('./dbhandler');
const Document = require('./document');

// Error message in case of connection loss:
const notConnectedErrMsg = 'Error: The model isn\'t connected to any database! ' + 
    'Please connect by calling \"modelObj.connect_dbFilePath(dbFilePath)\"';

/**
 * This class follows mostly the "mongoose" API "Model" class, to allow a user 
 * to interact with a noSQL database. The class allows the user to read items 
 * from it, create new documents that can be saved into it and more.
 */
class Model {
    #dbHandler = null;  // Private handler for the database file (DBHandler).
    #schema = null;  // Private schema object (Schema).
    #countDocs = 0;  // A unique ID. Check if its still unique among different appearances of Model.
    #countDocsLock;  // ReadWriteLock. Protect the #countDocs from race conditions upon creating new docs.

    /**
     * Creates a new instance of a Model object. The new model isn't connected initialy.
     * You can probide a DBHandler dbHandler object, which may or maynot be connected.
     * @param {Schema} schema - The Schema object that sets the rules for the database.
     * @param {DBHandler} dbHandler - A handler object to a specific database.
     */
    constructor(schema, dbHandler = null) {
        if (!Schema.is_valid_schema(schema))
            throw new Error('Error! \"schema\" must be a valid instance object of Schema.');
        if (dbHandler && dbHandler instanceof DBHandler)
            this.#dbHandler = dbHandler;
        else
            this.#dbHandler = new DBHandler();
        
        this.#schema = schema;
        this.#countDocsLock = new ReadWriteLock();
    }

    /**
     * Returns a new Document object with the given content, which can be saved into the database.
     * @param {object} content - A JSON with the data. Must follow the format of the given schema.
     * The content may include additional data such as "id", which can be used to initialize a
     * copy of another document.
     */
    new_document(content) {
        // Creating a new instance of Document with a ReadWriteLock lock, 
        // so each instance have a unique "countDocs" value for its ID:
        let doc;
        try {
            this.#countDocsLock.writeLock((release) => {
                try {
                    doc = new Document(content, this.#schema, this.#dbHandler, this.#countDocs++);
                } catch (err) {
                    throw err;
                } finally {
                    release(); // Release the lock.
                }
            });
        } catch (err) {
            throw err;
        }

        return doc;
    }

    /**
     * Set the model's database handler to the given one.
     * @param {DBHandler} handler - A handler object to a specific database.
     */
    set dbHandler(handler) {
        if (handler && handler instanceof DBHandler)
            this.#dbHandler = handler;
    }

    /**
     * Returns the number of Document objects created by this model so far.
     */
    get countDocs() {
        return this.#countDocs;
    }

    /**
     * Returns the path to the database.
     */
    get dbFilePath() {
        return this.#dbHandler.dbFilePath;
    }

    /**
     * Returns the model's schema.
     */
    get schema() {
        return this.#schema;
    }

    /**
     * Returns True if a working connection to a database was established. False otherwise.
     */
    is_connected() {
        return this.#dbHandler.is_connected();
    }

    /**
     * Establishes a connection from this model to the given dbFilePath. If the file doesn't
     * exist, create it.
     * Returns a Promise.
     * @param {string} dbFilePath - The path to the database file. Should be a valid R+W .json file.
     */
    async connect_dbFilePath(dbFilePath) {
        return this.#dbHandler.connect_dbFilePath(dbFilePath);
    }

    /**
     * Disconnect this model from the database.
     */
    disconnect() {
        if (this.#dbHandler.is_connected())
            this.#dbHandler.disconnect()
    }

    /**
     * Returns all the odcuments stored in the database, as an array of JSONs.
     * Returns a Promise.
     */
    find() {
        return new Promise((resolve, reject) => {
            // Verify that we're connected:
            if (!this.#dbHandler.is_connected()) {
                reject(new Error(notConnectedErrMsg));
                return;
            }

            // Read:
            this.#dbHandler.load()
                .then(docStr => {
                    resolve(JSON.parse(docStr));
                })
                .catch(error => { reject(error); });
        });
    }

    /**
     * Returns a specific element(s) (document(s)) from the database, with the given id 
     * (String - for 1 doc, or array of strings - for several). The elements are returned 
     * as a JSON(s) or (if options.asDocument === true) as a reconstructed Document object(s). 
     * If not found, returns an empty array.
     * Returns a Promise.
     * @param {any} id - The ID (string) or an array of IDs (array of strings), of the 
     * specific document(s) we want to read.
     * @param {object} options - Additional options for the function:
     * options.asDocument: If true, convert the elements into Document objects.
     */
    findById(id, options = { asDocument: false }) {
        return new Promise((resolve, reject) => {
            // Verify that we're connected:
            if (!this.#dbHandler.is_connected()) {
                reject(new Error(notConnectedErrMsg));
                return;
            }
            // Check that id is valid:
            if (!(typeof (id) === 'string' || (Array.isArray(id) && id.every(item => typeof item === 'string')))) {
                reject(new Error(`Error: id must be a string or array of strings, but \"${typeof (id)}\" was passed.`));
                return;
            }

            // Read and extract:
            this.find()
                .then(docArray => {
                    let filteredDocArray = this.#include_docs_array_by_ids(docArray, id);
                    if (options.asDocument === true) {
                        // Return as Document object(s), otherwize return as a JSON(s):
                        filteredDocArray = filteredDocArray.map((doc) => {
                            return Document.reconstruct_doc(doc, this.schema, this.#dbHandler, true);
                        });
                    }
                    resolve(filteredDocArray);
                })
                .catch((err) => {
                    err.message += "\n\tError occured in Model.findById().";
                    reject(err);
                });
        });
    }

    /**
     * Deletes a specific element(s) (document(s)) from the database, with the given id
     * (String - for 1 doc, or array of strings - for several). The elements are returned
     * as a JSON(s) or (if options.asDocument === true) as a reconstructed Document object(s).
     * If not found, returns an empty array.
     * Returns a Promise.
     * @param {any} id - The ID (string) or an array of IDs (array of strings), of the
     * specific document(s) we want to delete.
     * @param {object} options - Additional options for the function:
     * options.asDocument: If true, convert the elements into Document objects.
     */
    findByIdAndDelete(id, options = { asDocument: false }) {
        return new Promise((resolve, reject) => {
            // Verify that we're connected:
            if (!this.#dbHandler.is_connected()) {
                reject(new Error(notConnectedErrMsg));
                return;
            }
            // Check that id is valid:
            if (!(typeof (id) === 'string' || (Array.isArray(id) && id.every(item => typeof item === 'string')))) {
                reject(new Error(`Error: id must be a string or array of strings, but \"${typeof (id)}\" was passed.`));
                return;
            }

            // Read all the documents from the database, filter out those that match 
            // the given "id", and overwrite the database with the remainings:
            this.find()
                .then(docArray => {
                    const strArr = this.#exclude_docs_array_by_ids(docArray, id).map(docJson => JSON.stringify(docJson));
                    // Overwrite the db-file with the filtered documents, and return the 
                    // deleted ones with the resolving:
                    this.#dbHandler.overwrite(strArr)
                        .then(() => {
                            let filteredDocArray = this.#include_docs_array_by_ids(docArray, id);
                            if (options.asDocument === true) {
                                // Return as Document object(s), otherwize return as a JSON(s):
                                filteredDocArray = filteredDocArray.map((doc) => {
                                    return Document.reconstruct_doc(doc, this.schema, this.#dbHandler, false);
                                });
                            }
                            resolve(filteredDocArray);
                        });/*
                        .catch(error => {
                            error.message += "\n\tError occured in Model.delete().";
                            reject(error);
                        });*/
                })
                .catch((err) => {
                    err.message += "\n\tError occured in Model.delete().";
                    reject(err);
                });
        });
    }

    /**
     * Delete the entire database by replacing all of its content with an empty string ''.
     * Returns a Promise.
     */
    delete_all() {
        return new Promise((resolve, reject) => {
            // Verify that we're connected:
            if (!this.#dbHandler.is_connected()) {
                reject(new Error(notConnectedErrMsg));
                return;
            }

            // Erase the file:
            this.#dbHandler.erase_db()
                .then(() => { resolve(); })
                .catch(error => {
                    error.message += "\n\tError occured in Model.delete_all().";
                    reject(error);
                });
        });
    }

    /**
     * Delete the entire database by replacing all of its content with an empty string ''.
     * Returns its content from before the deletion.
     * Returns a Promise.
     */
    pop_all() {
        return new Promise((resolve, reject) => {
            // Verify that we're connected:
            if (!this.#dbHandler.is_connected()) {
                reject(new Error(notConnectedErrMsg));
                return;
            }

            // Read all the data so we can return it:
            this.find()
                .then(docArray => {
                    // Erase the file:
                    this.#dbHandler.erase_db()
                        .then(() => { resolve(docArray); });/*
                        .catch(error => {
                            error.message += "\n\tError occured in Model.pop_all().";
                            reject(error);
                        });*/
                })
                .catch((err) => {
                    err.message += "\n\tError occured in Model.pop_all().";
                    reject(err);
                });
        });
    }

    /**
     * Gets an array of Documents as JSONs and an ID or list of IDs, and returns a 
     * subarray of document(s) with the matching ID(S).
     * @param {any} docArray
     * @param {any} ids - The ID (string) or an array of IDs (array of strings), of the
     * specific element(s) we want to get.
     */
    #include_docs_array_by_ids(docArray, ids) {
        const idSymb = Document.dataMembersToStr['_id'];
        // If ids is not an array, convert it into an array.
        if (!Array.isArray(ids)) {
            ids = [ids];
        }
        // Filter the objects array based on the provided ids.
        return docArray.filter(doc => {
            // Skip objects without "id" member and return only those with.
            if (!Object.hasOwn(doc, idSymb))
                return false;
            return ids.includes(doc[idSymb]);
        });
    }

    /**
     * Gets an array of Documents as JSONs and an ID or list of IDs, and returns a 
     * subarray of document(s) without the matching ID(S).
     * @param {any} docArray
     * @param {any} ids - The ID (string) or an array of IDs (array of strings), of the
     * specific element(s) we want to filter out.
     */
    #exclude_docs_array_by_ids(docArray, ids) {
        const idSymb = Document.dataMembersToStr['_id'];
        // If ids is not an array, convert it into an array.
        if (!Array.isArray(ids)) {
            ids = [ids];
        }
        // Filter the objects array based on the provided ids.
        return docArray.filter(doc => {
            // Skip objects without "id" member and return only those with.
            if (!Object.hasOwn(doc, idSymb))
                return false;
            return !ids.includes(doc[idSymb]);
        });
    }
}

module.exports = Model;  // Exporting the class.
