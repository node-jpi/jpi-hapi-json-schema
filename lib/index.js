'use strict'

const Fs = require('fs')
const Boom = require('boom')
const Assert = require('assert')
const Thing = require('core-util-is')
const Routes = require('jpi-swaggerize-routes')
const Utils = require('jpi-swaggerize-routes/lib/utils')
const Yaml = require('js-yaml')
const RefParser = require('json-schema-ref-parser')
const Package = require('../package.json')

module.exports = {
  register: function (server, options, next) {
    var routes, basePath

    Assert.ok(Thing.isObject(options), 'Expected options to be an object.')
    Assert.ok(options.api, 'Expected an api definition.')

    // if (Thing.isString(options.api)) {
    //   options.api = loadApi(options.api)
    // }

    // Assert.ok(Thing.isObject(options.api), 'Api definition must resolve to an object.')

    RefParser.dereference(options.api, function (err, schema) {
      if (err) {
        return next(new Error('Api defererence failed.'))
      }

      options.api = schema

      options.basedir = options.basedir || process.cwd()
      options.docspath = Utils.prefix(options.docspath || '/api-docs', '/')
      options.docspath = Utils.unsuffix(options.docspath, '/')
      options.api.basePath = Utils.prefix(options.api.basePath || '/', '/')
      basePath = Utils.unsuffix(options.api.basePath, '/')

      // Build routes
      routes = Routes(options)

      // API docs route
      server.route({
        method: 'GET',
        path: basePath + options.docspath,
        config: {
          handler: function (request, reply) {
            reply(options.api)
          },
          cors: options.cors
        },
        vhost: options.vhost
      })

      // Add all known routes
      routes.forEach(function (route) {
        var config
        // , formValidators, headers

        config = {
          pre: [],
          handler: undefined,
          cors: options.cors
        }

        // Addition before ops supplied in handler file (as array)
        if (Thing.isArray(route.handler)) {
          if (route.handler.length > 1) {
            for (var i = 0; i < route.handler.length - 1; i++) {
              config.pre.push({
                assign: route.handler[i].name || 'p' + (i + 1),
                method: route.handler[i]
              })
            }
          }
          config.handler = route.handler[route.handler.length - 1]
        } else {
          config.handler = route.handler
        }

        // AJV
        var Ajv = require('ajv')
        var validationHelper = require('./validator')
        var ajv = new Ajv({allErrors: true}) // options can be passed, e.g. { allErrors: true }

        if (route.ratifyValidators) {
          config.validate = {}
          Object.keys(route.ratifyValidators).forEach(v => {
            var schema = route.ratifyValidators[v]
            var validate = ajv.compile(schema)

            v = v === 'path' ? 'params' : v
            v = v === 'formData' ? 'payload' : v
            config.validate[v] = function (value, options, next) {
              var result = validationHelper['validate' + v](schema, validate, value, options.context.headers)

              if (result.valid) {
                next(null, value)
              } else {
                const error = Boom.badRequest('Validation Error')
                error.output.payload.details = validate.errors
                next(error)
              }
            }
          })
        }
        // END AJV

        if (route.security) {
          var securitySchemes = Object.keys(route.security)

          securitySchemes.forEach(function (securityDefinitionName) {
            var securityDefinition = options.api.securityDefinitions[securityDefinitionName]

            Assert.ok(securityDefinition, 'Security scheme not defined.')
            Assert.ok(securityDefinition.type === 'apiKey', 'Security schemes other than api_key are not supported.')

            config.auth = config.auth || {}
            config.auth.strategies = config.auth.strategies || []
            config.auth.strategies.push(securityDefinitionName)
          })
        }

        // Define the route
        server.route({
          method: route.method,
          path: basePath + route.path,
          config: config,
          vhost: options.vhost
        })
      })

      // Expose plugin api
      // server.expose({
      //   api: options.api,
      //   setHost: function setHost (host) {
      //     this.api.host = options.api.host = host
      //   }
      // })

      // Done
      next()
    })
  }
}

/**
 * Loads the api from a path, with support for yaml..
 * @param apiPath
 * @returns {Object}
 */
function loadApi (apiPath) {
  if (apiPath.indexOf('.yaml') === apiPath.length - 5 || apiPath.indexOf('.yml') === apiPath.length - 4) {
    return Yaml.load(Fs.readFileSync(apiPath))
  }
  return require(apiPath)
}

module.exports.register.attributes = {
  name: 'swagger',
  multiple: true,
  version: Package.version
}
