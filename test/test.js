const Lab = require('lab')
const Code = require('code')
const Path = require('path')
const Hapi = require('hapi')
const lab = exports.lab = Lab.script()
const expect = Code.expect

const composeServer = function (callback) {
  const server = new Hapi.Server()
  server.connection({ port: 3000, labels: 'www' })
  server.connection({ port: 3001, labels: 'api' })
  server.register(
    [
      {
        register: require('..'),
        options: {
          schema: Path.resolve(__dirname, 'schema/routes/customer.json'),
          prepareRouteOptions: function (options, file, schema, link) {
            options.config.handler = function (request, reply) {
              reply({ok: 200})
            }
          }
        },
        select: 'www'
      },
      {
        register: require('..'),
        options: {
          schema: Path.resolve(__dirname, 'schema/routes/blog.json'),
          prepareRouteOptions: function (options, file, schema, link) {
            options.config.handler = function (request, reply) {
              reply({ok: 200})
            }
          }
        },
        select: 'api'
      }
    ],
    function (err) {
      callback(err, err ? null : server)
    })
}

lab.experiment('buy', function () {
  var server

  // Make a server before the tests
  lab.before((done) => {
    console.log('Creating server')
    composeServer(function (err, result) {
      if (err) {
        return done(err)
      }

      console.log('Created server')
      server = result
      done()
    })
  })

  lab.after((done) => {
    console.log('Stopping server')
    server.stop(done)
  })

  lab.test('server routing table', (done) => {
    const table = server.table()
    expect(table.length).to.equal(2)

    table.forEach(function (table) {
      console.log('Server started at: ' + table.info.uri)
      console.log('Labels: ' + table.labels)
      console.log(table.table.map(item => item.method.toUpperCase() + ' ' + item.path))
    })
    // expect(table[0].method).to.equal('get')
    // expect(table[0].path).to.equal('/')

    // expect(table[1].method).to.equal('get')
    // expect(table[1].path).to.equal('/public/{path*}')

    server.stop(done)
  })

  lab.test('unknown url returns 404', function (done) {
    var options = {
      method: 'GET',
      url: '/jksfds'
    }

    server.select('www').inject(options, function (response) {
      expect(response.statusCode).to.equal(404)
      server.stop(done)
    })
  })

  lab.test('unknown url returns 404', function (done) {
    var options = {
      method: 'GET',
      url: '/jksfds'
    }

    server.select('api').inject(options, function (response) {
      expect(response.statusCode).to.equal(404)
      server.stop(done)
    })
  })

  lab.test('test www', function (done) {
    var options = {
      method: 'GET',
      url: '/customer'
    }

    server.select('www').inject(options, function (response) {
      expect(response.statusCode).to.equal(200)
      server.stop(done)
    })
  })

  lab.test('test api', function (done) {
    var options = {
      method: 'GET',
      url: '/blog'
    }

    server.select('api').inject(options, function (response) {
      expect(response.statusCode).to.equal(200)
      server.stop(done)
    })
  })

  lab.test('test api create blog', function (done) {
    var options = {
      method: 'POST',
      url: '/blog',
      payload: {
        name: 'Liz',
        age: 25
      }
    }

    server.select('api').inject(options, function (response) {
      expect(response.statusCode).to.equal(200)
      server.stop(done)
    })
  })

  lab.test('test api create blog fails when missing payload data', function (done) {
    var options = {
      method: 'POST',
      url: '/blog'
    }

    server.select('api').inject(options, function (response) {
      expect(response.statusCode).to.equal(400)
      var payload = JSON.parse(response.payload)
      expect(payload.error).to.equal('Bad Request')
      expect(payload.validation).to.be.an.object()
      expect(payload.validation.source).to.be.a.string().and.equal('payload')
      expect(payload.details).to.be.an.array().and.have.length(1)
      expect(payload.details[0].field).to.equal('data')
      expect(payload.details[0].message).to.equal('is the wrong type')
      server.stop(done)
    })
  })

  lab.test('test api create blog fails when missing payload key age', function (done) {
    var options = {
      method: 'POST',
      url: '/blog',
      payload: {
        name: 'dave'
      }
    }

    server.select('api').inject(options, function (response) {
      expect(response.statusCode).to.equal(400)
      var payload = JSON.parse(response.payload)
      expect(payload.error).to.equal('Bad Request')
      expect(payload.validation).to.be.an.object()
      expect(payload.validation.source).to.be.a.string().and.equal('payload')
      expect(payload.details).to.be.an.array().and.have.length(1)
      expect(payload.details[0].field).to.equal('data.age')
      expect(payload.details[0].message).to.equal('is required')
      server.stop(done)
    })
  })

  lab.test('test api create blog fails when missing payload key name', function (done) {
    var options = {
      method: 'POST',
      url: '/blog',
      payload: {
        age: 25
      }
    }

    server.select('api').inject(options, function (response) {
      expect(response.statusCode).to.equal(400)
      var payload = JSON.parse(response.payload)
      expect(payload.error).to.equal('Bad Request')
      expect(payload.validation).to.be.an.object()
      expect(payload.validation.source).to.be.a.string().and.equal('payload')
      expect(payload.details).to.be.an.array().and.have.length(1)
      expect(payload.details[0].field).to.equal('data.name')
      expect(payload.details[0].message).to.equal('is required')
      server.stop(done)
    })
  })

  lab.test('test api create blog fails when payload key age is outside of bounds', function (done) {
    var options = {
      method: 'POST',
      url: '/blog',
      payload: {
        name: 'Liz',
        age: -1
      }
    }

    server.select('api').inject(options, function (response) {
      expect(response.statusCode).to.equal(400)
      var payload = JSON.parse(response.payload)
      expect(payload.error).to.equal('Bad Request')
      expect(payload.validation).to.be.an.object()
      expect(payload.validation.source).to.be.a.string().and.equal('payload')
      expect(payload.details).to.be.an.array().and.have.length(1)
      expect(payload.details[0].field).to.equal('data.age')
      expect(payload.details[0].message).to.equal('is less than minimum')
      server.stop(done)
    })
  })

  lab.test('test api create blog fails when payload name is missing key age is outside of bounds', function (done) {
    var options = {
      method: 'POST',
      url: '/blog',
      payload: {
        age: -1
      }
    }

    server.select('api').inject(options, function (response) {
      console.log(response.payload)
      expect(response.statusCode).to.equal(400)
      var payload = JSON.parse(response.payload)
      expect(payload.error).to.equal('Bad Request')
      expect(payload.validation).to.be.an.object()
      expect(payload.validation.source).to.be.a.string().and.equal('payload')
      expect(payload.details).to.be.an.array().and.have.length(2)
      expect(payload.details[0].field).to.equal('data.name')
      expect(payload.details[0].message).to.equal('is required')
      expect(payload.details[1].field).to.equal('data.age')
      expect(payload.details[1].message).to.equal('is less than minimum')
      server.stop(done)
    })
  })
})
