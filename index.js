'use strict'

const Glob = require('glob')
const Boom = require('boom')
const parser = require('json-schema-ref-parser')
const parseHref = require('jpi-uri-template')
const Ajv = require('ajv')
const pkg = require('./package')
const helper = require('./lib/validator')
const ajv = new Ajv({ allErrors: true, v5: true }) // options can be passed, e.g. { allErrors: true }
const name = 'jpi-hapi-json-schema'

module.exports.register = function (server, options, next) {
  let makeHandler = options.makeHandler

  Glob(options.schema, function (err, files) {
    if (err) {
      server.log(['error', name], err)
      return next(err)
    }

    Promise.all(files.map(f => parser.dereference(f, { dereference: { circular: 'ignore' } }))).then(values => {
      values.forEach(function (schema, index) {
        server.route(schema.links.map(link => {
          /**
           * Build validations for params, query, payload and response
           */
          let validate = {}
          let href = parseHref(link.href, schema)

          if (href.matches.length) {
            // Params
            let params = href.matches.filter(m => m.type === 'param')
            if (params.length) {
              let paramsSchema = {
                type: 'object',
                properties: {}
              }

              params.forEach(p => {
                paramsSchema.properties[p.key] = p.definition
              })
              let paramsValidator = ajv.compile(paramsSchema)

              validate.params = function validateParams (value, options, next) {
                var result = helper.validateParams(paramsSchema, paramsValidator, value, options.context.headers)

                if (result.valid) {
                  next(null, value)
                } else {
                  const error = Boom.badRequest('Validation Error - Path Params')
                  error.output.payload.details = result.errors
                  next(error)
                }
              }
            }

            // Query
            let query = href.matches.filter(m => m.type === 'query')
            if (query.length) {
              let querySchema = {
                type: 'object',
                properties: {}
              }
              query.forEach(p => {
                querySchema.properties[p.key] = p.definition
              })
              let queryValidator = ajv.compile(querySchema)

              validate.query = function validateQuery (value, options, next) {
                var result = helper.validateQuery(querySchema, queryValidator, value, options.context.headers)

                if (result.valid) {
                  next(null, value)
                } else {
                  const error = Boom.badRequest('Validation Error - Query Params')
                  error.output.payload.details = result.errors
                  next(error)
                }
              }
            }
          }

          // Payload
          if (link.schema) {
            let payloadSchema = link.schema
            let payloadValidator = ajv.compile(payloadSchema)

            validate.payload = function validatePayload (value, options, next) {
              var result = helper.validatePayload(payloadSchema, payloadValidator, value, options.context.headers)

              if (result.valid) {
                next(null, value)
              } else {
                const error = Boom.badRequest('Validation Error - Payload')
                error.output.payload.details = result.errors
                next(error)
              }
            }
          }

          var path = href.path
          
          let config = {
            path: path,
            method: link.method,
            config: {
              description: link.description,
              // handler: require('../routes/' + fileName)[link.rel].handler
              handler: makeHandler(files[index], schema, link),
              validate: validate
            }
          }

          // if (link.targetSchema) {
          //   let responseSchema = link.targetSchema
          //   let responseValidator = ajv.compile(responseSchema)

          //   config.config.response = {
          //     schema: function validateResponse (value, options, next) {
          //       var result = helper.validatePayload(responseSchema, responseValidator, value, options.context.headers)

          //       if (result.valid) {
          //         next(null, value)
          //       } else {
          //         const error = Boom.badRequest('Validation Error - Response')
          //         error.output.payload.details = result.errors
          //         next(error)
          //       }
          //     }
          //   }
          // }

          return config
        }))
      })

      next()
    }).catch(err => {
      server.log(['error', name], err)
      return next(err)
    })
  })
}


module.exports.register.attributes = {
  name: name,
  version: pkg.version
}
