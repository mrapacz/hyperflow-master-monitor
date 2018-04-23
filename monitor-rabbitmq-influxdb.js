#!/usr/bin/env node

var AMQP_URL  = process.env.AMQP_URL ? process.env.AMQP_URL : "amqp://localhost:5672";
var QUEUE_NAME = process.env.QUEUE_NAME ? process.env.QUEUE_NAME : 'hyperflow.jobs';

var INFLUX_DB = process.env.INFLUX_DB ? process.env.INFLUX_DB : 'http://127.0.0.1:8086/hyperflow_influxdb';

var amqp = require('amqplib/callback_api');
const Influx = require('influxdb-nodejs');

const client = new Influx(INFLUX_DB);

// i --> integer
// s --> string
// f --> float
// b --> boolean
const fieldSchema = {
    QueueLength: 'i',
    consumerCount: 'i',
    queue: 's',
  };

  const tagSchema = {

  };
  
  client.schema('hyperflow_rabbitmq_monitor', fieldSchema, tagSchema, {
    // default is false
    stripUnknown: true,
  });

console.log(AMQP_URL);

var tryAgain = true;

amqp.connect(AMQP_URL, function(err, conn) {

  console.log("ok after connect");
    conn.createChannel(function(err, ch) {
        console.log("createch err: %j", err);
        tryAgain = false;
      setInterval(function(){
        console.log("setInterval");
        ch.assertQueue(QUEUE_NAME, {durable: true});
          var mcount=0;
            ch.checkQueue(QUEUE_NAME, function(err, ok) {
              if(ok)
              {
                console.log("Session: %j", ok);
                mcount =ok.messageCount;
                client.write('hyperflow_rabbitmq_monitor')
                .field({
                  QueueLength: ok.messageCount,
                  consumerCount: ok.consumerCount,
                  queue: ok.queue,
                })
                .then(() => console.info('write point success'))
                .catch(console.error);
              }
            });
      }, 1000);
     });

  });
  