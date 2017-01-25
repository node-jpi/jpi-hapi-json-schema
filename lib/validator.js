var Validator = function (options) {
  // normalize all headers names in schema to lowercase
  var modifyHeadersSchema = function (schema) {
    var modifiedSchema = {}

    for (var prop in schema) {
      if (schema.hasOwnProperty(prop)) {
        if (prop !== 'properties') {
          modifiedSchema[prop] = schema[prop]
        } else {
          modifiedSchema.properties = {}
          for (var subProp in schema.properties) {
            if (schema.properties.hasOwnProperty(subProp)) {
              modifiedSchema.properties[subProp.toLowerCase()] = modifyHeadersSchema(schema.properties[subProp])
            }
          }
        }
      }
    }
    return modifiedSchema
  }

  var convertValueFromStringToType = function (value, type) {
    if (typeof (value) !== 'string' || type === 'string') {
      return value
    }
    if (type === 'integer' || type === 'number') {
      // fastest (and more reliable) way to convert strings to numbers
      var convertedVal = 1 * value
      // make sure that if our schema calls for an integer, that there is no decimal
      if (convertedVal || convertedVal === 0 && (type === 'number' || (value.indexOf('.') === -1))) {
        return convertedVal
      }
    } else if (type === 'boolean') {
      if (value === 'true') {
        return true
      } else if (value === 'false') {
        return false
      }
    }
    return value
  }

  var convertPropertyTypesToMatchSchema = function (object, schema, forceArrayConversion) {
    // in some cases (query params), we want to force a value to be an array that contains that value,
    // if the schema expects an array of strings, numbers, integers, or booleans
    if (forceArrayConversion && schema.type === 'array' && typeof (object) === 'string' && schema.items &&
      (schema.items.type === 'string' || schema.items.type === 'number' || schema.items.type === 'integer' || schema.items.type === 'boolean')) {
      object = [object]
    }
    var i, prop
    if (typeof (object) === 'object' && schema.properties) {
      for (prop in schema.properties) {
        if (schema.properties.hasOwnProperty(prop) && Object.hasOwnProperty.call(object, prop)) {
          object[prop] = convertPropertyTypesToMatchSchema(object[prop], schema.properties[prop], forceArrayConversion)
        }
      }
      return object
    } else if (schema.type === 'array' && typeof (object) === 'object' && object instanceof Array && schema.items) {
      for (prop in schema.items) {
        if (schema.items.hasOwnProperty(prop)) {
          for (i = 0; i < object.length; i++) {
            object[i] = convertPropertyTypesToMatchSchema(object[i], schema.items, forceArrayConversion)
          }
        }
      }
      return object
    } else {
      return convertValueFromStringToType(object, schema.type)
    }
  }

  var convertArraysInQueryString = function (queryObj) {
    var prop, newProp, idx
    var arraySyntaxRegex = /\[\d+]$/
    for (prop in queryObj) {
      if (Object.hasOwnProperty.call(queryObj, prop)) {
        if (arraySyntaxRegex.test(prop)) {
          newProp = prop.substring(0, prop.lastIndexOf('['))
          queryObj[newProp] = queryObj[newProp] || []
          idx = 1 * prop.substring(prop.lastIndexOf('[') + 1, prop.lastIndexOf(']'))
          queryObj[newProp][idx] = queryObj[prop]
          delete queryObj[prop]
        }
      }
    }
  }

  this.validateParams = function (schema, validator, params) {
    // convert path types before validating
    convertPropertyTypesToMatchSchema(params, schema)

    var report = {
      valid: validator(params)
    }

    if (!report.valid) {
      report.errors = validator.errors
    }

    return report
  }

  this.validateQuery = function (schema, validator, query) {
    // convert query types before validating
    convertArraysInQueryString(query)
    convertPropertyTypesToMatchSchema(query, schema, true)

    var report = {
      valid: validator(query)
    }

    if (!report.valid) {
      report.errors = validator.errors
    }
    return report
  }

  this.validatePayload = function (schema, validator, payload, headers) {
    // var headers = request.raw.req.headers

    // if (!headers['content-type'] && payload &&
    //   !(typeof payload === 'object' &&
    //   Object.keys(payload).length === 0)) {
    //   return { valid: false, errors: ['unable to validate payload: missing content-type header and had content'] }
    // }

    // convert payload types before validating only if payload is type application/x-www-form-urlencoded or multipart/form-data
    if (headers['content-type'] && (headers['content-type'].indexOf('application/x-www-form-urlencoded') === 0 || headers['content-type'].indexOf('multipart/form-data') === 0)) {
      convertPropertyTypesToMatchSchema(payload, schema)
    }

    var report = {
      valid: validator(payload)
    }

    if (!report.valid) {
      report.errors = validator.errors
    }

    return report
  }

  this.validateHeaders = function (schema, validator, headers) {
    // convert header types before validating
    convertPropertyTypesToMatchSchema(headers, schema, true)

    var report = {
      valid: validator(headers)
    }

    if (!report.valid) {
      report.errors = validator.errors
    }

    return report
  }

  this.validateResponse = function (schema, validator, request) {
    var report = {
      valid: validator(request.response.source)
    }

    if (!report.valid) {
      report.errors = validator.errors
    }

    return report
  }
}

module.exports = new Validator()
