import fs from 'fs';
import {WsServer} from './wsserver.js';
import process from 'process';
import readline from 'readline';
import os from 'os';
import { networkInterfaces } from 'os';
 
export class Watch {

    constructor(options) {
        this.Flows = {};
        this.LocalFlows = {};
        this.IpPorts = {};

        this.options = options; 

        this.wsServer = null;
        this.connect = null;
        this.accept = null;

        if (options['localIps'] == null) this.options['localIps'] = this.getLocalIps();
        this.options['localIps']['127.0.0.1'] = 'localhost';

        if (options['hostname'] == null) this.options['hostname'] = os.hostname();
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

        this.updateLocalFlows();
    }

    getLocalIps() {
        const nets = networkInterfaces();
        const results = {};

        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
                if (net.family === 'IPv4' && !net.internal) {
                    results[net.address] = name;
                }
            }
        }
        return results;
    }

    handleLineConnect(line) {
        var arr = line.split(' ',8);
        var ipmode = arr[2];
        if (arr[3]=="IP") return; 
        var ts = arr[0];
        var dns = arr[7];
        var cmd = arr[1];
        var ori = this.createIp(arr[3], ipmode, cmd, null, arr[4], ts);
        var dest = this.createIp(arr[5], ipmode, null, dns, arr[6], ts);
        this.addFlow({"ori":ori,"dest":dest});
    }

    handleLineAccept(line) {
        var arr = line.split(' ',7);
        var ipmode = arr[2];
        if (arr[3]=="IP") return;
        var ts = arr[0];
        var cmd = arr[1];
        var ori = this.createIp(arr[3], ipmode, null, null, arr[4], ts);
        var dest = this.createIp(arr[5], ipmode, cmd, null, arr[6], ts);
        this.addFlow({"ori":ori,"dest":dest});
    }

    addFlow(flowr) {
        var ori = this.checkIp(flowr['ori']);
        flowr['ori'] = ori;
        var dest = this.checkIp(flowr['dest']);
        flowr['dest'] = dest;
        var flow = ori['name']+'->'+dest['name'];
        if ((this.options['localIps'][ori['ip']] != null) && (this.options['localIps'][dest['ip']] != null) && ((ori['cmd'] == null) || (dest['cmd'] == null))) {
            if (this.LocalFlows[flow] == null) this.LocalFlows[flow] = flowr;
        }
        else if (this.Flows[flow] == null) {
            this.Flows[flow] = flowr;
            this.dispatch(flow, flowr);
        }
    }

    updateLocalFlows() {
        for (var lflow in this.LocalFlows) {
            var flowr = this.LocalFlows[lflow];
            delete this.LocalFlows[lflow];
            this.addFlow(flowr);
        }
        setTimeout(this.updateLocalFlows.bind(this), 1000);
    }

    createIp(s, ipmode, cmd, dns, port, ts) { //8.12.12.12 4/6
        var ip = s;
        if (s=="::1") ip = '127.0.0.1';
        if (s.startsWith('::ffff:')) ip = s.substring(7);
        var res = {'ip':ip, 'name':':'+ip+':'+port, 'port':port, 'ts':ts};
        if ((dns != null) && (dns != 'No')) {
            res['dns'] = dns;
        }
        if (cmd != null) res['cmd'] = cmd;
        return res;
    }

    checkIp(res) { //8.12.12.12 4/6
        var ip = res['ip'];
        var cmd = res['cmd'];
        var port = res['port'];

        if (cmd != null) {
            this.IpPorts[ip+':'+port] = cmd;
            res['cmd'] = cmd;
            res['node'] = this.options['hostname'];
            res['name'] = this.options['hostname']+':'+ip+':'+cmd;
        }
        else {
            if (this.IpPorts[ip+':'+port] != null) {
                res['node'] = this.options['hostname'];
                res['cmd'] = this.IpPorts[ip+':'+port];
                res['name'] = this.options['hostname']+':'+ip+':'+res['cmd'];
            }
            else if (this.options['localIps'][ip] != null) {
                res['node'] = this.options['hostname'];
                res['name'] = this.options['hostname']+':'+ip+':'+port;
            }
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
