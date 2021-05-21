import {WsServer} from './wsserver.js';
import {WsClient} from './wsclient.js';
import http from 'http';
import path from 'path';
import fs from 'fs';


const ip4ToInt = ip =>
  ip.split('.').reduce((int, oct) => (int << 8) + parseInt(oct, 10), 0) >>> 0;

const isIp4InCidr = ip => cidr => {
  const [range, bits = 32] = cidr.split('/');
  const mask = ~(2 ** (32 - bits) - 1);
  return (ip4ToInt(ip) & mask) === (ip4ToInt(range) & mask);
};

const isIp4InCidrs = (ip, cidrs) => cidrs.some(isIp4InCidr(ip));

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

export class Watch {

    constructor(options) {
        this.Flows = {};

        // 'str' : {'ip':'str', 'type':'str', 'name':'str', 'namespace':'str:optional', 'service':'str:optional'}
        this.Ips = {};
		this.Cache = {};
		this.IpPorts = {};
        this.Cids = {};

        // récup des ips du noeuds
        // vérif si ip pod est sur le noeud et donc flux connect/accept a corréler
        // recherche ip externes du noeuds et ip interne cidr du noeud
        // ajout ts sur le flux pour corrélation et purge des flux raw
        // corrélation cmd des flux sur différents noeuds ?
        // passer par un timeout récurrent plutot que déclenchements d'update
        // voir le timeout sur les watch-resources trop bas et checker la reprise en cas de coupure
		//setTimeout : pas de pb de stack full par récurrence

        this.PodCidrs = [];
        this.ServiceCidrs = [];

        this.options = options;

        this.wsServer = null;
		this.server = null;
		this.wsClient = null;
    }

    run() {
		this.wsClient = new WsClient(this.options.resources, this);
		this.server = http.createServer(staticServe);
		this.server.listen(this.options.port, function() {});
        this.wsServer = new WsServer(this.options.port, this, this.server);
		this.updateFlows();
	}

	//ws server
	messageHandle(msg) {
		if (msg.request) {
			if (msg.request == "flows") {
				this.wsServer.dispatch({"request":msg.request, "data":this.Flows});
			}
		}
	}

    externalIp(ip) {
        if (this.Cache[ip] != null) return this.Cache[ip];
        if ((this.PodCidrs.length > 0) && isIp4InCidrs(ip, this.PodCidrs)) {
            this.Cache[ip] = false;
            return false;
        }
        if ((this.ServiceCidrs.length > 0) && isIp4InCidrs(ip, this.ServiceCidrs)) {
            this.Cache[ip] = false;
            return false;
        }
        if ((this.PodCidrs.length > 0) && (this.ServiceCidrs.length > 0)) {
            this.Cache[ip] = true;
            return true;
        }
        return null;
    }
	
	updateIp(item) {
		var ip = item['ip'];
		var port = item['port'];
        var cid = item['cid'];
		if (item['cmd'] != null) this.IpPorts[ip+':'+port] = item['cmd'];
		else if (this.IpPorts[ip+':'+port] != null) {
			item['cmd'] = this.IpPorts[ip+':'+port];
		}
		if (this.IpPorts[ip+':'+port] != null) item['type'] = 'node';
        if ((cid != null) && (this.Cids[cid] != null)) {
            item['type'] = 'pod';
            item['pod'] = this.Cids[cid]['pod'];
            item['namespace'] = this.Cids[cid]['namespace'];
            item['node'] = this.Cids[cid]['node'];
        }
		else if (this.Ips[ip] != null) {
			if (this.Ips[ip]['type'] == 'pod') {
				for (let key of ['type', 'namespace', 'pod', 'node']) item[key] = this.Ips[ip][key];
			}
			else if (this.Ips[ip]['type'] == 'service') {
				for (let key of ['type', 'namespace', 'service']) item[key] = this.Ips[ip][key];
			}
			else if (this.Ips[ip]['type'] == 'node') {
				for (let key of ['type', 'node']) item[key] = this.Ips[ip][key];
			}
		}
		else {
			if (item['node'] != null) {
				this.Ips[ip] = {
					'type':'node',
					'node': item['node']
				};
			}
		}
		if (item['node'] != null) {
			if (item['cmd'] != null) item['name'] = item['node']+':'+ip+':'+item['cmd'];
			else item['name'] = item['node']+':'+ip+':'+port;
		}
		else item['name'] = ':'+ip+':'+port;
		if (item['type'] == null) {
			if (this.externalIp(ip) === true) item['type'] = 'ip';
		}
	}

	addFlow(flowr) {
		var ori = flowr['ori'];
		var dest = flowr['dest'];
		this.updateIp(ori);
		this.updateIp(dest);
		var flow = ori['name']+'->'+dest['name'];
		if (this.Flows[flow] == null) {
			this.Flows[flow] = flowr;
			this.wsServer.dispatch({"request":"flow", "data":flowr});
		}
	}

    updateFlows() {
        for (var lflow in this.Flows) {
            var flowr = this.Flows[lflow];
			delete this.Flows[lflow];
			this.addFlow(flowr);
        }
        setTimeout(this.updateFlows.bind(this), 10000);
    }

	//ws client
	clientConnected(res) {
		console.log("client connected : ", res);
		var message = {"request":"all"};
        this.wsClient.send(res, message);
	}

	//ws client
	messageReceived(res, msg) {
        if (msg.request === 'all') {
            for (var uid in msg.data) {
                if (res=="pods") this.checkPodIP(msg.data[uid]);
                else if (res=="services") this.checkServiceIP(msg.data[uid]);
                else if (res=="nodes") this.checkNodeIP(msg.data[uid]);
                else if (res=="networkconfig") this.checkNetworkConfig(msg.data[uid]);
				else if (res.startsWith("flows-")) this.addFlow(msg.data[uid]);
            }
        }
        else if (msg.request === 'one') {
            if (res=="pods") this.checkPodIP(msg.value);
            else if (res=="services") this.checkServiceIP(msg.value);
            else if (res=="nodes") this.checkNodeIP(msg.value);
			else if (res.startsWith("flows-")) this.addFlow(msg.value);
        }
    }    
	
    updateService(service, namespace, ip) {
        if (this.Ips[ip] == null) {
            this.Ips[ip] = {
                'type':'service',
                'namespace':namespace,
                'service':service
            };
        }
        else {
            this.Ips[ip]['type'] = 'service';
            this.Ips[ip]['namespace'] = namespace;
            this.Ips[ip]['service'] = service;
        }
    }

	checkServiceIP(svc) {
        var ip = svc.spec.clusterIP;
        if (svc.metadata && svc.spec && ip && (ip != 'None')) {
            this.updateService(svc.metadata.name, svc.metadata.namespace, ip);
        }
    }

    checkNodeIP(node) {
        var config = {};
        for (var i in node.status.addresses) {
            var item = node.status.addresses[i];
            if (item.type == "Hostname") config["hostname"] = item.address;
            if (item.type == "InternalIP") config["internalip"] = item.address;
        }
        if ((config["internalip"] != null) && (config["hostname"] != null)) {
            var ip = config["internalip"];
			if (this.Ips[ip] != null) {
            	this.Ips[ip]['node'] = config["hostname"];
            	this.Ips[ip]['type'] = 'node';
			}
			else {
				this.Ips[ip] = {
					'type':'node',
					'node':config["hostname"]
				};
			}
        }
    }

    checkNetworkConfig(config) {
        this.ServiceCidrs = config.status.serviceNetwork;
        for (var i in config.status.clusterNetwork) {
            var item = config.status.clusterNetwork[i];
            if (item["cidr"] && (this.PodCidrs.indexOf(item["cidr"])<0)) this.PodCidrs.push(item["cidr"]);
        }
    }

    checkPodIP(pod) {
        var ip = pod.status.podIP;
        if ((pod.status.phase=='Running') &&
            ((pod['eventType'] == null) || (pod.eventType != 'DELETED'))) {
                if (pod.status.podIP == pod.status.hostIP) {
					if (pod.metadata.name.startsWith(this.options.flows_pod_prefix)) {
						var fres = 'flows-'+pod.status.hostIP;
						if (!this.options.resources[fres] || (this.options.resources[fres]['podName']!=pod.metadata.name)) {
							this.options.resources[fres] = {'node':pod.spec.nodeName, 'podName':pod.metadata.name, 'serverUrl':'ws://'+pod.status.hostIP+':'+this.options.flows_pod_port+'/', 'backupUrl':'ws://'+pod.spec.nodeName+':'+this.options.flows_pod_port+'/'};
							this.wsClient.addResource(fres, this.options.resources[fres]);
						}
					}
					var podName = pod.metadata.namespace+"."+pod.metadata.name;
					if (this.Ips[ip] == null) {
						this.Ips[ip] = {
                            'type':'node',
							'node':pod.spec.nodeName,
                            'pods':[podName]
						};
					}
                    else {
						if (this.Ips[ip]['pods'] == null) this.Ips[ip]['pods'] = [podName];
						else if (this.Ips[ip]['pods'].indexOf(podName)<0) this.Ips[ip]['pods'].push(podName);
                        this.Ips[ip]['type'] = 'node';
                    }
                }
                else {
                    if (this.Ips[ip] == null) {
                        this.Ips[ip] = {
                            'type':'pod',
							'node':pod.spec.nodeName,
                            'namespace':pod.metadata.namespace,
                            'pod':pod.metadata.name
						};
                    }
                    else {
                        this.Ips[ip]['type'] = 'pod';
						this.Ips[ip]['node'] = pod.spec.nodeName;
                        this.Ips[ip]['namespace'] = pod.metadata.namespace;
                        this.Ips[ip]['pod'] = pod.metadata.name;
                    }
                }
                for (let container of pod.status.containerStatuses) {
                    var cidp = container['containerID'];
                    if ((cidp != null) && cidp.startsWith('cri-o://')) {
                        var cid = cidp.substring(8);
                        this.Cids[cid] = {'node': pod.spec.nodeName, 'namespace':pod.metadata.namespace, 'pod':pod.metadata.name};
                    }
                }
                if (pod.status.initContainerStatuses != null) {
                    for (let container of pod.status.initContainerStatuses) {
                        var cidp = container['containerID'];
                        if ((cidp != null) && cidp.startsWith('cri-o://')) {
                            var cid = cidp.substring(8);
                            this.Cids[cid] = {'node': pod.spec.nodeName, 'namespace':pod.metadata.namespace, 'pod':pod.metadata.name};
                        }
                    }
                }
        }
        //else if (Ips[ip] && (Ips[ip]['name'] === pod.metadata.namespace+".pod."+pod.metadata.name)) {
        //  delete Ips[ip];
        //}
    }
}	

