/**
 * "mydb" library is a simpler version of "mongoose", which allows you to handle noSQL databases.
 * The API follows mostly the API of mongoose, and it allows a user to create a "Model" object 
 * that interacts with the database.
 * Before the creation of a new database and its models, use "mydb.connect()" to connect to the 
 * database (the db file is created if not exists) and then call "mydb.model()" to create a model.
 * Alternatively, you can first create a model and then pass it into "mydb.connect(model)".
 */

const Schema = require('./schema');
const DBHandler = require('./dbhandler');
const Model = require('./model');


let dbHandler = null;  // A handler that shall be connected to the db and will be sent to each model.
let lastModel = null;  // Will hold the last model that was created, to make "connect()" work smoothly.


/**
 * Creates a new Model object that interacts with the database. The model isn't connected, 
 * unless "mydb.connect()" was called before. If not, you can call it later and pass this 
 * model to it.
 * @param {Schema} schema - The Schema object that sets the rules for the database.
 */
model = function (nameDB, schema) {
    // Check that "schema" is a valid Schem object:
    if (!Schema.is_valid_schema(schema)) {
        throw new Error("The schema parameter passed isn't a valid \"Schema\" object.");
    }

    let newModel;
    try {
        if (dbHandler && dbHandler instanceof DBHandler) {
            newModel = new Model(Schema.copy(schema), DBHandler.copy(dbHandler));
        } else {
            newModel = new Model(Schema.copy(schema));
        }
    } catch (err) {
        err.message += "\n\tError occured in myDatabase.model()";
        throw err;
    }

    lastModel = newModel;
    return newModel;
}


/**
 * Creates a new Model object that interacts with the database. The model is connected 
 * to the db file given by "nameDB", if valid. You could either establish a connection 
 * beforehand by calling "mydb.connect()" and pass here the same "nameDB", or just pass 
 * here a new one.
 * Asynchronous function that returns a Promise.
 * @param {string} nameDB - The path to the database file. Should be a valid R+W .json file.
 * @param {Schema} schema - The Schema object that sets the format and rules for the database.
 */
/*model = async function (nameDB, schema) {
    // Check that "schema" is a valid Schem object:
    if (!Schema.is_valid_schema(schema)) {
        throw new Error("The schema parameter passed isn't a valid \"Schema\" object.");
    }
    // Check that "nameDB" is a string:
    if (typeof (nameDB) != 'string')
        throw new Error("Expecting \"nameDB\" parameter to be a string, but a different type was passed.");

    let newModel;
    try {
        if (dbHandler && dbHandler instanceof DBHandler && dbHandler.dbFilePath === nameDB) {
            newModel = new Model(Schema.copy(schema), DBHandler.copy(dbHandler));
        } else {
            newModel = new Model(Schema.copy(schema));
            await newModel.connect_dbFilePath(nameDB);
        }
    } catch (err) {
        err.message += "\n\tError occured in myDatabase.model()";
        throw err;
    }

    return newModel;
}*/


/**
 * Establishes a connection to an external database server. If a Model object was 
 * provided, only it will be connected. If no model was provided, then "lastModel" 
 * will be connected (if exists) plus after running it, any call for "mydb.model()" 
 * with the same dbURI will create a new model that's connected to the same database.
 * If the database doesn't exist, create it.
 * Asynchronous function that returns a Promise.
 * @param {string} dbURI - The path to the database server, including the necessary 
 * credentials (such as username and password).
 * @param {object} options - A JSON with additional parameters.
 * @param {Model} model - An optional Model object, if we want to connect it specifically.
 */
connect = function (dbURI, options, model) {
    return new Promise((resolve, reject) => {
        if (!model || !(model instanceof Model)) {
            // No "model" was provided: Establish a connection for all future models.
            dbHandler = new DBHandler();
            dbHandler.connect_dbFilePath(dbURI)
                .then(function () {
                    if (lastModel !== null)
                        lastModel.dbHandler = dbHandler;
                    resolve();
                })
                .catch(err => {
                    dbHandler = null;
                    reject(err);
                });
        } else {
            // A valid model was provided: Connect it.
            model.connect_dbFilePath(dbURI)
                .then(function () { resolve(); })
                .catch(err => {
                    reject(err);
                });
        }
    });
}

/**
 * Disconnect the given model (if provided) from the database or reset any future 
 * models (if a model not provided), untill "mydb.connect()" is called again.
 */
disconnect = function (model) {
    if (model && model instanceof Model) {
        model.disconnect();
    }
    else if (!model) {
        dbHandler = null;
        if (lastModel !== null) {
            lastModel.disconnect();
        }
    }
}


// Export the functions
module.exports = {
    model: model,
    connect: connect,
    disconnect: disconnect,
    Schema: Schema
};
