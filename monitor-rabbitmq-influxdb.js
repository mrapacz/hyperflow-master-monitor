#!/usr/bin/env node

var AMQP_URL = process.env.AMQP_URL ? process.env.AMQP_URL : "amqp://localhost:5672";
var QUEUE_NAME = process.env.QUEUE_NAME ? process.env.QUEUE_NAME : 'hyperflow.jobs';

var INFLUX_DB = process.env.INFLUX_DB ? process.env.INFLUX_DB : 'http://127.0.0.1:8086/hyperflow_influxdb';


var HYPERFLOW_METRIC_NAME = process.env.HYPERFLOW_METRIC_NAME ? process.env.HYPERFLOW_METRIC_NAME : "QueueLength";
var HYPERFLOW_METRIC_NAMESPACE = process.env.HYPERFLOW_METRIC_NAMESPACE ? process.env.HYPERFLOW_METRIC_NAMESPACE : 'hyperflow';
var CLUSET_NAME = process.env.CLUSET_NAME ? process.env.CLUSET_NAME : 'ecs_test_cluster_hyperflow';

var AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID : "";
var AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ? process.env.AWS_SECRET_ACCESS_KEY : "";
var AWS_REGION = process.env.AWS_REGION ? process.env.AWS_REGION : 'us-east-1';

var AWS = require('aws-sdk');

var config = {accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY, region: AWS_REGION};
var cloudwatch = new AWS.CloudWatch(config);

var amqp = require('amqplib/callback_api');
const Influx = require('influxdb-nodejs');

const client = new Influx(INFLUX_DB);

var prometheus = require('prom-client');

var metrics = {};

prometheus.collectDefaultMetrics();
const fieldSchema = {
    QueueLength: 'i',
    consumerCount: 'i',
    queue: 's',
};

const tagSchema = {};

client.schema('hyperflow_rabbitmq_monitor', fieldSchema, tagSchema, {
    // default is false
    stripUnknown: true,
});

console.log(AMQP_URL);

var tryAgain = true;

function notifyCloudWatchMetric(value) {
    console.log("value %d", value);
    var params = {
        MetricData: [
            {
                MetricName: HYPERFLOW_METRIC_NAME,
                Value: value,
                Dimensions: [
                    {
                        Name: 'ClusterName',
                        Value: CLUSET_NAME
                    }]
            }
        ],
        Namespace: HYPERFLOW_METRIC_NAMESPACE

    };

    cloudwatch.putMetricData(params, function (err, data) {
        if (err) console.log(err, err.stack);
        else console.log(data);
    });
}


amqp.connect(AMQP_URL, function (err, conn) {

    console.log("ok after connect");
    conn.createChannel(function (err, ch) {
        console.log("createch err: %j", err);
        tryAgain = false;

        timeout = null;
        setInterval(function () {
            console.log("setInterval");
            ch.assertQueue(QUEUE_NAME, {durable: true});
            var mcount = 0;
            ch.checkQueue(QUEUE_NAME, function (err, ok) {
                if (ok) {
                    console.log("Session: %j", ok);
                    mcount = ok.messageCount;

                    if (mcount == 0 && timeout == null) {
                        if (ok.consumerCount > 1) {
                            console.log("START TIMER");
                            timeout = setTimeout(function () {
                                console.log("TIMEOUT");
                                notifyCloudWatchMetric(-1)
                                timeout = null;
                            }, 200000)
                        }
                    }
                    if (mcount > 0 && timeout != null) {
                        console.log("clear timer");
                        clearTimeout(timeout);
                        timeout = null;
                    }

                    client.write('hyperflow_rabbitmq_monitor')
                        .field({
                            QueueLength: ok.messageCount,
                            consumerCount: ok.consumerCount,
                            queue: ok.queue,
                        })
                        .then(() => console.info('write point success'))
                        .catch(console.error);

                    metrics.hyperflow_rabbitmq_monitor_queue_length = metrics.hyperflow_rabbitmq_monitor_queue_length ||
                        new prometheus.Gauge({
                                name: 'hyperflow_rabbitmq_monitor_queue_length',
                                help: 'rabbitmq monitor queue length',
                                labelNames: ['queue'],
                            }
                        );
                    metrics.hyperflow_rabbitmq_monitor_queue_length.set({queue: ok.queue}, ok.messageCount);

                    metrics.hyperflow_rabbitmq_monitor_consumer_count = metrics.hyperflow_rabbitmq_monitor_consumer_count ||
                        new prometheus.Gauge({
                                name: 'hyperflow_rabbitmq_monitor_consumer_count',
                                help: 'rabbitmq monitor consumer count',
                                labelNames: ['queue'],
                            }
                        );
                    metrics.hyperflow_rabbitmq_monitor_consumer_count.set({queue: ok.queue}, ok.consumerCount);
                    notifyCloudWatchMetric(mcount);
                }
            });
        }, 1000);
    });

});


http.createServer(function (req, res) {
    if (req.url == '/metrics') {
        res.writeHeader(200);
        res.end(prometheus.register.metrics());
    } else (res.writeHeader(404));
}).listen(9103);