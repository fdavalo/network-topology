import process from 'process';
import {Watch} from './web.js';
import fs from 'fs';

process.on('uncaughtException', function (err) {
    console.log(err);
})

var version = parseInt(process.argv[4],10);
var options = {
	resource: "topology",
    resources: {
		'pods':{'serverUrl':'ws://watch-resources-pods-"+version+":80/'},
		'services':{'serverUrl':'ws://watch-resources-services-"+version+":80/'},
		'nodes':{'serverUrl':'ws://watch-resources-nodes-"+version+":80/'},
		'networkconfig':{'serverUrl':'ws://watch-resources-networkconfig-"+version+":80/'}
	},
    port: parseInt(process.argv[2],10),
	flows_pod_port: parseInt(process.argv[3],10),
	flows_pod_prefix: "watch-flows-"+version,
    verbose: false
};

if (process.env.CONFIGFILE) options = JSON.parse(fs.readFileSync(process.env.CONFIGFILE + '/' + options.resource + '.json'));
if (process.argv.length > 3) options = JSON.parse(fs.readFileSync(process.argv[5]));

var watch = new Watch(options);
watch.run();

