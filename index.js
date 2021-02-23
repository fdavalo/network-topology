import request from 'request';
import process from 'process';
import websocket from 'websocket';
import http from 'http';
import path from 'path';
import fs from 'fs';

"use strict";

var webSocketServer = websocket.server;
var WebSocketClient = websocket.client;

var wsclients = [];

var staticBasePath = './docroot';

var staticServe = function(req, res) {
    var resolvedBase = path.resolve(staticBasePath);
    var safeSuffix = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '');
    var fileLoc = path.join(resolvedBase, safeSuffix);
    
    fs.readFile(fileLoc, function(err, data) {
        if (err) {
            res.writeHead(404, 'Not Found');
            res.write('404: File Not Found!');
            return res.end();
        }
        
        res.statusCode = 200;

        res.write(data);
        return res.end();
    });
};

var server = http.createServer(staticServe);

var webSocketsServerPort = 8080;

var wsServer = null;

var data = {}

var resources = {
	'pods':{'serverUrl':'ws://watch-resources-pods:80/'},
};

var clients = {};

for (var res in resources) {
	clients[res] = new WebSocketClient({'name':res});
}

var clientConnections = {};

process.on('uncaughtException', function (err) {
	console.log("uncaughtException");
	console.log(err);
})

// server
function dispatch(key, value) {
	var message = {"request":"flow", "key":key, "value":value};
	var json = JSON.stringify(message);
	for (var i=0; i < wsclients.length; i++) {
		wsclients[i].sendUTF(json);
	}
}

function produce(key, value) {
	if (wsclients.length>0) dispatch(key, value);
}

function close(connection) {
	var index = -1;
	for (var i=0; i < wsclients.length; i++) {
		if (connection==wsclients[i]) {
			index = i;
			break;
		}
	}
	if (index > 0) wsclients.splice(index, 1);
}

function wsHandle(request) {
	console.log((new Date()) + ' Connection from origin ' + request.origin + '.');
	var connection = request.accept(null, request.origin);
	var index = wsclients.push(connection) - 1;
	connection.on('message', function(message) {
		if (message.type === 'utf8') {
			var msg = JSON.parse(message.utf8Data);
			if (msg.request) {
				console.log(data[msg.request]);
				if (msg.request == "flows") {
					var flows = {}
					for (var res in data) {
						if (res.startsWith("flows")) {
							for (var key in data[res]) flows[key] = data[res][key];
						}
					}
					connection.sendUTF(JSON.stringify({"request":msg.request, "data":flows}));
				}
				else if (data[msg.request])
					connection.sendUTF(JSON.stringify({"request":msg.request, "data":data[msg.request]}));
			}
		}
	});
    connection.on('error', function(connection) {
		console.log((new Date()) + " Peer " + connection.remoteAddress + " error.");
		close(connection);
	});
	connection.on('close', function(connection) {
		console.log((new Date()) + " Peer " + connection.remoteAddress + " disconnected.");
		close(connection);
	});
}

function wsStart() {
	server.listen(webSocketsServerPort, function() {});
	wsServer = new webSocketServer({httpServer: server});
	wsServer.on('request', wsHandle);
}

wsStart();

//client
function getResources(res) {
	var message = {"request":"all"}
	var json = JSON.stringify(message);
	if (clientConnections[res]) clientConnections[res].sendUTF(json);
}

function handleConnect(connection) {
	var name = connection.config.name;
    console.log('WebSocket Client Connected '+name);
	clientConnections[name]=connection;
    getResources(name);
    connection.on('error', function(error) {
		console.log("Connection Error: " + error.toString());
		disconnect(name);
    });
    connection.on('close', function() {
		console.log('Connection Closed');
		disconnect(name);
    });
    connection.on('message', function(message) {
		if (message.type === 'utf8') {
	    	var msg = JSON.parse(message.utf8Data);
	    	//console.log("Received: '" + message.utf8Data + "'");
	    	if (msg.request === 'all') {
				setResources(name, msg.data);
	    	}
	    	else if (msg.request === 'one') {
				majResource(name, msg.key, msg.value);
	    	}
		}
	});
}

function checkPod(pod) {
	if (pod.metadata.name.startsWith('watch-flows-') &&
		(pod.status.phase=='Running') &&
		((!pod['eventType']) || (pod.eventType != 'DELETED'))) {
		var fres = 'flows-'+pod.status.hostIP;
		console.log(fres);
		if (!resources[fres] || (resources[fres]['podName']!=pod.metadata.name)) {
			disconnect(fres);
			resources[fres] = {'podName':pod.metadata.name, 'serverUrl':'ws://'+pod.status.hostIP+':8080/'};
			clients[fres] = new WebSocketClient({'name':fres});
			clients[fres].on('connectFailed', handleError);
			clients[fres].on('connect', handleConnect);
			clients[fres].connect(resources[fres].serverUrl);
		}
	}
}

function setResources(res, datas) {
	if (res.startsWith('flows')) {
		data[res] = datas;
	} 
	else {
		data[res] = datas;
		if (res=="pods") {
			for (var uid in datas) {
				checkPod(datas[uid]);
			}
		}
	}
}

function majResource(res, key, value) {
	if (res.startsWith('flows')) {
		if (!data[res]) data[res]={}
		data[res][key]=value;
		produce(key, value);
	}
	else {
		if (!data[res]) data[res]={};
		data[res][key]=value;
		if (res=="pods") {
			checkPod(value);
		}
	}
}

function handleError(error) {
    console.log('Connect Error: ' + error.toString());
}

for (var res in resources) {
	clients[res].on('connectFailed', handleError);
	clients[res].on('connect', handleConnect);
}

function disconnect(res) {
	if (clientConnections[res]) {
		delete clientConnections[res];
	}
}

function connect(res) {
	if (clientConnections[res]) disconnect(res);
	else clients[res].connect(resources[res].serverUrl);
}

function check() {
	for (var res in resources) {
		if (! clientConnections[res]) connect(res);
	}
	setTimeout(check, 10000);
}

check();

