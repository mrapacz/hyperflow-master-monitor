#!/usr/bin/env node

var AMQP_URL  = process.env.AMQP_URL ? process.env.AMQP_URL : "amqp://localhost:5672";
var QUEUE_NAME = process.env.QUEUE_NAME ? process.env.QUEUE_NAME : 'hyperflow.jobs';

var HYPERFLOW_METRIC_NAME = process.env.HYPERFLOW_METRIC_NAME ? process.env.HYPERFLOW_METRIC_NAME : "QueueLength";
var HYPERFLOW_METRIC_NAMESPACE = process.env.HYPERFLOW_METRIC_NAMESPACE ? process.env.HYPERFLOW_METRIC_NAMESPACE : 'hyperflow';
var CLUSET_NAME = process.env.CLUSET_NAME ? process.env.CLUSET_NAME : 'ecs_test_cluster_hyperflow';

var AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID : "";
var AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ? process.env.AWS_SECRET_ACCESS_KEY : "";
var AWS_REGION = process.env.AWS_REGION ? process.env.AWS_REGION : 'us-east-1';

var AWS = require('aws-sdk');
var amqp = require('amqplib/callback_api');

var config={accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY,region: AWS_REGION};
var cloudwatch = new AWS.CloudWatch(config);

amqp.connect(AMQP_URL, function(err, conn) {
  if(err)
  {
    console.log("err %j",err);
  }else
  {
    console.log("connected");
  }

  conn.createChannel(function(err, ch) {
    console.log("create channel");
    ch.assertQueue(QUEUE_NAME, {durable: true});

    
    setInterval(function(){
      var mcount=0;
      ch.checkQueue(QUEUE_NAME, function(err, ok) {
        
        console.log('MetricNotify messageCount:'+ok.messageCount);
        mcount =ok.messageCount;

        var params = {
            MetricData: [ 
              {
                MetricName: HYPERFLOW_METRIC_NAME, 
                Value: mcount,
                Dimensions: [
                  {
                    Name: 'ClusterName', /* required */
                    Value: CLUSET_NAME /* required */
                  }]
              }
            ],
            Namespace: HYPERFLOW_METRIC_NAMESPACE 
            
          };
    
          cloudwatch.putMetricData(params, function(err, data) {
            if (err) console.log(err, err.stack); 
            else     console.log(data);           
          });
      });

    }, 1000);

  });
});
