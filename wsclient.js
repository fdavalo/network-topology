import websocket from 'websocket';

"use strict";

export class WsClient {
    constructor(resources, handler) {
        this.resources = {};
        this.handler = handler;
        
        this.clients = {};
        this.clientConnections = {};
        
        for (var res in resources) {
            this.addResource(res, resources[res]);
        }

        this.check();
    }

    addResource(res, resource) {
        this.disconnect(res);
        this.resources[res] = resource;
        this.clients[res] = new websocket.client({'name':res});
        this.clients[res].on('connectFailed', this.handleConnectError.bind(this, res));
        this.clients[res].on('connect', this.handleConnect.bind(this));        
    }

    handleMessage(res, message) {
        if (message.type === 'utf8') {
            var msg = JSON.parse(message.utf8Data);
            this.handler.messageReceived(res, msg);
        }
    }

    handleConnectError(res, error) {
        console.log('Connect Error:',res,error.toString());
    }

    handleError(res, error) {
        console.log('Connect Error:',res,error.toString());
        this.disconnect(res);
    }

    handleConnect(connection) {
        var res = connection.config.name;
        console.log('WebSocket Client Connected '+res);
        this.clientConnections[res]=connection;
        connection.on('error', this.handleError.bind(this, res));
        connection.on('close', this.handleError.bind(this, res));
        connection.on('message', this.handleMessage.bind(this, res));
        this.handler.clientConnected(res);
    }
    
    send(res, message) {
        var json = JSON.stringify(message);
        if (this.clientConnections[res]) this.clientConnections[res].sendUTF(json);
    }

    disconnect(res) {
        if (this.clientConnections[res]) {
            delete this.clientConnections[res];
        }
    }

    connect(res) {
        if (this.clientConnections[res]) this.disconnect(res);
        else this.clients[res].connect(this.resources[res].serverUrl);
    }

    check() {
        for (var res in this.resources) {
            if (! this.clientConnections[res]) this.connect(res);
        }
        setTimeout(this.check.bind(this), 10000);
    }

    end() {
        for (var res in this.resources) {
            this.disconnect(res);
            this.clients[res].abort();
        }
    }
}
