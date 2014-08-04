# BOLT - Accion Labs Performance Testing Platform

BOLT is a platform developed by Accion Labs for performance testing of any application that 
exposes web services API endpoints. The methodology used to test is by applying a controlled 
load of concurrent connections for each individual API endpoint at a time, while measuring the 
response times, and consumption of various server resources such as CPU, RAM or database 
connections.  
 
Under the hood, the current version of BOLT uses Apache Benchmark (ab) to generate a 
specified controlled load on a given API endpoint. What BOLT provides is a framework that can 
run multiple instances of ab across multiple processes on a single test system or across a 
cluster of multiple test systems, monitors the execution of these tests, collects the results and 
collates the data into an interactive report. 

The current version of BOLT is also integrated with Amazon Web Services Cloudwatch API to collect server performance metrics such as CPU, RAM or other custom parameters that can be sent via the CloudWatch API to BOLT.

Thus BOLT can be used during the SDLC so as to find performance bottlenecks and fix them 
well before they reach production systems, allowing developers to architect the solution for high 
performance.

## Approach

To test web services APIs, we need to perform concurrent connections from multiple testing client systems so as to simulate large loads. This version uses the well established Apache Benchmark (ab) utility and coordinates multiple ab tests from different client systems but synchronizing the execution from one server test system.

After accumulating Apache Benchmark reports, series of tests are started to collect CPU & RAM utilizations for the time period of ‘ab’ tests from CloudWatch*.

This test is optional and only valid for tests running on AWS servers.

## Installation instructions

##### Prerequisite:

* Apache Server
* Nodejs


To install Apache server execute below command in terminal

```bash
$ sudo apt-get install apache2
```
To start the Apache server
```bash
$ /etc/init.d/apache2 start
```

To stop the Apache server
```bash
$ /etc/init.d/apache2 stop
```

Install NodeJS

[http://nodejs.org/](http://nodejs.org/)

### To download BOLT
```bash
$ git clone https://github.com/accionlabs/BOLT.git
$ cd BOLT/
```
OR
 
```bash
$ wget https://github.com/accionlabs/BOLT/archive/master.zip
$ unzip master.zip
$ cd BOLT-master/
```



## Usage Instructions

The Performance Testing Platform provides two modules - the server & the client module. Both needs to be configured and executed separately on the respective nodes to start the test setup. Client nodes automatically connect to the server node. When a test is started, server can use all available client nodes.

Following are the instructions to configure and execute both these modules.

## Server Module

Server module interacts with the test client and sends request to client nodes to perform the test. The server module has following directory structure:

Folder/Files  | Description
------------- | -------------
./dashboard  	| Contains files/directories related to user interface
./tests  		  | Contains files related to different tests performed
./config.js 	| Configuration file for server module
./server.js  	| Used to start the server module


The configuration file contains a config object which is used by server module to process the test. Here is a sample config file:

```javascript
{
  executable: (process.platform == 'win32' ? 'C:\\Program Files\\Apache Software Foundation\\Apache2.2\\bin\\ab.exe' : 'ab'),
  host: '127.0.0.1',
  port: 8000,
  clients : {}, 
  busy: {},
  concurrency : {
    min : 50,
    max : 200,
    diff: 50
  }
}
```
  - `executable` : This indicates the performance tool to be used for the test.Currently only Apache Benchmark(ab) is supported.
  - `host`       : This indicates the hostname of the server node to start the server module, if its on the same system leave the IP as 127.0.0.1 or localhost.
  - `port`       : Port number to start the test.
  - `clients`    : It is used by server module to maintain status of connected nodes.
  - `busy`       : It is used by server module to maintain status of busy nodes.
  - `concurrency`: The test is executed in multiple iterations for each url. It starts with the minimum number of concurrent connections and goes up to maximum number of concurrent connections per node, with interval specified by diff. Any request requiring more concurrent connections will be distributed among multiple client nodes.
 
## Start the server module

```bash
$ node server.js
```

## Client Module

The client module executes the tasks provided by server & returns the response back. Multiple client nodes can be started by executing the client module on multiple nodes.

It contains the following directory structure: 

Files  	      | Description
------------- | -------------
./config.js 	| Configuration file for client module
./client.js  	| Used to start the client module

The configuration file contains a config object which is used by client module to process the test, Here is an example of an config object :

```javascript
{ 
  port: 8001,
  server: {
    ip: '192.168.1.211',
    port: 8000
  },
  executable:  (process.platform == 'win32' ? 'C:\\Program Files\\Apache Software Foundation\\Apache2.2\\bin\\ab.exe' : 'ab'),
}
```
  - `port`      : Port number on which the test will run.
  - `server`    : External IP and Port of server node (need to ensure that client can access the server via the IP and Port provided here).
  - `executable`: This indicates the performance tool to be used for the test.Currently only Apache Benchmark(ab) is supported.

## Start the client module

The Client module is started by executing following command in the command shell.

```bash
$ node client.js
```
Note: User can open the Test Client Dashboard at ‘http://{host}:{port}/dashboard’ where they can provide all the test inputs to start the test.

## Consolidated Report

A report is prepared by analysing multiple log files created for all the input URLs and an average report is generated specifying the details of the test. The report provides the details of each iteration level based on concurrent request separately.

User can drill down to the actual log details by clicking the links on the consolidated report. 

<img src="https://cloud.githubusercontent.com/assets/7745894/3779600/bdcd024a-1983-11e4-9b1b-93dd7aaf1a6d.gif"></img>
To watch video [click here](http://youtu.be/dZkvbf0k6tQ)
