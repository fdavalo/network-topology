import fs from 'fs';
import {WsServer} from './wsserver.js';
import process from 'process';
import readline from 'readline';
import os from 'os';
 
export class Watch {

    constructor(options) {
        this.Flows = {};

        this.options = options; 

        this.wsServer = null;
        this.connect = null;
        this.accept = null;
    }

    run() {
        this.wsServer = new WsServer(this.options.port, this);

        const connectStream = fs.createReadStream(this.options.connect);
        this.connect = readline.createInterface({
                input: connectStream,
                output: process.stdout,
                terminal: false
        });

        const acceptStream = fs.createReadStream(this.options.accept);
        this.accept = readline.createInterface({
                input: acceptStream,
                output: process.stdout,
                terminal: false
        });

        this.connect.on('line', this.handleLineConnect.bind(this));
        this.accept.on('line', this.handleLineAccept.bind(this));
    }

    handleLineConnect(line) {
        var arr = line.split(' ',8);
        var ipmode = arr[2];
        if (arr[3]=="IP") return; 
        var dns = arr[7];
        var cmd = arr[1];
        var orip = {'host':this.checkIp(arr[3], ipmode, cmd, null),'port':arr[4]};
        var destp = {'host':this.checkIp(arr[5], ipmode, null, dns),'port':arr[6]};

        this.addFlow({"ori":orip['host'],"dest":destp['host'],"port":destp['port']});
    }

    handleLineAccept(line) {
        var arr = line.split(' ',7);
        var ipmode = arr[2];
        if (arr[3]=="IP") return;
        var cmd = arr[1];
        var orip = {'host':this.checkIp(arr[3], ipmode, null, null),'port':arr[4]};
        var destp = {'host':this.checkIp(arr[5], ipmode, cmd, null),'port':arr[6]};
        this.addFlow({"ori":orip['host'],"dest":destp['host'],"port":destp['port']});
    }

    addFlow(flowr) {
        var flow = flowr['ori']['name']+'->'+flowr['dest']['name']+':'+flowr['port'];
        if (! this.Flows[flow]) {
            this.Flows[flow] = flowr;
            this.dispatch(flow, flowr);
        }
    }

    checkIp(s, ipmode, cmd, dns) { //8.12.12.12 4/6
        var ip = s;
        if (s=="::1") ip = '127.0.0.1';
        if (s.startsWith('::ffff:')) ip = s.substring(7);
        var res = {'ip':ip,'name':ip};
        if (cmd != null) res = {'ip':ip,'node':os.hostname(),'cmd':cmd,'name':ip+'('+cmd+')'};
        else if ((dns != null) && (dns != 'No')) {
            res['dns'] = dns;
            res['name'] = ip+'('+dns+')';
        }
        return res;
    }

    // wsserver
    messageHandle(msg) {
        // When called with 'all' message, dispatch all resource info
        if (msg.request === 'all') {
            var message = {"request":"all", "type":this.options.resource, "data":this.Flows};
            this.wsServer.dispatch(message);
        }
    }

    // wsserver
    dispatch(key, value) {
        console.log('dispatch:'+key+'='+JSON.stringify(value));
        var message = {"request":"one", "type":this.options.resource, "key":key, "value":value};
        this.wsServer.dispatch(message);
    }

    end() {
        this.wsServer.end();
    }
}
