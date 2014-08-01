/*
issues:
line 57 - need to pass test name
test name should use unique identifier bcz it can conflict(as it is a user input right now) 
* 
*/

var	config = require('./config');
var	url = require("url");
var	connect = require('connect');
var http = require('http')
var	qs = require('querystring');
var fs = require('fs');
var path = require('path');
var counter = 0;
var client = [];
var test_config;
var io;
var tests = require('./tests');

function Master () {
	var self = this;
	self.class = 'Performance Master';
	self.tests = {};
}


Master.prototype.decide = function (params, response) {
	var self = this;
	
	var Test = tests[params.test_type];
	if (Test) {  
		var data = {
			'params': params,
			'config': config
		}
		var test = new Test(data);
		self.tests[params.test_name] = test;
		test.base = self;
		test.io = self.io;
		test.start()
	}
	response.end();
}
Master.prototype.recovery = function (req,res) {
	var self = this;
	res.writeHead(200, {'content-type': 'text/html'});
	res.write('Recovery Process Initiated');
	master.res = res;
	master.recover_AbortedTest();
}

Master.prototype.recover_AbortedTest = function (test_type,test_name) {
	var self = this
	console.log('Starting Recovery Process');
	if(test_type && test_name){
	//assuming that test_name will always be provided if test_type is given
		if (tests[test_type]) {
			if (test_name in self.tests) {
				if(self.tests[test_name].started == true){
					console.log('Test Cannot be Started');
					return;
				}
				self.tests[test_name].restart(test_name);
			}else{
				console.log('Provided Test Case Not Found, Restarting Recovery Process');
				self.recover_AbortedTest();
			}
		}else{
			console.log('test '+test_type+' is not supported');
		}
	}else{
		/*
		//initiate test recovery for all the supported test systems 
		for (t in tests){
			
		}*/
		console.log('looking for aborted test')
		var rep_folder = __dirname + '/tests/ab/reports/';  // providing location for abtest for now, need to change it
		var Test = tests['ab'];
		var data = {
			'recovery': true,
			'config' : config
		}
		var recovery = false;
		var files = fs.readdirSync(rep_folder);
		for (i in files) {
			file = rep_folder + files[i];
			if (fs.existsSync(file) && path.extname(file) == '.test') {
				var testName = path.basename(file,'.test');
				if (testName in self.tests) {
					if(self.tests[testName].started == true){
						continue;
					}
					self.tests[testName].restart(testName);
					recovery =true;
					break;
				}else{
					var test = new Test(data);
					self.tests[testName] = test;
					test.base = self;
					test.io = self.io
					recovery =true;
					test.restart(testName);
					break;
				}
			}
		}
		var msg = (recovery)?'<br>Found some incomplete Tests, Recovery process started':' <br> No incomplete tests are found';
		console.log(msg);
		if(self.res){
			self.res.end(msg);
		}
	}
}

Master.prototype.init = function () {
	var self = this;
	console.log('Starting Distributed Test FrameWork at : '+config.port);
	var server = connect()
		.use('/view', connect.static(__dirname + '/tests'))
		.use('/dashboard', connect.static(__dirname + '/dashboard'))
		.use('/_recovery',master.recovery)
		.use(router)
		.listen(config.port);

	io = require('socket.io').listen(server);
	
	io.sockets.on('connection', function (socket) {
		socket.on('intro', function (data) {
			var count = Object.keys(config.clients).length + 1;
			client_info = {
				'id': count,
				'ip': socket.handshake.address.address,
				'port': data.port,
				'platform': data.platform,
				'status': 0,
				'socket': socket
			}
			config.clients[socket.id] = client_info;
			sendStatus();
		});
		
		socket.on('disconnect', function () {
			console.log('Client dc');
			if (socket.id in config.busy) {
				console.log('client was busy');
				var test_name = config.busy[socket.id].test_name;
				console.log('Sending abort signal...');
				console.log(master.tests);
				console.log(test_name);
				master.tests[test_name].started = false;  // setting it to false to restart the process after aborted process completed
				io.sockets.in(test_name).emit('abort', {});
				delete config.busy[socket.id];
				console.log(master.tests);
				sendStatus();
				//process.nextTick(function(){master.recover_AbortedTest('ab',test_name)}); 	// passing the test name for now, should be stored in client
			}else{
				console.log('client was not busy');
				delete config.clients[socket.id];
				sendStatus();	
			}
		});
		
		socket.on('report', function (data) {
			var client;
			if (socket.id in config.busy) client = config.busy[socket.id];
			if (!client) return;
			client.socket.leave(data.params.test_name);
			config.clients[socket.id] = client;
			delete config.busy[socket.id];
			if (data.params.test_name in self.tests) {
				self.tests[data.params.test_name].save(data, client);
			}
			sendStatus();
		});
		
		socket.on('aborted', function (data) {
			var client;
			if (socket.id in config.busy) client = config.busy[socket.id];
			if (!client) return;
			client.socket.leave(data.params.test_name);
			config.clients[socket.id] = client;
			delete config.busy[socket.id];
			sendStatus();
			master.recover_AbortedTest('ab',data.params.test_name);
		});
		
		socket.on('progress', function (data) {
			var client;
			if (socket.id in config.busy) client = config.busy[socket.id];
			console.log(client.id + ': ' + data.msg);
			data['client'] = {
				'id': client.id,
				'ip': client.ip,
				'port': client.port,
				'platform': client.platform
			};
			io.of('/browser').emit('progress', data);
		});
	});
	
	io.of('/browser').on('connection', function (socket) {
		sendStatus();			
		socket.on('abort', function (data)	 {
			console.log('Sending abort signal...');
			io.sockets.in(data.test_name).emit('abort', {});
			delete self.tests[data.test_name];
		});
		
	});

	io.configure( function (){
		io.enable('browser client etag');
		io.set('log level', 1);
		io.set('transports', ['websocket', 'flashsocket', 'htmlfile', 'xhr-polling', 'jsonp-polling']);
	});
	
	self.io = io;
	//self.recover_AbortedTest();   // do not start recovery at server startup as clients are not available
}

function router (request, response, next) {
	var self = this;
	
	var query;
	var url_parts = url.parse(request.url, true);
	query = url_parts.query;
	
	if (request.method == 'POST') {
		var body = '';
		request.on('data', function (data){
			body += data;
		});
		
		request.on('end', function () {
			body = qs.parse(body);
			switch (url_parts.pathname) {
				case '/start':
					master.decide(body, response);
					break;
				default:
					response.write('No operation.');
					response.end();
			}
		});
	} else {
		switch (url_parts.pathname) {
			case '/':
				response.writeHead(302, {'Location': '/dashboard'});
				response.end();
				break;
			case '/reports':
				response.writeHead(200, {'content-type': 'text/html'});
				var Test = tests['ab'];
				var html = Test.testReports(query.date); 
				response.write(html);
				response.end();
				break;
			case '/reports/':
				response.writeHead(200, {'content-type': 'text/html'});
				var html = '';
				if(query.test_type && query.test_name){
					var Test = tests[query.test_type];
					html = Test.report(query.test_name,query.cloudWatch,query.couchDb);
					response.write(html);
					response.end();
				} else {
					response.writeHead(302, {'Location': '/reports'});
					response.end();
				}
				break;
			default:
				response.writeHead(404, {'content-type': 'text/html'});
				response.end('<h1>404: Not Found</h1>');
		}
	}
}

function sendStatus(){
	var status = 'Status (Free-Busy): ' + Object.keys(config.clients).length + '-' + Object.keys(config.busy).length;
	console.log(status);
	io.of('/browser').emit('status', {msg: status});	
}
var master = new Master();
master.init();
