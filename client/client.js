var	config = require('./config'),
		http = require('http'),
		url = require('url'),
		fs = require('fs'),
		querystring = require('querystring'),
		spawn = require('child_process').spawn,
		io = require('socket.io-client');
var postfile = process.argv[2];
console.log(postfile);
function Client () {
	var self = this;
	
	self.report = {}
}

Client.prototype.init = function () {
	var self = this;
	
	self.socket = io.connect(config.server.ip + ':' + config.server.port, {
		'reconnect': true,
		'reconnection delay': 500,
		'max reconnection attempts': 3
	});
	
	self.socket.on('connect', function (data) {
		console.log('Connected to ' + config.server.ip + ':' + config.server.port);
		
		self.socket.emit('intro', {
			'platform': process.platform,
			'port': config.port
		});
	});
	
	self.socket.on('status', function (data) {
		
	});
	
	self.socket.on('disconnect', function (data) {
		console.log('\033[2J');
		console.log('Connection lost, Attempting to re-connect...');
		setTimeout(function(){console.log('.......')},5000);
	});
	
	self.socket.on('start', function (data) {
		self.start(data);
		// console.log(data);
	});
	
	self.socket.on('abort', function (data) {
		console.log('Aborting test')
		self.child.kill();
		self.socket.emit('aborted', { 'msg': 'Process aborted', 'params': self.params});
	});
	
	self.socket.on('TEST', function (data) {
		console.log(data);
	});
}

var client = new Client();
client.init();

Client.prototype.start = function (data) {
	var self = this;
	self.params = data;
	
	console.log('Begining test...for page '+data.title);
	
	var abInput = ['-A','UW_API:HhVp14IM','-n',data.requests,'-c',data.concurrency];
	//var abInput = ['-n',data.requests,'-c',data.concurrency];
	if (data.ctype == 'POST'){
		console.log('posting it');
		abInput.push('-T');
		abInput.push('application/json');
		abInput.push('-p');
		abInput.push(postfile);
		abInput.push('-k');
	}
	abInput.push(data.url);
	console.log(abInput)
	var child = spawn(config.executable, abInput);
	
	self.child = child;
	
	child.stdout.text = '';
	
	child.stdout.on('data', function (data) {
		this.text += data;
	});
	
	child.on('exit', function (code) {
		if(code == null){
			console.log('exiting');
			return;
		}
		self.report = this.stdout.text;
		var report = JSON.stringify({
			'meta':	data.meta,
			'response': self.report,
		});

		self.socket.emit('report', { 'report': self.report, 'params': self.params});
		console.log('Report sent...');
	});

	child.stderr.on('data', function (progress) {
		progress = progress.toString();
		console.log(progress);
		self.socket.emit('progress', { 'msg': progress, 'params': self.params});
	});
	
	self.socket.emit('progress', { msg: 'Started for ' + data.title + ', Concurrency: ' + data.concurrency, params: self.params });
}
