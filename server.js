/*global console*/
var yetify = require('yetify'),
    config = require('getconfig'),
    fs = require('fs'),
    sockets = require('./sockets'),
    port = parseInt(process.env.PORT || config.server.port, 10),
    server_handler = function (req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
      	res.setHeader('Access-Control-Request-Method', '*');
      	res.setHeader('Access-Control-Allow-Methods', '*');
        res.writeHead(404);
        res.end();
    },
    server = null;

// Create an http(s) server instance to that socket.io can listen to
server = require('http').Server(server_handler);

server.listen(port, function(err) {
    if (err) {
        throw err;
    }
    console.log(yetify.logo() + ' -- signal master is running at: ' + httpUrl);
});

sockets(server, config);

if (config.uid) process.setuid(config.uid);

var httpUrl;

httpUrl = "http://localhost:" + port;
