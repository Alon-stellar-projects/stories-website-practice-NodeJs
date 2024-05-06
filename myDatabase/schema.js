/** 
 *  Schema: A class whose constructor gets as parameters: ({ param: {type: X, required: T/F, default: X0}, {...}, ... }, { timestamps: T/F, other-options: X, ...}) 
 * */

/**
 * The Schema class is a simplyfied version of the "mongousDB" Schema. It allows you 
 * to create rules for our noSQL database, with various structures for the objects that 
 * should be stored in the DB.
 * With the API you can create schemas with the format: 
 * { parameter_1: { type: <type>, required: <T/F>, default: <default value> }, 
 *   parameter_2: { type: <type>, required: <T/F>, default: <default value> }, 
 *   ... }
 *   Only the "type" property must be specified when defining each parameter.
 *   * The type of the "default" property must match the type specified in "type".
 *   * In order to get all the allowed properties, their default values and which 
 *   one is a must-have, use "get_parameter_properties()" function.
 *   * In order to get the supported types for the "type" property, and the default 
 *   value for the "default" property per each type, use the 
 *   "get_allowed_types_and_default_values()" function.
 */
class Schema {
    /* Sets the default parameter values for the "options" argument. */
    static #defaultOptions = {
        'timestamps': false
    };

    /* Will hold the optional parameters of the Schema instance object. */
    #options = {};

    /* Returns all the suported types for "type" parameter's property, and their default values.  */
    static #allowedTypesAndDefaultsVals() {
        return {
            "string": "",
            "number": 0,
            "boolean": false,
            "object": {},
            "String": new String(''),
            "Number": new Number(0),
            "Boolean": new Boolean(false),
            //"Object": {},  // We don't support Object so there won't be a confusion if type = 'Object' & default = {} (which gives "object" type). We also don't support other classes, s.a Person, so it's not "right" to support Object.
            "Date": new Date(0),
            "Array": [],
        };
    }

    /**
     * Returns a map of the properties of a schema parameter, with their default value 
     * and whether or not they must be specified by the user.
     * The returned object is of the format: 
     * { property_1: {defaultValue: <default value>, must: <T/F>}, property_2: {...}, ... }
     * The default values of some of the properties may depend on the exact, actual 
     * value (not default value) of other properties. Such is the case with the "default" 
     * property, which represents the default argument for an entire Schema parameter, and 
     * whose default value is determind only after we know the exact, final value of the 
     * "type" property (0 for 'number', '' for string etc). In those cases, instead of a 
     * <default value> (which we cannot be determined yet) there's an object with the 
     * format: { map: <value_map_by_property>, property: <property> }.
     * The map gives all the allowed options, depending on the final value of the property 
     * specified by <property>.
     * 
     * For example, the function may return the following:
     * result = {
     *   "type": { defaultValue: "object", must: true },
     *   "required": { defaultValue: false, must: false },
     *   "default": { defaultValue: { map: value_map_by_property, property: "type" }, must: false }
     * }
     * Then, for each schema parameter, once you know the final value for "type" property, 
     * you can run:
     * const prop = result.default.defaultValue.property;
     * const defaultDefaultValue = result.default.defaultValue.map[parameter[prop]];
     */
    static #get_default_val_by_param_property() {
        return {
            "type": { defaultValue: "object", must: true },
            "required": { defaultValue: false, must: false },
            // The default value for the "default" property depends on the "type":
            "default": {
                defaultValue: { map: Schema.#allowedTypesAndDefaultsVals(), property: "type" },
                must: false
            }
        };
    }

    /**
     * Schema constructor. Receives a "definition" object that defines the schema's
     * structure, and additional "options" object, and returns a new Schema
     * instance.
     * Throws an error if illegal format or types are provided.
     * @param {object} definition - Defines the schema structure. The format is: 
     * { parameter_1: { type: <type>, required: <T/F>, default: <default value> }, 
     *   parameter_2: {...}, ...}
     * @param {object} options - Additional options of the format:
     * { timestamps: <T/F> (stamps the time of object creation from the schema)}.
     * Unknown optional parameters that are provided will be ignored, and known 
     * ones with wrong values types will cause an error.
     * Check get_optional_parameters_and_default_values() to get all the optional 
     * parameters and their default values.
     */
    constructor(definition, options) {
        // Sets the "definition" data member:
        this._definition = this.#set_definition(definition);
        if (this._definition === null) {
            throw new Error('Error: Invalid format for the \"definition\" argument.');
        }

        // Sets the "options" data members according to the received parameter and the default values:
        try {
            this.set_options(options);
        } catch (err) {
            throw err;
        }
    }

    /**
     * Returns the timestamps
     */
    get_timestamps() {
        return this.#options.timestamps;
    }

    /**
     * Returns a JSON copy of all the optional parameters.
     */
    get options() {
        return structuredClone(this.#options);
    }

    /**
     * Gets a copy of the object's definition, with the format:
     * { 
     *   parameter_1: { type: <type>, required: <T/F>, default: <default value> },
     *   parameter_2: { type: <type>, required: <T/F>, default: <default value> },
     *   ... 
     * }
     */
    get definition() {
        // Return a copy and not a reference to the original object's definition.
        return structuredClone(this._definition);
    }

    /**
     * Returns a string of the type of x, including our supported types.
     * @param {any} x - A variable whose type we want to check.
     */
    static typeX(x) {
        let typ = typeof (x);
        if (typ === 'object' && x.constructor.name !== 'Object')
            typ = x.constructor.name;
        return typ;
    }

    /**
     * Returns a JSON listing all the optional Schema parameters and their default values.
     * */
    static get_optional_parameters_and_default_values() {
        return structuredClone(Schema.#defaultOptions);
    }

    /**
     * Returns a JSON describing all the supported data types for a Schema definition's 
     * parameters (keys), and their default values (values).
     */
    static get_allowed_types_and_default_values() {
        return Schema.#allowedTypesAndDefaultsVals();
    }

    /**
     * Returns an array of the properties of a schema parameter.
     * i.e: ["type", "required", "default"]
     */
    static get_allowed_parameter_properties_names_lst() {
        return Object.keys(Schema.#get_default_val_by_param_property());
    }

    /**
     * Returns a map of the properties of a schema parameter, with their default value
     * and whether or not they must be specified by the user.
     * The returned object is of the format:
     * { property_1: {defaultValue: <default value>, must: <T/F>}, property_2: {...}, ... }
     * The default values of some of the properties may depend on the exact, actual
     * value (not default value) of other properties. Such is the case with the "default"
     * property, which represents the default argument for an entire Schema parameter, and
     * whose default value is determind only after we know the exact, final value of the
     * "type" property (0 for 'number', '' for string etc). In those cases, instead of a
     * <default value> (which we cannot be determined yet) there's an object with the
     * format: { map: <value_map_by_property>, property: <property> }.
     * The map gives all the allowed options, depending on the final value of the property
     * specified by <property>.
     *
     * For example, the function may return the following:
     * result = {
     *   "type": { defaultValue: "object", must: true },
     *   "required": { defaultValue: false, must: false },
     *   "default": { defaultValue: { map: value_map_by_property, property: "type" }, must: false }
     * }
     * Then, for each schema parameter, once you know the final value for "type" property,
     * you can run:
     * const prop = result.default.defaultValue.property;
     * const defaultDefaultValue = result.default.defaultValue.map[parameter[prop]];
     */
    static get_parameter_properties() {
        return Schema.#get_default_val_by_param_property();
    }

    /**
     * Returns true if the given "schemaObj" is a valid Schema object, false if not.
     * @param {Schema} schemaObj - A Schema class instance object.
     */
    static is_valid_schema(schemaObj) {
        if (!(schemaObj instanceof Schema)) {
            return false;
        }
        // Check for valid data members:
        const schemaOpt = schemaObj.options;
        const schemaDef = schemaObj.definition;
        if (typeof (schemaOpt) != 'object' || typeof (schemaDef) != 'object' || Object.keys(schemaDef).length == 0) {
            return false;
        }
        // Scan all the parameters in "schemaDef" and check the validity of their properties:
        for (let param in schemaDef) {
            // Check if the param's value (its properties) is of the right format:
            if (!Schema.#is_valid_definition_param_format(schemaDef[param])) {
                return false;
            }
        }
        // Scan all the optional parameters in "schemaOpt" and check their validity:
        for (let optParam in schemaOpt) {
            if (Schema.typeX(schemaOpt[optParam]) !== Schema.typeX(Schema.#defaultOptions[optParam])) {
                return false;
            }
        }

        return true;
    }

    /**
     * Returns an exact (deep) copy of the given Schema object by "original".
     * If the "original" isn't a valid instance of Schema, throws an error.
     * @param {Schema} original - A valid Schema object.
     */
    static copy(original) {
        if (!(original instanceof Schema))
            throw new Error("Error in Schema.copy(): Parameter isn\'t \"Schema\".");

        // Create a new Schema object and set its properties to match "original":
        let newSchema;
        try {
            newSchema = new Schema(original.definition);  // Deep copy the definition's properties.
            newSchema.set_options(original.options);  // Deep copy the other properties ("options").
        } catch (err) {
            err.message += '\n\tError occured in Schema.copy().';
            throw err;
        }

        return newSchema;
    }

    /**
     * Returns the default value of a given property of a Schema parameter.
     * For example:
     * For def_param = { type: "object", required: true, default: {price: 0} }
     * For property = "required" the function will always return false, 
     * regardless of def_param.
     * But for property = "default" the function will return {}. 
     * Here if def_param.type is "sting", then the returned value for 
     * property = "default" will be ''.
     * @param {any} def_param - A Schema parameter of the format 
     * { type: <type>, required: <T/F>, default: <default value> }.
     * It's relevant only if the property's default value depends on the final 
     * values of other properties in the parameter.
     * @param {any} property - The property whose default value is to be returned 
     * ('type', 'required', 'default', etc...).
     */
    #get_default_property_val(def_param, property) {
        let defaultPropVal = Schema.#get_default_val_by_param_property()[property]['defaultValue'];
        if (typeof (defaultPropVal) === 'object' && Object.hasOwn(defaultPropVal, 'map') && Object.hasOwn(defaultPropVal, 'property')) {
            defaultPropVal = defaultPropVal.map[def_param[defaultPropVal.property]];
        }
        return defaultPropVal;
    }

    /**
     * Sets the object's optional parameters according to the user provided "options" 
     * argument, or the default values (as appear in get_optional_parameters_and_default_values()).
     * If "options" contain parameters that aren't in get_optional_parameters_and_default_values(), 
     * they're ignored. If it contains parameters that are in get_optional_parameters_and_default_values(), 
     * but their values are of the wrong types, an error is thrown.
     * @param {JSON} options - JSON of the format { optional_param_1: value, optional_param_2: ... }
     */
    set_options(options) {
        let newOpts = {};  // Will hold the new values. If no errors, will be added to "this" at the end.
        for (let opt in Schema.#defaultOptions) {
            if (!options) {
                // options is null or undefined.
                newOpts[opt] = Schema.#defaultOptions[opt];
            } else if (Object.hasOwn(options, opt) && Schema.typeX(options[opt]) !== Schema.typeX(Schema.#defaultOptions[opt])) {
                // The property exists in "options" but has a wrong type.
                throw new Error(`Error: Invalid format for the \"options\" argument. Expecting \"options.${opt}\" ` +
                    `to be a \"${Schema.typeX(Schema.#defaultOptions[opt])}\", but \"${Schema.typeX(options[opt])}\" was detected.`);
            } else if (Object.hasOwn(options, opt)) {
                // The property exists in "options" and has the right type.
                // Adding the property to this as a data member.
                if (typeof (options[opt] === 'object'))
                    newOpts[opt] = structuredClone(options[opt]);
                else
                    newOpts[opt] = options[opt];
            } else {
                // The property doesn't exist in "options". Add it as a data member with a default value.
                newOpts[opt] = Schema.#defaultOptions[opt];
            }
        }

        Object.assign(this.#options, newOpts);  // Add/override all the options fields in "newOpts" into "this.#options".
        this.#options = newOpts;
    }

    /**
     * Preprocessing of a parameter of a given Schema definition and its value. If the given "defParamVal" 
     * is an object, it returns a shallow copy after processing it.
     * The function also converts type values of [Function <class>] into their string name ("<class>").
     * @param {any} defParamVal - The value of definition[parameter] of a schema.
     */
    static #preprocess_definition_parameter(defParamVal) {
        if (typeof (defParamVal) != 'object') {
            return defParamVal;
        }

        let processedParam = { ...defParamVal };  // Shallow copy.
        if (Object.hasOwn(processedParam, 'type') && typeof (processedParam['type']) === 'function') {
            processedParam['type'] = processedParam['type'].name;
            // Convert String -> string, Number -> number:
            if (processedParam['type'] === 'String') processedParam['type'] = 'string';
            if (processedParam['type'] === 'Number') processedParam['type'] = 'number';
        }

        return processedParam;
    }

    /**
     * 
     * A private function that sets the definition of the schema, using the given definition from the user.
     * @param {JSON} definition
     */
    #set_definition(definition) {
        // Check for s non JSON or empty object:
        if (!definition || typeof (definition) != 'object' || Object.keys(definition).length == 0)
            return null;

        // Scan all the parameters in "definition", check the validity of their properties, 
        // and if everything is OK, setup the schema with "new_definition" with values:
        let new_definition = {};
        let allowedParameterPropertiesLst = Schema.get_allowed_parameter_properties_names_lst();
        for (let param in definition) {
            let defParamVal =  Schema.#preprocess_definition_parameter(definition[param]);  // definition[param];
            // Check if the param's value (its properties) is of the right format:
            if (!Schema.#is_valid_definition_param_format(defParamVal))
                return null;

            // Valid. Add the parameter to the schema, with relevant values:
            new_definition[param] = {}
            let property;
            for (let i in allowedParameterPropertiesLst) {
                // If the param in the given "definition" (schema structure) has a value for 
                // the "property", use that.Otherwise use default values for each property:
                property = allowedParameterPropertiesLst[i];
                if (Object.hasOwn(defParamVal, property)) {
                    if (typeof (defParamVal[property]) !== 'object')
                        new_definition[param][property] = defParamVal[property];
                    else
                        new_definition[param][property] = structuredClone(defParamVal[property]);  // Deep copy a nested object.
                } else {
                    new_definition[param][property] = this.#get_default_property_val(new_definition[param], property);
                }
            }
        }

        return new_definition;
    }

    /**
     * Returns true if the given "valObj" is a legal Schema parameter. Meaning it has 
     * the right format. Returns false if not.
     * @param {any} valObj - A Schema parameter. Should follow the format:
     * { type: <type>, required: <T/F>, default: <default value> }
     * Where <type> is from the allowed types and <default value>'s type matches <type>.
     */
    static #is_valid_definition_param_format(valObj) {
        // Must be a JSON:
        if (typeof (valObj) != 'object')
            return false;
        const propsAndDefaultVals = Schema.#get_default_val_by_param_property();
        // Must not have unallowed properties:
        for (let prop in valObj) {
            if (!Object.hasOwn(propsAndDefaultVals, prop))
                return false;
        }
        // Check if "type" must but doesn't appear in "valObj". Or if appears but without the allowed values:
        if ((propsAndDefaultVals['type'].must && !Object.hasOwn(valObj, 'type')) ||
            (Object.hasOwn(valObj, 'type') && !Object.hasOwn(Schema.#allowedTypesAndDefaultsVals(), valObj['type'])))
            return false;
        // Check if "required" must but doesn't appear in "valObj". Or if appears but without the allowed values:
        if ((propsAndDefaultVals['required'].must && !Object.hasOwn(valObj, 'required')) ||
            (Object.hasOwn(valObj, 'required') && Schema.typeX(valObj['required']) !== Schema.typeX(propsAndDefaultVals['required'].defaultValue)))
            return false;
        // Check if "default" must but doesn't appear in "valObj". Or if appears, then its value's type must match the "type" from above:
        if ((propsAndDefaultVals['default'].must && !Object.hasOwn(valObj, 'default')) ||
            (Object.hasOwn(valObj, 'default') && Object.hasOwn(valObj, 'type') && Schema.typeX(valObj['default']) != valObj['type']))
            return false;
        return true;
    }
}


module.exports = Schema;  // Exporting the class.
