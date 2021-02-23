import request from 'request';
import process from 'process';
import websocket from 'websocket';
import http from 'http';

"use strict";

var data = {}
var serverUrl = 'ws://localhost:8080/';

var WebSocketClient = websocket.client;

var client = new WebSocketClient();
var clientConnection = null;

process.on('uncaughtException', function (err) {
        console.log("uncaughtException");
        console.log(err);
})


function getAll() {
        var message = {"request":"all"}
        var json = JSON.stringify(message);
        if (clientConnection != null) clientConnection.sendUTF(json);
}

client.on('connectFailed', function(error) {
    console.log('Connect Error: ' + error.toString());
});

client.on('connect', function(connection) {
    console.log('WebSocket Client Connected');
    clientConnection = connection;
    getAll();
    connection.on('error', function(error) {
        console.log("Connection Error: " + error.toString());
        disconnect();
    });
    connection.on('close', function() {
        console.log('Connection Closed');
        disconnect();
    });
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            var msg = JSON.parse(message.utf8Data);
            console.log("Received: '" + message.utf8Data + "'");
            if (msg.request === 'all') {
                data = msg.data;
                console.log(data);
            }
            else if (msg.request === 'one') {
                data[msg.key] = msg.value;
                console.log(data);
            }
        }
    });
});

function disconnect() {
        if (clientConnection!=null) {
                clientConnection=null;
                setTimeout(connect, 10000);
        }
}
function connect() {
        if (clientConnection!=null) disconnect();
        else client.connect(serverUrl);
}
function check() {
        if (clientConnection == null) connect();
        setTimeout(check, 10000);
}

check();

