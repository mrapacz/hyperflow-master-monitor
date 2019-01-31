#!/usr/bin/env node

var AWS_REGION = process.env.AWS_REGION ? process.env.AWS_REGION : 'us-east-1';
var INFLUX_DB = process.env.INFLUX_DB ? process.env.INFLUX_DB : 'http://127.0.0.1:8086/hyperflow_influxdb';
var CLUSTER_NAME = process.env.CLUSTER_NAME ? process.env.CLUSTER_NAME : 'ecs_test_cluster_hyperflow';

var AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID : "";
var AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ? process.env.AWS_SECRET_ACCESS_KEY : "";

//var AMQP_URL  = process.env.AMQP_URL ? process.env.AMQP_URL : "amqp://localhost:5672";

var AWS = require('aws-sdk');
//var amqp = require('amqplib/callback_api');

var config = {accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY, region: AWS_REGION};


var ecs = new AWS.ECS(config);
var cloudwatch = new AWS.CloudWatch(config);

const Influx = require('influxdb-nodejs');
const client = new Influx(INFLUX_DB);
const prometheus = require('prom-client');
const http = require('http');

var metrics = {};

prometheus.collectDefaultMetrics();

// // simple countdown
// function CDL(countdown, completion) {
//   this.signal = function() {
//       if(--countdown < 1) completion();
//   };
// }

// // i --> integer
// // s --> string
// // f --> float
// // b --> boolean
// const fieldSchema = {
//   ec2_count: 'i',
//   worker_count: 'i',
//   QueueLength: 'i',
//   url: 's',
// };
// const tagSchema = {
//   region: ['us-east1', 'us-east2'],
// };

// client.schema('hyperflow_alarms', fieldSchema, tagSchema, {
//   // default is false
//   stripUnknown: true,
// });

var params = {
    cluster: CLUSTER_NAME
};

var paramsAlarm = {
    AlarmNames: ["ecs_test_cluster_hyperflow_queue_lenth_low", "ecs_test_cluster_hyperflow_queue_lenth_high"],
};

setInterval(function () {
    console.log("set inter")

    cloudwatch.waitFor('alarmExists', paramsAlarm, function (err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        else {

            AlarmLowValue = data.MetricAlarms[0].StateValue;
            AlarmHightValue = data.MetricAlarms[1].StateValue;

            var calculatedAlarmValue = 0;

            if (data.MetricAlarms.length > 0 && (data.MetricAlarms[1].StateValue == 'ALARM' || data.MetricAlarms[0].StateValue == 'ALARM')) {
                calculatedAlarmValue = 1;
            }

            client.write('hyperflow_alarms')
                .tag({
                    region: AWS_REGION
                })
                .field({
                    alarm: calculatedAlarmValue
                })
                .then(() => console.info('write point success'))
                .catch(console.error);

            metrics.hyperflow_alarms = metrics.hyperflow_alarms ||
                new prometheus.Gauge({
                    name: 'hyperflow_alarms',
                    help: 'Alarm',
                    labelNames: ['region']
                });
            metrics.hyperflow_alarms.set({region: AWS_REGION}, calculatedAlarmValue);
        }
    });

}, 1000);

http.createServer(function (req, res) {
    if (req.url == '/metrics') {
        res.writeHeader(200);
        res.end(prometheus.register.metrics());
    } else (res.writeHeader(404));
}).listen(9101);


