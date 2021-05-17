import process from 'process';
import {Watch} from './watchFlows.js';
import fs from 'fs';

process.on('uncaughtException', function (err) {
    console.log(err);
})

var options = {
    resource: 'flows',
    port: parseInt(process.argv[2],10),
    verbose: false,
    connect: '/var/shared/connect.pipe',
    accept: '/var/shared/accept.pipe',
};

if (process.env.CONFIGFILE) options = JSON.parse(fs.readFileSync(process.env.CONFIGFILE + "/" + options.resource + '.json'));
if (process.argv.length > 3) options = JSON.parse(fs.readFileSync(process.argv[3]));

var watch = new Watch(options);
watch.run();
