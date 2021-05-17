import websocket from 'websocket';
import http from 'http';

// A web socket server that delegate message handling to its handler
// And the handler calls it back to send or dispatch a message to clients
// of the wb socket
export class WsServer {

    constructor(port, messageHandler) {
		var server = http.createServer();
        server.listen(port, function() {});
        this.clients = [];
        this.messageHandler = messageHandler;
        this.wsServer = new websocket.server({httpServer: server});
        this.wsServer.on('request', this.wsHandle.bind(this));        
    }

    send(message, connection) {
        connection.sendUTF(JSON.stringify(message));
    }
    
    dispatch(message) {
        var json = JSON.stringify(message);
        for (let client of this.clients) {
            client.sendUTF(json);
        }
    }

    close(connection) {
        var index = -1;
        for (var i=0; i < this.clients.length; i++) {
            if (connection==this.clients[i]) {
                index = i;
                break;
            }
        }
        if (index > 0) this.clients.splice(index, 1);
    }

    messageHandle(message) {
        if (message.type === 'utf8') {
            var msg = JSON.parse(message.utf8Data);
            this.messageHandler.messageHandle(msg);
        }
    }
    
    wsHandle(request) {
        console.log((new Date()) + ' Connection from origin ' + request.origin + '.');
        var connection = request.accept(null, request.origin);
        this.clients.push(connection);
        connection.on('message', this.messageHandle.bind(this));
        connection.on('error', this.close.bind(this));
        connection.on('close', this.close.bind(this));
    }

    end() {
        if (this.server) this.server.close();
		this.wsServer.shutDown();
    }
}
