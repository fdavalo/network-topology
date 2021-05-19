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

        this.localIps = this.getLocalIps();
        if (options['localIps'] != null) this.localIps = options['localIps'];
        this.options['localIps']['127.0.0.1'] = 'localhost';

        this.hostname = os.hostname();
        if (options['hostname'] != null) this.hostname = options['hostname'];
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
        var orip = {'host':this.checkIp(arr[3], ipmode, cmd, null, arr[4], ts),'port':arr[4]};
        var destp = {'host':this.checkIp(arr[5], ipmode, null, dns, arr[6], ts),'port':arr[6]};
        this.addFlow({"ori":orip['host'],"dest":destp['host']});
    }

    handleLineAccept(line) {
        var arr = line.split(' ',7);
        var ipmode = arr[2];
        if (arr[3]=="IP") return;
        var ts = arr[0];
        var cmd = arr[1];
        var orip = {'host':this.checkIp(arr[3], ipmode, null, null, arr[4], ts),'port':arr[4]};
        var destp = {'host':this.checkIp(arr[5], ipmode, cmd, null, arr[6], ts),'port':arr[6]};
        this.addFlow({"ori":orip['host'],"dest":destp['host']});
    }

    addFlow(flowr) {
        var flow = flowr['ori']['name']+'->'+flowr['dest']['name'];
        if ((flowr['ori']['node'] != null) && (flowr['dest']['node'] != null) && ((flowr['ori']['cmd'] == null) || (flowr['dest']['cmd'] == null))) {
            if (this.LocalFlows[flow] == null) this.LocalFlows[flow] = flowr;
        }
        else if (this.Flows[flow] == null) {
            this.Flows[flow] = flowr;
            this.dispatch(flow, flowr);
        }
    }

    updateLocalFlows() {
        var toDelete = [];
        for (var lflow in this.LocalFlows) {
            var flowr = this.LocalFlows[lflow];
            var ori = flowr['ori'];
            var dest = flowr['dest'];
            if ((ori['cmd'] == null) && (this.IpPorts[ori['ip']+':'+ori['port']] != null)) {
                ori['cmd'] = this.IpPorts[ori['ip']+':'+ori['port']];
                ori['name'] = ori['node']+':'+ori['ip']+':'+ori['cmd'];
                var flow = ori['name']+'->'+dest['name'];
                if (this.Flows[flow] == null) {
                    this.Flows[flow] = flowr;
                    this.dispatch(flow, flowr);
                }
                toDelete.push(lflow);
            }
            else if ((dest['cmd'] == null) && (this.IpPorts[dest['ip']+':'+dest['port']] != null)) {
                dest['cmd'] = this.IpPorts[dest['ip']+':'+dest['port']];
                dest['name'] = dest['node']+':'+dest['ip']+':'+dest['cmd'];
                var flow = ori['name']+'->'+dest['name'];
                if (this.Flows[flow] == null) {
                    this.Flows[flow] = flowr;
                    this.dispatch(flow, flowr);
                }
                toDelete.push(lflow);
            }
        }
        for (flow in toDelete) {
            delete this.LocalFlows[lflow];
        }
        setTimeout(this.updateLocalFlows.bind(this), 1000);
    }

    checkIp(s, ipmode, cmd, dns, port, ts) { //8.12.12.12 4/6
        var ip = s;
        if (s=="::1") ip = '127.0.0.1';
        if (s.startsWith('::ffff:')) ip = s.substring(7);
        var res = {'ip':ip, 'name':':'+ip+':'+port, 'port':port, 'ts':ts};
        if ((dns != null) && (dns != 'No')) {
            res['dns'] = dns;
        }
        if (cmd != null) {
            this.IpPorts[ip+':'+port] = cmd;
            res['cmd'] = cmd;
            res['node'] = this.hostname;
            res['name'] = this.hostname+':'+ip+':'+cmd;
        }
        if ((cmd == null) && (this.localIps[ip] != null)) {
            if (this.IpPorts[ip+':'+port] != null) {
                res['node'] = this.hostname;
                res['cmd'] = this.IpPorts[ip+':'+port];
                res['name'] = this.hostname+':'+ip+':'+res['cmd'];
            }
            else {
                res['node'] = this.hostname;
                res['name'] = this.hostname+':'+ip+':'+port;
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
