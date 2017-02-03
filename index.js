'use strict'

const Glob = require('glob')
const Boom = require('boom')
const parser = require('json-schema-ref-parser')
const validator = require('is-my-json-valid')
const parseHref = require('jpi-uri-template')
const pkg = require('./package')
const helper = require('./lib/validator')
const name = 'jpi-hapi-json-schema'
const validatorOptions = {
  greedy: true,
  formats: {
    uuid: /^(?:urn\:uuid\:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i 
  }
}

module.exports.register = function (server, options, next) {
  const prepareRouteOptions = options.prepareRouteOptions

  Glob(options.schema, function (err, files) {
    if (err) {
      server.log(['error', name], err)
      return next(err)
    }

    Promise.all(files.map(f => parser.dereference(f))).then(values => {
      values.forEach(function (schema, index) {
        server.route(schema.links.map(link => {
          /**
           * Build validations for params, query, payload and response
           */
          const validate = {}
          const href = parseHref(link.href, schema)

          if (href.matches.length) {
            // Params
            const params = href.matches.filter(m => m.type === 'param')
            if (params.length) {
              const paramsSchema = {
                type: 'object',
                properties: {}
              }

              params.forEach(p => {
                paramsSchema.properties[p.key] = p.definition
              })

              const paramsValidator = validator(paramsSchema, validatorOptions)
              // const paramsValidator = ajv.compile(paramsSchema)

              validate.params = function validateParams (value, options, next) {
                const result = helper.validateParams(paramsSchema, paramsValidator, value, options.context.headers)

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
            const query = href.matches.filter(m => m.type === 'query')
            if (query.length) {
              const querySchema = {
                type: 'object',
                properties: {}
              }
              query.forEach(p => {
                querySchema.properties[p.key] = p.definition
              })

              const queryValidator = validator(querySchema, validatorOptions)
              // const queryValidator = ajv.compile(querySchema)

              validate.query = function validateQuery (value, options, next) {
                const result = helper.validateQuery(querySchema, queryValidator, value, options.context.headers)

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
            if (payloadSchema.$ref === '#') {
              payloadSchema = schema
            }

            const payloadValidator = validator(payloadSchema, validatorOptions)
            // const payloadValidator = ajv.compile(payloadSchema)

            validate.payload = function validatePayload (value, options, next) {
              const result = helper.validatePayload(payloadSchema, payloadValidator, value, options.context.headers)

              if (result.valid) {
                next(null, value)
              } else {
                const error = Boom.badRequest('Validation Error - Payload')
                error.output.payload.details = result.errors
                next(error)
              }
            }
          }

          const path = href.path

          const routeOptions = {
            path: path,
            method: link.method,
            config: {
              description: link.description,
              validate: validate
            }
          }

          prepareRouteOptions(routeOptions, files[index], schema, link)
          // if (link.targetSchema) {
          //   const responseSchema = link.targetSchema
          //   const responseValidator = ajv.compile(responseSchema)

          //   config.config.response = {
          //     schema: function validateResponse (value, options, next) {
          //       const result = helper.validatePayload(responseSchema, responseValidator, value, options.context.headers)

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

          return routeOptions
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
