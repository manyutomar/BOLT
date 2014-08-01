var config;
var fs = require('fs');
var path = require('path');
function CloudWatch (data) {
	var self = this;
	var defaults = {
	'-start-time':'2013-12-25T00:00:00',	
	'-end-time':'2013-12-26T00:00:00',	
	'-period':'300',	
	'-namespace':'AWS/EC2',	
	'-dimensions':'InstanceId=i-a0147bdc',	
	'-statistics':'Minimum,Average,Maximum',	
	}
	config = data.config;
	if(data.recovery)return;
	defaults['-start-time'] = data.startTime;
	defaults['-end-time'] = data.endTime;
	defaults['-dimensions'] = 'InstanceId='+data.instanceId
	
	var d1 = new Date();
	console.log('normal test');
	params.count = 0;
	data.test_name += '-'+ d1.toJSON() ;
	//self.c
	self.params = params;		
	fs.mkdirSync(__dirname + '/reports/' + params.test_name);
	fs.mkdirSync(__dirname + '/reports/' + params.test_name +'/logs');
	fs.writeFileSync(__dirname + '/reports/' + params.test_name + '/test.input', JSON.stringify(params), 'UTF-8');
	fs.writeFileSync(__dirname + '/reports/' + params.test_name + '.test','', 'UTF-8');
}

CloudWatch.prototype.start = function () {
	var self = this;
	self.started = true;
	var data = self.params;
	
	config.active = Object.keys(config.clients).length;
	console.log('Active clients: ' + config.active);
	var clientsCount = (parseInt(data.concurrency / config.active) >= config.concurrency.min) ? config.active : parseInt(data.concurrency / config.concurrency.min);
	var concurrency = parseInt(data.concurrency / clientsCount);
	self.params.clients_required = clientsCount;
	self.params.per_client_concurrency = concurrency;
	fs.writeFile(__dirname + '/reports/' + self.params.test_name + '/currentstatus.stat', JSON.stringify(self.params), 'UTF-8',function(){
		if (concurrency > config.concurrency.max || config.active < 1) {
			console.log("Not enough free clients to perform this operation");
			self.started = false;
			return;
		}
		self.init_client(clientsCount);
	});
}

CloudWatch.prototype.init_client = function (clientsCount) {
	var self = this;
	console.log('Clients Required: ' + clientsCount);
	self.report_counter = 0;
	var data = {};
	var params = self.params;
	var i = clientsCount;
	for (id in config.clients) {
		config.busy[id] = config.clients[id];
		config.busy[id]['test_name'] = params.test_name;
		config.busy[id].socket.join(self.params.test_name);
		delete config.clients[id];
		i -= 1; if (i <= 0) break;
	}
	data.test_name = params.test_name;
	data.test_type = params.test_type;
	data.concurrency = params.per_client_concurrency;
	data.requests = params.requests;
	data.url = params.urls[params.count];
	data.title = params.titles[params.count];
	var d1 = new Date();
	data.startTime = d1.toJSON();
	fs.writeFile(__dirname + '/reports/' + params.test_name + '/currentstatus.stat', JSON.stringify(params), 'UTF-8',function(){
		params.count += 1;
		self.io.sockets.in(data.test_name).emit('start', data);
	});
	
}

CloudWatch.prototype.save = function (data, client) {
	var self = this;
	var params = data.params;
	var d1 = new Date();
	var endTime = d1.toJSON();
	var filename = "";
	filename = self.params.requests + '_' + self.params.concurrency + '_' + params.test_name + '_' + params.title + '_' + client.id;
	
	filepath = __dirname  + '/reports/' + params.test_name + '/logs/' + filename + '.txt';
	fs.writeFile(filepath, data.report, 'UTF-8', function (err) {
		if (err) {
			console.log(err);
		} else {
			self.report_counter += 1
			console.log('Report saved... (' + self.report_counter + '/' + self.params.clients_required + ')');
			
			params.concurrency = self.params.concurrency; // To pass total concurrency 
			self.extract(filepath, filename, params, data.startTime, endTime);
			if(self.report_counter >= self.params.clients_required) {
				self.report_counter = 0;
				if(self.params.count < self.params.length) {					
					self.init_client(self.params.clients_required);
				} else {
					self.params.count = 0;
					if (self.params.concurrency < self.params.limit) {
						self.params.concurrency = self.params.concurrency + config.concurrency.diff;
						if (self.params.concurrency > self.params.limit) self.params.concurrency = self.params.limit;
						self.start();
					}else{
						fs.unlinkSync(__dirname + '/reports/' + params.test_name + '.test');
						fs.unlinkSync(__dirname + '/reports/' + params.test_name + '/currentstatus.stat');		
						self.started = false;				
						console.log("Test Completed for "+params.test_name);
						console.log('Looking for incompleted or queued tests');
						self.base.recover_AbortedTest();
					}
				}
			}
		}
	});
}

CloudWatch.prototype.recovery = function () {
	var self = this;     
	rep_folder = __dirname + '/reports/';
	var files = fs.readdirSync(test_folder);
	for (i in files) {
		file = rep_folder + files[i];
		if (fs.existsSync(file) && path.extname(file) == '.test') {
			self.restart(path.basename(file,'.test'));
		}
	}
}

CloudWatch.prototype.restart = function (test_name) {
	var self = this;
	self.started = true;
	console.log('restarting test for '+test_name);
	var test_dir = __dirname + '/reports/' + test_name + '/';
	if(fs.existsSync(test_dir+'/currentstatus.stat')){
		self.params = JSON.parse(fs.readFileSync(test_dir+'/currentstatus.stat','utf-8'));
		self.start();
	}else{
		self.started = false;
		console.log('Test'+test_dir+' is already completed or in non recoverable state');
	}
}

CloudWatch.prototype.extract = function(filepath, filename, params, startTime, endTime) {
	
	var data = {
		'startTime': startTime,
		'endTime': endTime,
		'params': params,
		'found': {
			failed: 0,
			val: 0,
			error: 0,
			p90: 0
		}
	};
		
	data['result'] = {
		'min': 0,
		'mean': 0,
		'sd': 0,
		'median': 0,
		'max': 0,
		'90': 0,
		'fail_connect': 0,
		'fail_receive': 0,
		'fail_length': 0,
		'fail_exception': 0,
		'fail_total': 0,
		'errors': 0
	};
	var res = data['result'];
	
	// inputfile = './logs/' + filename + '.txt';
	
	if (!fs.existsSync(filepath)) {
		console.log('File not found!!!');
		return;
	}
	
	var line = fs.readFileSync(filepath);
	console.log("Processing report: " + filename);
	var strPattern =[];
			strPattern[0] = /Failed requests:\s*(\d+)\s*\n\s*\(Connect:\s*(\d+),\s*Receive:\s*(\d+),\s*Length:\s*(\d+),\s*Exceptions:\s*(\d+)/igm ;
			strPattern[1] = /Total:\s*([\d\.]+)\s*([\d\.]+)\s*([\d\.]+)\s*([\d\.]+)\s*([\d\.]+)/ig ;
			strPattern[2] = /Non(.*):\s*([\d\.]+)/ig ;
			strPattern[3] = /90\%\s*([\d\.]+)/ig ;
	
	var failRequest = strPattern[0].exec(line);

	if (failRequest) {
		res['fail_total']			=	parseFloat(failRequest[1]);	
		res['fail_connect']		=	parseFloat(failRequest[2]);
		res['fail_receive']		=	parseFloat(failRequest[3]);
		res['fail_length']		=	parseFloat(failRequest[4]);
		res['fail_exception']	=	parseFloat(failRequest[5]);
		
		data.found.failed = 1;
	}
	
	var totalStr = strPattern[1].exec(line);
	if (totalStr) {
		
		res['min']		=		parseFloat(totalStr[1]);
		res['mean']		=		parseFloat(totalStr[2]);
		res['sd']		=		parseFloat(totalStr[3]);
		res['median']	=		parseFloat(totalStr[4]);
		res['max']		=		parseFloat(totalStr[5]);
		
		data.found.val = 1;
	}
	
	var err = strPattern[2].exec(line);
	if(err) {
		res['errors']	=		parseFloat(err[2]);
		
		data.found.error = 1;
	}
	
	var found90 = strPattern[3].exec(line);
	if (found90) {
		res['90'] 	=		parseFloat(found90[1]);
		
		data.found.p90 = 1;
	}
	
	dir = __dirname + '/reports/' + params.test_name + '/' + filename + '.json';
	data.params.filename = filename;
	fs.writeFileSync(dir, JSON.stringify(data));
}

CloudWatch.report = function(test_name) {
	var self = this ;
	return self.pageReport(test_name);
	var avg;
	
	var html="<html><head><style>* {font-family:Arial,Helvetica,sans serif;font-size:10pt;} h1 {font-size:200%;} table {padding-bottom:25px;} table caption {font-weight:bold;font-size:120%;} td,th {border:1px solid #eee} th {background-color:#eee}</style></head><body><h1>Test results for "+test_name+"</h1>\n";
	
	test_folder = __dirname + '/reports/' + test_name + '/'
	if(fs.existsSync(test_folder+'/currentstatus.stat')){
		var progressImg = '<img alt="" src="data:image/gif;base64,R0lGODlhEAAQAPQAAP///wAAAPj4+Dg4OISEhAYGBiYmJtbW1qioqBYWFnZ2dmZmZuTk5JiYmMbGxkhISFZWVgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh/hpDcmVhdGVkIHdpdGggYWpheGxvYWQuaW5mbwAh+QQJCgAAACwAAAAAEAAQAAAFUCAgjmRpnqUwFGwhKoRgqq2YFMaRGjWA8AbZiIBbjQQ8AmmFUJEQhQGJhaKOrCksgEla+KIkYvC6SJKQOISoNSYdeIk1ayA8ExTyeR3F749CACH5BAkKAAAALAAAAAAQABAAAAVoICCKR9KMaCoaxeCoqEAkRX3AwMHWxQIIjJSAZWgUEgzBwCBAEQpMwIDwY1FHgwJCtOW2UDWYIDyqNVVkUbYr6CK+o2eUMKgWrqKhj0FrEM8jQQALPFA3MAc8CQSAMA5ZBjgqDQmHIyEAIfkECQoAAAAsAAAAABAAEAAABWAgII4j85Ao2hRIKgrEUBQJLaSHMe8zgQo6Q8sxS7RIhILhBkgumCTZsXkACBC+0cwF2GoLLoFXREDcDlkAojBICRaFLDCOQtQKjmsQSubtDFU/NXcDBHwkaw1cKQ8MiyEAIfkECQoAAAAsAAAAABAAEAAABVIgII5kaZ6AIJQCMRTFQKiDQx4GrBfGa4uCnAEhQuRgPwCBtwK+kCNFgjh6QlFYgGO7baJ2CxIioSDpwqNggWCGDVVGphly3BkOpXDrKfNm/4AhACH5BAkKAAAALAAAAAAQABAAAAVgICCOZGmeqEAMRTEQwskYbV0Yx7kYSIzQhtgoBxCKBDQCIOcoLBimRiFhSABYU5gIgW01pLUBYkRItAYAqrlhYiwKjiWAcDMWY8QjsCf4DewiBzQ2N1AmKlgvgCiMjSQhACH5BAkKAAAALAAAAAAQABAAAAVfICCOZGmeqEgUxUAIpkA0AMKyxkEiSZEIsJqhYAg+boUFSTAkiBiNHks3sg1ILAfBiS10gyqCg0UaFBCkwy3RYKiIYMAC+RAxiQgYsJdAjw5DN2gILzEEZgVcKYuMJiEAOwAAAAAAAAAAAA==" />';
		html += '<script>setTimeout(function(){location.reload();},3000)</script><br><center>'+progressImg+'</center>';
	}else{
		html += '<br><b>Test Completed</b><br>';
	}
	var files = fs.readdirSync(test_folder);
	var reports = {};
	for (i in files) {
		file = test_folder + files[i];
		if (fs.existsSync(file) && path.extname(file) == '.json') {
			obj = JSON.parse(fs.readFileSync(file));
			conc = obj.params.concurrency;
			title = obj.params.title;
			
			if (!reports[conc]) reports[conc] = {};
			if (!reports[conc][title]) reports[conc][title] = [];
			reports[conc][title].push(obj);
		}
	}
	var requests = obj.params.requests; // test here
	
	for (i in reports) {
		conc = reports[i];
		html +="<table><caption>Requests: " + requests + " Concurrency: "+ i +"</caption><tr>"
			+"<th>Page</th><th>Min response Time</th><th>Mean response Time</th><th>Median response Time</th>"
			+"<th>Std. Deviation</th><th>90\% responses Time<th>Max response Time</th><th>HTTP Errors</th><th>Total Failed Requests</th>"
			+"<th>Failed - Connect</th><th>Failed - Receive</th><th>Failed - Length</th><th>Failed - Exception</th>"
			+"</tr>\n";
			
		for (j in conc) {
			page = reports[i][j];
			avg = { 'min': 0, 'mean': 0, 'sd': 0, 'median': 0, 'max': 0, '90': 0, 'fail_connect': 0, 'fail_receive': 0, 'fail_length': 0, 'fail_exception': 0, 'fail_total': 0, 'errors': 0 };
			
			atag = page[0].params.title;
			for (k in page) {
				flds = page[k].result;
				for (m in flds) {
					avg[m] += flds[m];
				}
				f = '/view/' + page[k].params.test_type + '/reports/'+test_name+'/logs/' + page[k].params.filename + '.txt';
				atag += '(<a href="'+ f +'" target=\"_blank\">' + (parseInt(k)+1) + '</a>)';
			}
			count = page.length;
			avg['min'] = (avg['min'] / count).toFixed(2);
			avg['max'] = (avg['max'] / count).toFixed(2);
			avg['median'] = (avg['median'] / count).toFixed(2);
			avg['mean'] = (avg['mean'] / count).toFixed(2);
			avg['sd'] = (avg['sd'] / count).toFixed(2);
			
			html+="<tr><td>" + atag;
			
			html+="</td><td>"+avg['min']+"</td><td>"+avg['mean']+"</td><td>"+avg['median']+"</td>"
				+"<td>"+avg['sd']+"</td><td>"+avg['90']+"</td><td>"+avg['max']+"</td><td>"+avg['errors']+"</td><td>"+avg['fail_total']+"</td>"
				+"<td>"+avg['fail_connect']+"</td><td>"+avg['fail_receive']+"</td><td>"+avg['fail_length']+"</td><td>"+avg['fail_exception']+"</td>"
				+"</tr>\n";
		}
	}
	
	// console.log(reports);
	// fs.writeFileSync('./reports/' + 'TEST' + '.html', html);
	
	return html;
}

CloudWatch.pageReport = function(test_name) {
	var self = this;
	var avg;
	var testCompleted = false;
	var html= '<html><head><script src="http://code.jquery.com/jquery-1.10.2.min.js"></script><script src="http://code.highcharts.com/highcharts.js"></script><script src="http://code.highcharts.com/modules/exporting.js"></script><style>* {font-family:Arial,Helvetica,sans serif;font-size:10pt;} h1 {font-size:200%;} table {padding-bottom:25px;} table caption {font-weight:bold;font-size:120%;} td,th {border:1px solid #eee} th {background-color:#eee}</style></head><body><h1>Test results for '+test_name+'</h1>\n';
	
	test_folder = __dirname + '/reports/' + test_name + '/'
	if(fs.existsSync(test_folder+'/currentstatus.stat')){
		var progressImg = '<img alt="" src="data:image/gif;base64,R0lGODlhEAAQAPQAAP///wAAAPj4+Dg4OISEhAYGBiYmJtbW1qioqBYWFnZ2dmZmZuTk5JiYmMbGxkhISFZWVgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh/hpDcmVhdGVkIHdpdGggYWpheGxvYWQuaW5mbwAh+QQJCgAAACwAAAAAEAAQAAAFUCAgjmRpnqUwFGwhKoRgqq2YFMaRGjWA8AbZiIBbjQQ8AmmFUJEQhQGJhaKOrCksgEla+KIkYvC6SJKQOISoNSYdeIk1ayA8ExTyeR3F749CACH5BAkKAAAALAAAAAAQABAAAAVoICCKR9KMaCoaxeCoqEAkRX3AwMHWxQIIjJSAZWgUEgzBwCBAEQpMwIDwY1FHgwJCtOW2UDWYIDyqNVVkUbYr6CK+o2eUMKgWrqKhj0FrEM8jQQALPFA3MAc8CQSAMA5ZBjgqDQmHIyEAIfkECQoAAAAsAAAAABAAEAAABWAgII4j85Ao2hRIKgrEUBQJLaSHMe8zgQo6Q8sxS7RIhILhBkgumCTZsXkACBC+0cwF2GoLLoFXREDcDlkAojBICRaFLDCOQtQKjmsQSubtDFU/NXcDBHwkaw1cKQ8MiyEAIfkECQoAAAAsAAAAABAAEAAABVIgII5kaZ6AIJQCMRTFQKiDQx4GrBfGa4uCnAEhQuRgPwCBtwK+kCNFgjh6QlFYgGO7baJ2CxIioSDpwqNggWCGDVVGphly3BkOpXDrKfNm/4AhACH5BAkKAAAALAAAAAAQABAAAAVgICCOZGmeqEAMRTEQwskYbV0Yx7kYSIzQhtgoBxCKBDQCIOcoLBimRiFhSABYU5gIgW01pLUBYkRItAYAqrlhYiwKjiWAcDMWY8QjsCf4DewiBzQ2N1AmKlgvgCiMjSQhACH5BAkKAAAALAAAAAAQABAAAAVfICCOZGmeqEgUxUAIpkA0AMKyxkEiSZEIsJqhYAg+boUFSTAkiBiNHks3sg1ILAfBiS10gyqCg0UaFBCkwy3RYKiIYMAC+RAxiQgYsJdAjw5DN2gILzEEZgVcKYuMJiEAOwAAAAAAAAAAAA==" />';
		html += '<script>setTimeout(function(){location.reload();},3000)</script><br><center>'+progressImg+'</center>';
	}else{
		testCompleted = true;
	}
	var files = fs.readdirSync(test_folder);	
	var reports = {};
	for (i in files) {
		file = test_folder + files[i];
		if (fs.existsSync(file) && path.extname(file) == '.json') {
			obj = JSON.parse(fs.readFileSync(file));
			conc = obj.params.concurrency;
			title = obj.params.title;
			
			if (!reports[title]) reports[title] = {};
			if (!reports[title][conc]) reports[title][conc] = [];
			reports[title][conc].push(obj);
		}
	}
	
	var requests = obj.params.requests; // test here
	
	for (i in reports) {
		title = reports[i];
		html +="<table><tr>"
			+"<th>Concurrency</th><th>Min response Time</th><th>Mean response Time</th><th>Median response Time</th>"
			+"<th>Std. Deviation</th><th>90\% responses Time<th>Max response Time</th><th>HTTP Errors</th><th>Total Failed Requests</th>"
			+"<th>Failed - Connect</th><th>Failed - Receive</th><th>Failed - Length</th><th>Failed - Exception</th>"
			+"</tr>\n";
			
		for (j in title) {
			page = reports[i][j];
			avg = { 'min': 0, 'mean': 0, 'sd': 0, 'median': 0, 'max': 0, '90': 0, 'fail_connect': 0, 'fail_receive': 0, 'fail_length': 0, 'fail_exception': 0, 'fail_total': 0, 'errors': 0 };
			
			atag = page[0].params.concurrency;
			for (k in page) {
				flds = page[k].result;
				for (m in flds) {
					avg[m] += flds[m];
				}
				f = '/view/' + page[k].params.test_type + '/reports/'+test_name+'/logs/' + page[k].params.filename + '.txt';
				atag += '(<a href="'+ f +'" target=\"_blank\">' + (parseInt(k)+1) + '</a>)';
			}
			count = page.length;
			avg['min'] = (avg['min'] / count).toFixed(2);
			avg['max'] = (avg['max'] / count).toFixed(2);
			avg['median'] = (avg['median'] / count).toFixed(2);
			avg['mean'] = (avg['mean'] / count).toFixed(2);
			avg['sd'] = (avg['sd'] / count).toFixed(2);
			
			html+="<tr><td>" + atag;
			
			html+="</td><td>"+avg['min']+"</td><td>"+avg['mean']+"</td><td>"+avg['median']+"</td>"
				+"<td>"+avg['sd']+"</td><td>"+avg['90']+"</td><td>"+avg['max']+"</td><td>"+avg['errors']+"</td><td>"+avg['fail_total']+"</td>"
				+"<td>"+avg['fail_connect']+"</td><td>"+avg['fail_receive']+"</td><td>"+avg['fail_length']+"</td><td>"+avg['fail_exception']+"</td>"
				+"</tr>\n";
		}
		if(testCompleted){
			html +=  self.prepareChart(i,requests,reports);
		}
	
	}
	
	// console.log(reports);
	// fs.writeFileSync('./reports/' + 'TEST' + '.html', html);
	
	return html;
}

CloudWatch.prepareChart = function(dataPage,requests,report) { 
	var dataCat = [];
	var chartParam = {};
	for (var k in report[dataPage]){
		dataCat.push(k);
		for (var m in report[dataPage][k][0].result){
			if(!chartParam[m])chartParam[m] =[];
			chartParam[m].push(report[dataPage][k][0].result[m]);
		}
	}
	var cSeries = [];
	for (var z in chartParam){
		var sData = {};
		sData['name'] = z;
		sData['data'] = chartParam[z];
		cSeries.push(sData);
	}
		
	var chart = "<div id="+dataPage+" style='min-width: 250px; height: 300px; margin: 0 auto'></div><script>$(function (){$('#"+dataPage+"'). highcharts({ title: { text: 'Requests :"+requests+"  --  Page "+dataPage+" ', x: -20}, xAxis: { title: { text: ' Concurrency ' },categories: "+JSON.stringify(dataCat)+"}, yAxis: { title: { text: 'Response Time ' }, plotLines: [{ value : 0, width: 1, color: '#808080' }] }, tooltip: { valueSuffix: 'msec' }, legend: { layout: 'vertical', align: 'right', verticalAlign: 'middle', borderWidth: 0 }, series: "+JSON.stringify(cSeries)+" });});</script><br>";
	return chart;
}
module.exports = CloudWatch;
