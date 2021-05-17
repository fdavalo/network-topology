import request from 'request';
import JSONStream from 'json-stream';
import fs from 'fs';
import {WsServer} from './wsserver.js';
 
export class Watch {

    constructor(options) {
        this.options = options;
        this.data = {};

        var reqOptions = {
            auth: {
                bearer: fs.readFileSync(this.options.kubeApiTokenDir+'/token')
            },
            ca: fs.readFileSync(this.options.kubeApiCaDir+'/ca.pem'),
        };

        this.url = `${this.options.kubeApiUrl}/api/${this.options.kubeApiVersion}/${this.options.kubeApiResource}`;
        if (this.options.kubeApiGroup != "") 
            this.url = `${this.options.kubeApiUrl}/apis/${this.options.kubeApiGroup}/${this.options.kubeApiVersion}/${this.options.kubeApiResource}`;

        this.watchRequest = {
            uri: this.url,
            qs: {
                timeoutSeconds: 60,
                watch: true,
            }
        };
    
        this.versionRequest = {
            uri: this.url,
            json: true,
            qs: {}
        };

        // copy authents keys
        for (var key in reqOptions) this.watchRequest[key] = reqOptions[key];  
        for (key in reqOptions) this.versionRequest[key] = reqOptions[key];

        this.wsServer = null;
        this.stream = null;
        this.stop = false;
    }

    messageHandle(msg) {
        // When called with 'all' message, dispatch all resource info
        if (msg.request === 'all') {
            var message = {"request":"all", "type":this.options.resource, "data":this.data};
            this.wsServer.dispatch(message);
        }
    }

    run() {
        this.watchStream();
    }

    // first call, gets resources and set resourceVersion for next watch calls
    versionStream() {
        this.doStream(this.versionRequest);
    }

    // when resourceVersion set, watch ressources by stream mode
    watchStream() {
        if (this.stop) return;
        if ('resourceVersion' in this.watchRequest.qs) this.doStream(this.watchRequest);
        else this.versionStream();
    }

    doStream(req) {
        if (this.options.verbose) console.log(req);
        this.stream = new JSONStream();
        this.stream.on('data', event => {
            if (event) {
                // result from get all resources, first call
                if (event.kind && event.items) {
                    for (let item of event.items) {
                        this.data[item.metadata.uid]=item;
                    }
                    this.watchRequest.qs.resourceVersion = event.metadata.resourceVersion;
                    this.initServer();
                }
                // event from resource event stream
                else if (event.type && event.object && event.object.kind) {
                    var key = event.object.metadata.uid;
                    var value = event.object;
                    event.object['eventType']=event.type;
                    // update data set with event info
                    this.data[key]=value;
                    // dispatch this one event to websocket clients
                    this.dispatch(key, this.data[key]);
                    this.watchRequest.qs.resourceVersion = event.object.metadata.resourceVersion;
                }
            }
        });
        // on close, start a new stream
        request(req).on('close', this.watchStream.bind(this)).pipe(this.stream);
    }

    initServer() {
        if (this.wsServer == null) this.wsServer = new WsServer (this.options.port, this);
    }

    dispatch(key, value) {
        var message = {"request":"one", "type":this.options.resource, "key":key, "value":value};
        this.wsServer.dispatch(message);
    }


    end() {
        this.stop = true;
        this.wsServer.end();
    }
}
