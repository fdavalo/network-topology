import process from 'process';
import {Watch} from './watchResources.js';
import fs from 'fs';

process.on('uncaughtException', function (err) {
    console.log(err);
})

var options = {
    resource: process.argv[2],
    port: 8080,
    verbose: false,
    kubeApiUrl: 'https://kubernetes.default:443',
    kubeApiVersion: 'v1',
    kubeApiGroup: '',
    kubeApiResource: process.argv[2],
    kubeApiTokenDir: '/var/run/secrets/kubernetes.io/serviceaccount',
    kubeApiCaDir: '/run/ca',
};

if (options.resource == "networks") options['kubeApiGroup'] = "config.openshift.io";

if (process.env.CONFIGFILE) options = JSON.parse(fs.readFileSync(process.env.CONFIGFILE + "/" + options.resource + '.json'));
if (process.argv.length > 3) options = JSON.parse(fs.readFileSync(process.argv[3]));

var watch = new Watch(options);
watch.run();
