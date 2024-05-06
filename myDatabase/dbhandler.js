/**
 * A handler class to deal with I/O opperations with the database, for the Document and Model classes.
 */

const fs = require('fs');
const path = require('path');
const ReadWriteLock = require('rwlock');

// The allowed db file type:
const dbFileExt = '.json';
// An error message for I/O opperations without connection to any database:
const notConnectedErrMsg = 'Error: The database Handler isn\'t connected to any database! ' +
    'Please connect by calling \"connect_dbFilePath(dbFilePath)\"'

// Formating the data:
const SEP = '\r\n';  // USed to mark the separation of elements (docs) in the database file.
const newLine = '\r\n';  // Replace any newLine_encoded string with this after loading.
const newLine_encoded = '<|NEW-LINE|>';  // Replace any newLine string with this before saving.


/**
 * The db-handler class.
 */
class DBHandler {
    #dbFilePath = null;  // Private path for the database file (string).
    #dbRWLock;  // ReadWriteLock. Protect the DB file from race conditions.

    /**
     * Constructor: Creates a disconnected db-handler instance.
     */
    constructor() {
        this.#dbFilePath = null;
        this.#dbRWLock = new ReadWriteLock();
    }

    /**
     * Returns the path to the database file.
     */
    get dbFilePath() {
        return this.#dbFilePath;
    }

    /**
     * Establishes a connection to the given dbFilePath. If the file doesn't exist, create it.
     * Returns a Promise.
     * @param {string} dbFilePath - The path to the database file. Should be a valid R+W .json file.
     */
    async connect_dbFilePath(dbFilePath) {
        this.#dbFilePath = null;
        try {
            const valid = await DBHandler.check_db_file(dbFilePath);
            if (valid) {
                this.#dbFilePath = dbFilePath;
            }
        }
        catch (err) {
            throw err;
        }
    }

    /**
     * Disconnect the db-handler from the database.
     */
    disconnect() {
        if (this.#dbFilePath !== null)
            this.#dbFilePath = null
    }

    /**
     * Returns True if a working connection to a database was established. False otherwise.
     */
    is_connected() {
        if (this.#dbFilePath === null)
            return false;
        return true;
    }

    /**
     * Appends the given "dataStr" to the database. If the database isn't connected or 
     * other error occured, throws an error.
     * Returns a Promise.
     * @param {string} dataStr - The data to be saved.
     */
    async save(dataStr) {
        if (!this.is_connected())
            throw new Error(notConnectedErrMsg + '\n\t Error occured in DBHandler.save()');

        // Check input validity:
        if (typeof (dataStr) !== 'string')
            throw new Error('Error: \"dataStr\" must be a string!');

        // Choose the function that performs the actual reading:
        let writeFunc = {
            'writeFile': (data, startIdx) => this.#save_with_writeFile(data, startIdx),
            'writeStream': (data, startIdx) => this.#save_with_writeStream(data, startIdx)
        }['writeStream'];

        // Invokes and returns its Promise, while aquiring a write lock:
        return new Promise((resolve, reject) => {
            // Aquire a write-lock:
            this.#dbRWLock.writeLock((release) => {
                    fs.stat(this.#dbFilePath, (err, stats) => {
                        if (err) {
                            // Coudn't access the file. Either it doesn't exist or another reason.
                            if (err.code === 'ENOENT')
                                err.message = 'File does not exist: ' + err.message;
                            // Reject with a proper message:
                            err.message = 'Error writing to file: ' + err.message;
                            reject(err);
                        }
                        else {
                            // If we need to truncate the end of the file, prepare the starting 
                            // index and the data to be saved:
                            const [docStr, truncateIdx] = this.#prepare_data_and_truncate(stats, dataStr);
                            const startIdx = stats.size - truncateIdx;

                            // write to the file:
                            writeFunc(docStr, startIdx)
                                .then(() => {
                                    setTimeout(() => {
                                        // For some reason it takes some time for the OS to write the 
                                        // data into the disk, even after all my Promises are resolved. 
                                        // I couldn't find a way to prob the OS or the file to check 
                                        // when it's all finished, except using a small timeout.
                                        resolve(dataStr);
                                    }, 10);
                                })
                                .catch((err) => {
                                    // Error writing. Reject with a proper message:
                                    err.message = 'Error writing to file: ' + err.message;
                                    reject(err);
                                })
                                .finally(function () { release(); });
                        }  // else
                    });  // stat
            });  // writeLock
        });  // Promise
    }  // save

    /**
     * Overwrite the database with the given data in "strArray".
     * Returns a Promise.
     * @param {Array} strArray - An array of strings. The data to be joint and saved
     * into the database.
     */
    overwrite(strArray) {
        if (!this.is_connected())
            throw new Error(notConnectedErrMsg + '\n\t Error occured in DBHandler.erase_db()');

        // Check input validity:
        if (!Array.isArray(strArray) || !(strArray.every(item => typeof item === 'string')))
            throw new Error('Error: \"strArray\" must be an array of strings!');

        // Convert the array of strings into a single string in the right format:
        const dataStr = DBHandler.#prepare_doc_arr_to_str(strArray);

        return new Promise((resolve, reject) => {
            // Aquire a write-lock:
            this.#dbRWLock.writeLock((release) => {
                // Overwrite the entire database file:
                this.#save_with_writeStream(dataStr, 0, 'w')
                    .then(() => {
                        setTimeout(() => {
                            // For some reason it takes some time for the OS to write the 
                            // data into the disk, even after all my Promises are resolved. 
                            // I couldn't find a way to prob the OS or the file to check 
                            // when it's all finished, except using a small timeout.
                            resolve();
                        }, 10);
                    })
                    .catch(err => { reject(err) })
                    .finally(() => { release(); });
            });  // writeLock
        });  // Promise
    }  // overwrite

    /**
     * Reads and returns all the data from the database (as a string). If the database isn't 
     * connected or other error occured, throws an error.
     * Returns a Promise.
     */
    load() {
        return new Promise((resolve, reject) => {
            if (!this.is_connected())
                throw new Error(notConnectedErrMsg + '\n\t Error occured in DBHandler.load()');

            // Choose the function that performs the actual reading:
            let readFunc = {
                'readFile': () => this.#load_with_readFile(),
                'readStream': () => this.#load_with_readStream()
            }['readStream'];

            // Invokes and returns its Promise, while acquiring a read lock:
            //let readResult;
            this.#dbRWLock.readLock((release) => {
                //readResult = readFunc()
                readFunc()
                    .then(dataRead => resolve(DBHandler.#decode_str(dataRead)))
                    .catch(err => reject(err))
                    .finally(function () {
                        release();
                        //readResult = readResult.replaceAll(SEP, '\r\n');
                    });
            });
        });
        //return readResult;
    }

    /**
     * Erase the entire database file by replacing all of its content with an empty string ''.
     * Returns a Promise.
     */
    erase_db() {
        if (!this.is_connected())
            throw new Error(notConnectedErrMsg + '\n\t Error occured in DBHandler.erase_db()');

        return new Promise((resolve, reject) => {
            // Aquire a write-lock:
            this.#dbRWLock.writeLock((release) => {
                // Overwrite the entire database file with empty string:
                fs.writeFile(this.#dbFilePath, '', (err) => {
                    if (err) reject(err);
                    else {
                        setTimeout(() => {
                            // For some reason it takes some time for the OS to write the 
                            // data into the disk, even after all my Promises are resolved. 
                            // I couldn't find a way to prob the OS or the file to check 
                            // when it's all finished, except using a small timeout.
                            resolve();
                        }, 10);
                    }
                    release();
                });  // writeFile
            });  // writeLock
        });  // Promise
    }  // erase_db

    /**
     * Delete a specific lines from the database that contain a matching part with 
     * the given "pattern". If the database isn't connected or other error occured, 
     * throws an error.
     * Returns a Promise.
     * @param {string} pattern - The string pattern that if a line matches to it, we delete it.
     */
    delete_by_match(pattern) {
        return new Promise((resolve, reject) => {
            if (!this.is_connected()) {
                reject(new Error(notConnectedErrMsg + '\n\t Error occured in DBHandler.delete_by_match()'));
                return;
            }
            if (pattern === '') {
                reject(new Error(`Error in DBHandler.delete_by_match(): \"pattern\" must be a non-empty string but received \'\' instead.`));
                return;
            }
            if (!pattern || typeof (pattern) !== 'string') {
                reject(new Error(`Error in DBHandler.delete_by_match(): \"pattern\" must be a string but received instead ${typeof (pattern)}.`));
                return;
            }

            pattern = pattern.replaceAll(newLine, newLine_encoded);
            // Read data from the file as a stream:
            let docStrArray = [];
            let buffer = '';  // Buffer to store partial docs.
            const regex = new RegExp(',' + SEP + '|' + SEP);  // Split lines either by ,SEP or by SEP.

            // Aquire a write-lock:
            this.#dbRWLock.writeLock((release) => {
                //const readStream = fs.createReadStream(this.#dbFilePath, { encoding: 'utf8', highWaterMark: 1 });  // With max chunck size limit (highWaterMark), for testing.
                const readStream = fs.createReadStream(this.#dbFilePath, { encoding: 'utf8' });

                // Read the data from the file, filter out matching lines and store the result:
                readStream.on('data', chunk => {
                    // Append the chunk to the buffer
                    buffer += chunk;
                    // Split the chunk into lines and stack them in an array:
                    const lines = buffer.split(regex);
                    for (let i = 0; i < lines.length - 1; ++i) {
                        const line = lines[i];
                        // Filter out empty or matching lines:
                        if (line !== '' && line !== '[' && line !== ']' && !line.includes(pattern)) {
                            // Add the line without the ending ',' to the array:
                            if (line[line.length - 1] === ',')
                                docStrArray.push(line.slice(0, -1));
                            else
                                docStrArray.push(line);
                        }
                    }
                    // Store the partial JSON object in the buffer
                    buffer = lines[lines.length - 1];
                });

                // Upon end of reading, save the data using write-stream:
                readStream.on('end', () => {
                    const dataToSaveStr = DBHandler.#prepare_doc_arr_to_str(docStrArray);
                    // Overwrite the entire database file:
                    this.#save_with_writeStream(dataToSaveStr, 0, 'w')
                        .then(() => {
                            setTimeout(() => {
                                // For some reason it takes some time for the OS to write the 
                                // data into the disk, even after all my Promises are resolved. 
                                // I couldn't find a way to prob the OS or the file to check 
                                // when it's all finished, except using a small timeout.
                                resolve();
                            }, 10);
                        })
                        .catch(error => {
                            error.message += '\nError in DBHandler.delete_by_match().';
                            reject(error)
                        })
                        .finally(() => { release(); });
                });

                readStream.on('error', err => {
                    reject(new Error('Error in DBHandler.delete_by_match(): Failed reading from file. ' + err));
                });  // readStream.on
            });  // writeLock
        });  // Promise
    }  // delete_by_match

    /**
     * Deep copy: Returns a new DBHandler object, which is an exact copy of the given one.
     * @param {DBHandler} oldHandler - The object we want to copy.
     */
    static copy(oldHandler) {
        if (!oldHandler || !(oldHandler instanceof DBHandler))
            return null;

        let newHandler = new DBHandler();
        newHandler.#dbFilePath = oldHandler.#dbFilePath;
        return newHandler;
    }

    /**
     * Checks the validity of the given database file. Creates it if it doesn't exist.
     * Returns a Promise. True if the db-file is valid, throws an error otherwise.
     * * Currently it fails to test the file permissions.
     * @param {string} dbFilePath - The path to the database file. Should be a valid R+W .json file.
     */
    static check_db_file(dbFilePath) {
        return new Promise((resolve, reject) => {
                // Check if dbFilePath is a JSON file:
                if (!dbFilePath || typeof (dbFilePath) !== 'string' || path.extname(dbFilePath) !== dbFileExt) {
                    reject(new Error('Invalid file type. File must be a .json file: ' + dbFilePath));
                    return;
                }

                // Check the validity of the file: Does it exist? Is it a file? Permissions?...
                fs.stat(dbFilePath, (err, stats) => {
                    if (err) {
                        // Coudn't access the file. Check why.

                        if (err.code === 'ENOENT') {
                            // File doesn't exist, create it:
                            fs.writeFile(dbFilePath, '', { mode: 0o666 }, (wf_error) => {  // Read+Write permissions
                                if (wf_error) {
                                    reject(new Error(`Error while creating a file: ${wf_error.message}`));
                                } else {
                                    resolve(true);
                                    return;  // There isn't any more code anyway, but it's clearer this way.
                                }
                            });
                        }
                        else {
                            // Other errors. reject with an Error:
                            reject(new Error(`Error accessing file: ${err.message}`));
                        }
                    }  // if (err)
                    else {
                        if (!stats.isFile()) {
                            // It's not a file.
                            reject(new Error('Path is not a file: ' + dbFilePath));
                        }
                        else if ((stats.mode & fs.constants.F_OK) &&  // Visible to the calling process.
                            (stats.mode & fs.constants.W_OK) &&  // Writable.
                            (stats.mode & fs.constants.R_OK) != 0) {  // Readable.
                            // Not the right permissions:
                            reject(new Error('File is invisible or doesn\'t have  R+W permissions: ' + dbFilePath));
                        }
                        else {
                            // A valid file:
                            resolve(true);
                        }
                    }  // else (no err)
                });  // fs.stat
        });  // new Promise
    }  // check_db_file function

    /**
     * Saves the given "data" to the database at the "startIdx" index, in one chunck using 
     * fs.writeFile().
     * Returns a Promise.
     * @param {string} data - The data to be saved.
     * @param {number} startIdx - The index in the database file from which the data will 
     * saved (overriding previous data if presents).
     */
    async #save_with_writeFile(data, startIdx) {
        fs.open(this.#dbFilePath, 'r+', (err, fd) => {
            if (err) throw err;

            // If we need to truncate the last ']', move the file pointer to the right location:
            fs.ftruncate(fd, startIdx, (err) => {
                if (err) throw err;

                // Append the doc string to the file at once.
                fs.writeFile(this.#dbFilePath, data, { flag: 'a' }, (err) => {
                    if (err) throw err;
                });  // writeFile
            });  // ftruncate
        });  // open
    }

    /**
     * Saves the given "data" to the database at the "startIdx" index, in a stream of 
     * chuncks using fs.writeStream.
     * Returns a Promise.
     * @param {any} data - The data to be saved.
     * @param {any} startIdx - The index in the database file from which the data will
     * saved (overriding previous data if presents).
     */
    async #save_with_writeStream(data, startIdx, flag = 'r+') {
        //const writeStream = fs.createWriteStream(this.#dbFilePath, { flags: 'r+', start: startIdx, highWaterMark: 1 });  // With max chunck size limit (highWaterMark), for testing.
        const writeStream = fs.createWriteStream(this.#dbFilePath, { flags: flag, start: startIdx });
        // Write the doc string to the file as a stream.
        writeStream.write(data, 'utf8', err => {
            if (err) {
                throw err;
            } else {
                // End the stream and resolve the Promise
                writeStream.end();
            }
        });

        // Handle errors during writing
        writeStream.on('error', err => {
            throw err;
        });
    }

    /**
     * Depending on the content of the database file (estimated by "fStats"), returns 
     * modifications to "data" and the index from which to start writting it.
     * The goal is to maintain a legal .json format, with an array of JSONs.
     * @param {fs.stat} fStats - The retured object from fs.stat() for the db-file.
     * @param {string} data - The base-data to be saved. To it additional 
     * modifications may apply (s.a SEP + ']'...)
     */
    #prepare_data_and_truncate(fStats, data) {
        data = data.replaceAll(newLine, newLine_encoded);
        let truncateIdx = 1;  // How much to truncate from the end of the file before writing new data.

        if (fStats.size === 0) {
            // Empty file.
            data = '[' + SEP + data + SEP + ']';
            truncateIdx = 0;
        } else if (fStats.size === 2) {
            // Only "[]" in the file.
            data = SEP + data + SEP + ']';
            truncateIdx = 1;
        } else if (fStats.size <= 2 + SEP.length) {
            // Only "[SEP]" in the file.
            data = data + SEP + ']';
            truncateIdx = 1;
        } else {
            // File already has data "[SEP{}SEP]" or more.
            data = ',' + SEP + data + SEP + ']';
            truncateIdx = 3;
        }

        return [data, truncateIdx];
    }

    /**
     * Reads all the content from the database, in one chunck using fs.readFile().
     * Returns it as a string of array of JSONs: '[jObj1, jObj2, ...]'
     * Returns a Promise.
     */
    #load_with_readFile() {
        // Read data from the file at once:
        return new Promise((resolve, reject) => {
            fs.readFile(this.#dbFilePath, (err, data) => {
                if (err) {
                    reject(new Error('Error reading from file: ' + err));
                }
                else {
                    let dataStr = data.toString();
                    if (dataStr === '')
                        dataStr = '[]';
                    resolve(dataStr);
                }
            });
        });
    }

    /**
     * Reads all the content from the database, in in a stream of chunck using fs.readStream.
     * Returns it as a string of array of JSONs: '[jObj1, jObj2, ...]'
     * Returns a Promise.
     * Must follow the saving format: Each JSON or square braket (][) must be in one line, 
     * with new lines seperating between them.
     * */
    #load_with_readStream() {
        return new Promise((resolve, reject) => {
            // Read data from the file as a stream:
            let buffer = '';  // Buffer to store partial docs.
            //const readStream = fs.createReadStream(this.#dbFilePath, { encoding: 'utf8', highWaterMark: 10 });  // With max chunck size limit (highWaterMark), for testing.
            const readStream = fs.createReadStream(this.#dbFilePath, { encoding: 'utf8' });

            readStream.on('data', chunk => { buffer += chunk; });  // Append the chunk to the buffer
            readStream.on('end', () => {
                if (buffer === '')
                    buffer = '[]';
                resolve(buffer);
            });
            readStream.on('error', err => {
                reject(new Error('Error reading from file: ' + err));
            });
        });
    }

    /**
     * Gets an array of strings and returns a single joint string, in the format 
     * to be written into the database.
     * @param {Array} strArray - An array of strings. The data to be joint and prepared.
     */
    static #prepare_doc_arr_to_str(strArray) {
        strArray = strArray.map((str) => { return str.replaceAll(newLine, newLine_encoded); });
        let dataStr = strArray.join(',' + SEP);
        if (dataStr.length > 0)
            dataStr = '[' + SEP + dataStr + SEP + ']';
        return dataStr;
    }

    /**
     * Gets a data string and returns it after decoding SEP and newLine_encoded, 
     * such that it can be read properly by a user.
     * @param {string} data - The given encoded string.
     */
    static #decode_str(data) {
        data = data.replaceAll(SEP, '');  // Remove SEP.
        data = data.replaceAll(newLine_encoded, newLine);  // Decode the encoded new lines.
        return data;
    }
}

module.exports = DBHandler;  // Exporting the class.
