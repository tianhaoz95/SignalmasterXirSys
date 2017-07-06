var socketIO = require('socket.io'),
    uuid = require('node-uuid'),
    crypto = require('crypto');
var axios = require("axios");
var https = require("https");
var dns = require("dns");

module.exports = function (server, config) {
    var io = socketIO.listen(server);
    var xirsys = config.xirsys;

    io.sockets.on('connection', function (client) {
        client.resources = {
            screen: false,
            video: true,
            audio: false
        };
        // pass a message to another id
        client.on('message', function (details) {
            if (!details) return;

            var otherClient = io.to(details.to);
            if (!otherClient) return;

            details.from = client.id;
            otherClient.emit('message', details);
        });

        client.on('shareScreen', function () {
            client.resources.screen = true;
        });

        client.on('unshareScreen', function (type) {
            client.resources.screen = false;
            removeFeed('screen');
        });

        client.on('join', join);

        function removeFeed(type) {
            if (client.room) {
                io.sockets.in(client.room).emit('remove', {
                    id: client.id,
                    type: type
                });
                if (!type) {
                    client.leave(client.room);
                    client.room = undefined;
                }
            }
        }

        function join(name, cb) {
            // sanity check
            if (typeof name !== 'string') return;
            // check if maximum number of clients reached
            if (config.rooms && config.rooms.maxClients > 0 &&
                clientsInRoom(name) >= config.rooms.maxClients) {
                safeCb(cb)('full');
                return;
            }
            // leave any existing rooms
            removeFeed();
            safeCb(cb)(null, describeRoom(name));
            client.join(name);
            client.room = name;
        }

        // we don't want to pass "leave" directly because the
        // event type string of "socket end" gets passed too.
        client.on('disconnect', function () {
            removeFeed();
        });
        client.on('leave', function () {
            removeFeed();
        });

        client.on('create', function (name, cb) {
            if (arguments.length == 2) {
                cb = (typeof cb == 'function') ? cb : function () {};
                name = name || uuid();
            } else {
                cb = name;
                name = uuid();
            }
            // check if exists
            var room = io.nsps['/'].adapter.rooms[name];
            if (room && room.length) {
                safeCb(cb)('taken');
            } else {
                join(name);
                safeCb(cb)(null, name);
            }
        });

        // support for logging full webrtc traces to stdout
        // useful for large-scale error monitoring
        client.on('trace', function (data) {
            console.log('trace', JSON.stringify(
            [data.type, data.session, data.prefix, data.peer, data.time, data.value]
            ));
        });

        // create shared secret nonces for TURN authentication
        // the process is described in draft-uberti-behave-turn-rest
        var credentials = [];
        // allow selectively vending turn credentials based on origin.
        var origin = client.handshake.headers.origin;

        /*
        var requestConfig = {
          url: "/_turn/" + xirsys.info.channel,
          baseUrl: "https://" + xirsys.gateway,
          method: "put",
          headers: {
            "Authorization": "Basic " + new Buffer( xirsys.info.ident+":"+xirsys.info.secret ).toString("base64")
          }
        };

        axios(requestConfig)
        .then((res) => {
          var result = res.data;
          var iceServers = result.v.iceServers;
          var turnservers = [],
              stunservers = [];
          iceServers.forEach(function (server) {
              if(server.url.indexOf("stun:") != -1){
                  stunservers.push(server);
              }else{
                  turnservers.push(server);
              }
          });
          console.log("emitting server info => ", stunservers, turnservers);
          client.emit('stunservers', stunservers || []);
          client.emit('turnservers', turnservers);
        })
        .catch(function (err) {
          console.log("axios error => ", err);
        });
        */

        var options = {
          host: xirsys.gateway,
          path: "/_turn/"+xirsys.info.channel,
          method: "PUT",
          family: 4,
          headers: {
            "Authorization": "Basic " + new Buffer( xirsys.info.ident+":"+xirsys.info.secret ).toString("base64")
          }
        };
        dns.lookup(options.host, console.log);
        console.log("prepare to make put request");
        var httpreq = https.request(options, function(httpres) {
          console.log("receive response from put request");
          var str = "";
          httpres.on("data", function(data){ str += data; });
          httpres.on("error", function(e){ console.log("error: ",e); });
          httpres.on("end", function(){
            console.log("response: ", str);
            var result = JSON.parse(str);
            var iceServers = result.v.iceServers;
            var turnservers = [],
                stunservers = [];
            iceServers.forEach(function (server) {
              if(server.url.indexOf("stun:") != -1){
                stunservers.push(server);
              }else{
                turnservers.push(server);
              }
            });
            client.emit('stunservers', stunservers || []);
            client.emit('turnservers', turnservers);
          });
        });
        httpreq.end();

    });


    function describeRoom(name) {
        var adapter = io.nsps['/'].adapter;
        var clients = adapter.rooms[name] || {};
        var result = {
            clients: {}
        };
        Object.keys(clients).forEach(function (id) {
            result.clients[id] = adapter.nsp.connected[id].resources;
        });
        return result;
    }

    function clientsInRoom(name) {
        return io.sockets.clients(name).length;
    }

};

function safeCb(cb) {
    if (typeof cb === 'function') {
        return cb;
    } else {
        return function () {};
    }
}
