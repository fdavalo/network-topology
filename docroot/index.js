var data = {'namespaces':{},'flows':{},'pods':{}};

function mock() {
	 var flows = {
		  "1": {"ipln":"192.168.1.67", "ipdn":"192.168.1.68", "portd":80},
		  "2": {"ipln":"ns1.pod.pod1", "ipdn":"192.168.1.68", "portd":80},
		  "3": {"ipln":"ns1.service.svc1", "ipdn":"192.168.1.68", "portd":80},
		  "4": {"ipln":"master,worker.node.master1", "ipdn":"192.168.1.68", "portd":80},
		  "5": {"ipln":"192.168.1.67", "ipdn":"ns2.pod.pod2", "portd":80},
		  "6": {"ipln":"192.168.1.67", "ipdn":"ns2.service.svc2", "portd":80},
		  "7": {"ipln":"192.168.1.67", "ipdn":"master,worker.node.master1", "portd":80},
		  "8": {"ipln":"ns1.pod.pod1", "ipdn":"ns2.pod.pod2", "portd":80},
		  "9": {"ipln":"ns1.pod.pod1", "ipdn":"ns2.service.svc2", "portd":80},
		  "10": {"ipln":"ns1.pod.pod1", "ipdn":"master,worker.node.master1", "portd":80},
		  "11": {"ipln":"ns1.service.svc1", "ipdn":"ns2.pod.pod2", "portd":80},
		  "12": {"ipln":"ns1.service.svc1", "ipdn":"ns2.service.svc2", "portd":80},
		  "13": {"ipln":"ns1.service.svc1", "ipdn":"master,worker.node.master1", "portd":80},
		  "14": {"ipln":"master,worker.node.master1", "ipdn":"ns2.pod.pod2", "portd":80},
		  "15": {"ipln":"master,worker.node.master1", "ipdn":"ns2.service.svc2", "portd":80},
		  "16": {"ipln":"master,worker.node.master1", "ipdn":"master,worker.node.master1", "portd":80}
	 };
	 var modifiedNamespaces = {};
	 setFlows(flows, modifiedNamespaces);
	 updateNamespaces(modifiedNamespaces);
		modifiedNamespaces = {};
		addFlow({"ipln":"ns2.service.svc2", "ipdn":"ns2.pod.pod2", "portd":80}, modifiedNamespaces);
		updateNamespaces(modifiedNamespaces);
		modifiedNamespaces = {};
		addFlow({"ipln":"master,worker.node.master1", "ipdn":"master,worker.node.master1", "portd":80}, modifiedNamespaces);
	 updateNamespaces(modifiedNamespaces);
}

function init() {
	window.WebSocket = window.WebSocket || window.MozWebSocket;
	var url = document.location;
	var connection = new WebSocket('ws://'+url.host+'/');
	connection.onopen = function () {
			connection.send("{\"request\":\"flows\"}");
	};
	connection.onerror = function (error) {console.log(error);};
	connection.onmessage = function (message) {
		try {
			   var json = JSON.parse(message.data);
			   if (json.request === 'flows') {
				    var modifiedNamespaces = {};
				    setFlows(json.data, modifiedNamespaces);
				    updateNamespaces(modifiedNamespaces);
			   }
			   else if (json.request === 'flow') {
				    var modifiedNamespaces = {};
				    addFlow(json.value, modifiedNamespaces);
				    updateNamespaces(modifiedNamespaces);
			   }
			   else if (json.request === 'pods') {
				    setPods(json.data);
			   }
		  }
		  catch (e) {
			   console.log('This doesn\'t look like a valid JSON: ', message.data);
			   return;
		  }
	 };
}

function isCharNumber(c) {
	 return c >= '0' && c <= '9';
}

function showNamespaceFlow(flows, label) {
	 if (! flows) return "";
	 var html = "<tr class='row header'><td class='cell header2' colspan='5'>"+label+"</td></tr>";
	 html += "<tr class='row header'>" +
		  "<td class='cell'>Source</td>" +
		  "<td class='cell'></td>" +
		  "<td class='cell'>Destination</td>" +
		  "<td class='cell'></td>" +
		  "<td class='cell'>Port</td>";
		var tag = 'even';
	 for (var key in flows) {
		  var flow = flows[key];
		  html += "<tr class='row "+tag+"'>" +
			   "<td class='cell'>"+flow.left+"</td>" +
			   "<td class='cell'>=></td>" +
			   "<td class='cell'>"+flow.right+"</td>" +
			   "<td class='cell'>:</td>" +
			   "<td class='cell'>"+flow.port+"</td></tr>";
				if (tag == 'even') tag = 'odd';
				else tag = 'even';
	 }
	 //html += "<tr class='row'><td class='cell' colspan='3'>-----------------</td></tr>";
	 return html;
}

function showNamespace(namespace) {
	if (! data.namespaces[namespace]) return "";
	var html = "<table class='table'><tr class='row header'><td class='cell header1' colspan='2'>"+namespace+"</td></tr>";
	if (data.namespaces[namespace].loops != null) {
		html += "<tr class='row'>";
		html += "<td class='cell' colspan='2'><table class='table'>";
  		html += showNamespaceFlow(data.namespaces[namespace].loops, "internal");
		html += "</table></td>";
		html += "</tr>";
	}
	if ((data.namespaces[namespace].ins != null) && (data.namespaces[namespace].outs != null)) {
		html += "<tr class='row'>";
		html += "<td class='cell'><table class='table'>";
		if (data.namespaces[namespace].ins != null) html += showNamespaceFlow(data.namespaces[namespace].ins, "igress");
		html += "</table></td>";
		html += "<td class='cell'><table class='table'>";
		if (data.namespaces[namespace].outs != null) html += showNamespaceFlow(data.namespaces[namespace].outs, "egress");
		html += "</table></td>";
		html += "</tr>";
	}
	html += "</table>";
	return html;
}

function updateNamespaces(namespaces) {
	 for (var namespace in namespaces) {
		  var element = document.getElementById("namespace:"+namespace);
		  if (element === null) {
			   var div = document.getElementById("namespaces");
			   div.innerHTML = div.innerHTML + "<div id='namespace:"+namespace+"'></div>";
			   element = document.getElementById("namespace:"+namespace);
		  }
		  element.innerHTML = showNamespace(namespace);
	 }
}

function checkFlowEntity(app) {
	if (app.type == "pod") return [app.namespace, app.pod+'(pod)', app.namespace+'.'+app.pod+'(pod)'];
	if (app.type == "service") return [app.namespace, app.service+'(svc)', app.namespace+'.'+app.service+'(svc)'];
	if (app.type == "node") {
		var cmd = app.port;
		if (app.cmd != null) cmd = app.cmd;
		return [app.node, cmd, app.node+'.'+cmd];
	}
	if (app.type == "ip") {
		var dns = app.ip;
		if (app.dns != null) dns = app.dns;
		return ['', dns, dns];
	}
    return ['', app.name, app.name];
}


function addFlowDirection(namespace, direction, left, right, port) {
	 if (! data.namespaces[namespace])
		  data.namespaces[namespace] = {};
    if (! data.namespaces[namespace][direction+"s"])
		  data.namespaces[namespace][direction+"s"] = {};
	 var flow = left+"=>"+right+":"+port;
	 if (data.namespaces[namespace][direction+"s"][flow]) return false;
	 data.namespaces[namespace][direction+"s"][flow] = {'left':left, 'right':right, 'port':port};
	 return true;
}

function setFlows(flows, modifiedNamespaces) {
	 data.flows = flows;
	 for (var flow in flows) { 
		  var obj = flows[flow]; 
		  addFlow(obj, modifiedNamespaces);
	 }
}

function addFlow(obj, modifiedNamespaces) {
	var left = checkFlowEntity(obj.ori);
	var right = checkFlowEntity(obj.dest);
	var port = obj.dest.port;
	if (left[0] == right[0]) {
		if (left[0] !== '') {
			addFlowDirection(left[0], 'loop', left[1], right[1], port);
			modifiedNamespaces[left[0]] = true;
	   }
	   else {
		  addFlowDirection('unknown', 'loop', left[1], right[1], port);
		  modifiedNamespaces['unknown'] = true;
	  }
	}
	else {
		if (left[0] !== '') {
			addFlowDirection(left[0], 'out', left[1], right[2], port);
			modifiedNamespaces[left[0]] = true;
	 	}
	 	else {
			addFlowDirection('unknown', 'out', left[1], right[2], port);
			modifiedNamespaces['unknown'] = true;
		}
		if (right[0] !== '') {
			addFlowDirection(right[0], 'in', left[2], right[1], port);
			modifiedNamespaces[right[0]] = true;
		}
    	else {
			addFlowDirection('unknown', 'in', left[2], right[1], port);
			modifiedNamespaces['unknown'] = true;
		}
	}
}

function setPods(pods) {
}

init();
//mock();


