/*
 * Logic for total requests need to be tested
 * Logic for calculating concurrency per client needs to be optimized
 * */
var config;
var fs = require('fs');
var path = require('path');
function Apache (data) {
	var self = this;
	config = data.config;
	if(data.recovery)return;
	var params = data.params;
	params.limit = parseInt(params.limit, 10);
	params.concurrency = parseInt(params.concurrency, 10);
	
	if (!(params.titles instanceof Array)) {
		params.titles = [ params.titles ];
		params.urls = [ params.urls ];
		params.ctype = [ params.ctype ];
	}
	for(var t=0; t < params.titles.length;t++){
		if(!params.titles[t]){
			params.titles.splice(t,1);
			params.urls.splice(t,1);
			params.ctype.splice(t,1);
		}
	}
	var d1 = new Date();
	console.log('normal test');
	params.count = 0;
	params.test_name += '-'+ d1.toJSON() ;
	params.length = params.urls.length;
	self.params = params;	
	self.started = false;	
	fs.mkdirSync(__dirname + '/reports/' + params.test_name);
	fs.mkdirSync(__dirname + '/reports/' + params.test_name +'/logs');
	fs.writeFileSync(__dirname + '/reports/' + params.test_name + '/test.input', JSON.stringify(params), 'UTF-8');
	fs.writeFileSync(__dirname + '/reports/' + params.test_name + '.test','', 'UTF-8');
}

Apache.prototype.start = function () {
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

Apache.prototype.init_client = function (clientsCount) {
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
	data.ctype = params.ctype[params.count];
	var d1 = new Date();
	data.startTime = d1.toJSON();
	fs.writeFile(__dirname + '/reports/' + params.test_name + '/currentstatus.stat', JSON.stringify(params), 'UTF-8',function(){
		params.count += 1;
		self.io.sockets.in(data.test_name).emit('start', data);
	});
	
}

Apache.prototype.save = function (data, client) {
	var self = this;
	var params = data.params;
	var d1 = new Date();
	params.endTime = d1.toJSON();
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
			self.extract(filepath, filename, params);
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

Apache.prototype.recovery = function () {
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

Apache.prototype.restart = function (test_name) {
	var self = this;
	self.started = true;
	console.log('restarting test for '+test_name);
	var test_dir = __dirname + '/reports/' + test_name + '/';
	if(fs.existsSync(test_dir+'/currentstatus.stat')){
		self.params = JSON.parse(fs.readFileSync(test_dir+'/currentstatus.stat','utf-8'));
		self.start();
	}else{
		self.started = false;
		var msg = 'Test'+test_dir+' is already completed or in non recoverable state';
		fs.writeFileSync(test_dir+'/err.log',msg,'utf-8');
		fs.unlinkSync(__dirname + '/reports/' + test_name +'.test');
		console.log(msg);
		self.base.recover_AbortedTest();
	}
}

Apache.prototype.extract = function(filepath, filename, params) {
	
	var data = {
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

Apache.testReports = function(inputDate) {
	var self = this ;
	var html = "<html><head><link href='../dashboard/css/bootstrap.css' rel='stylesheet'><script src='../dashboard/js/jquery-1.10.2.min.js'></script><script type='text/javascript' src='../dashboard/js/bootstrap.js'></script> <script>setTimeout(function(){location.reload();},10000)</script></head><body><div class='container'><h2>Load Test Detailed Reports</h2><br><div class='well'>";
	var testReports = {};
	var activeTests = [];
	var report_folder = __dirname + '/reports/';   // need to show for all test types(ab,cWatch etc)
	var reports = fs.readdirSync(report_folder);
	for (var i in reports){
		if(path.extname(reports[i]) == '.test'){
			activeTests.push(path.basename(reports[i],'.test'));
			continue;
		}
		var strPattern = /(\d{4})\-(\d{2})\-(\d{2})/ig;
		var date = strPattern.exec(reports[i]);
		if (!testReports[date[0]]) testReports[date[0]] = [];
		testReports[date[0]].push(reports[i]);
	}
	if(inputDate && testReports[inputDate]){
		html +='<h4 >Tests Run on '+inputDate+' </h4><ol>';
		for(var z in testReports[inputDate]){
			html += '<li><a href=/reports/?test_type=ab&cloudWatch=true&couchDb=true&test_name='+testReports[inputDate][z]+' target=_blank>'+testReports[inputDate][z]+'</a></li>';
		}
		html+='<hr></ol>';
		html+='</div></div></body>';
		return html;
	}
	for(var k in testReports){
		html +='<h4 >Tests Run on '+k+' </h4><ol>';
		for(var z in testReports[k]){
			html += '<li><a href=/reports/?test_type=ab&cloudWatch=true&couchDb=true&test_name='+testReports[k][z]+' target=_blank>'+testReports[k][z]+'</a></li>';
		}
		html+='<hr></ol>';
	}
	html+='</div><br>';
	if(activeTests.length > 0){
		html += '<div class="well"><br><h4>Active Tests</h4><ol>';
		for(var j in activeTests){
			html += '<li><a href=/reports/?test_type=ab&cloudWatch=true&couchDb=true&test_name='+activeTests[j]+' target=_blank>'+activeTests[j]+'</a></li>';
		}
		html+='</ol></div><br>';
	}
	
	html += '</div></body>';
	return html;
}

Apache.report = function(test_name, cloudWatch, couchDB) {
	var self = this ;
	return self.pageReport(test_name, cloudWatch, couchDB);  //using pagewise reports for now, need to use separate parameters for below report 
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
			+"<th>Std. Deviation</th><th>90\% responses Time<th>Max response Time</th><th>HTTP Errors (in %)</th><th>Total Failed Requests</th>"
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
			avg['errors'] = ((avg['errors'] / requests*count)*100).toFixed(2);
			
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

Apache.pageReport = function(test_name, cloudWatch, couchDB) {
	var self = this;
	var avg;
	var testCompleted = false;
	var html= '<html><head><link href="../dashboard/css/bootstrap.css" rel="stylesheet"><script src="../dashboard/js/jquery-1.10.2.min.js"></script><script src="../dashboard/js/highcharts.js"></script><script type="text/javascript" src="../dashboard/js/bootstrap.js"></script><style>* {font-family:Arial,Helvetica,sans serif;font-size:10pt;} h1 {font-size:200%;} table {padding-bottom:25px;} table caption {font-weight:bold;font-size:120%;} td,th {border:1px solid #eee} th {background-color:#eee}</style></head><body><center><div style="width:95%"; ><h1>Test results for '+test_name+'</h1>\n';
	
	var test_folder = __dirname + '/reports/' + test_name + '/';	
	var cloudreports = null;
	var couchreports = null;
	if(cloudWatch){
		var cloud_folder = __dirname+'/../cloudwatch/reports/' + test_name+'/';
		if(fs.existsSync(cloud_folder)){
			var cloud_files = fs.readdirSync(cloud_folder);	
			cloudreports = {};
			for (var b in cloud_files) {
				var cfile = cloud_folder + cloud_files[b];
				if (fs.existsSync(cfile) && path.extname(cfile) == '.json') {
					var obj = JSON.parse(fs.readFileSync(cfile));
					var title = obj.title;
					if (!cloudreports[title]) cloudreports[title] = {};
					if (!cloudreports[title]['cseries']) cloudreports[title]['cseries'] = {};
					if (!cloudreports[title]['cseries']['cpuAvg']) cloudreports[title]['cseries']['cpuAvg'] = [];
					if (!cloudreports[title]['cseries']['cpuMin']) cloudreports[title]['cseries']['cpuMin'] = [];
					if (!cloudreports[title]['cseries']['cpuMax']) cloudreports[title]['cseries']['cpuMax'] = [];
					if (!cloudreports[title]['cseries']['ramAvg']) cloudreports[title]['cseries']['ramAvg'] = [];
					if (!cloudreports[title]['cseries']['ramMin']) cloudreports[title]['cseries']['ramMin'] = [];
					if (!cloudreports[title]['cseries']['ramMax']) cloudreports[title]['cseries']['ramMax'] = [];
					if (!cloudreports[title]['category']) cloudreports[title]['category'] = [];
					cloudreports[title]['category'].push(obj.concurrency);
					cloudreports[title]['cseries']['cpuAvg'].push(obj.CPUaverage);
					cloudreports[title]['cseries']['cpuMin'].push(obj.CPUminimum);
					cloudreports[title]['cseries']['cpuMax'].push(obj.CPUmaximum);
					cloudreports[title]['cseries']['ramAvg'].push(obj.RAMaverage);
					cloudreports[title]['cseries']['ramMin'].push(obj.RAMminimum);
					cloudreports[title]['cseries']['ramMax'].push(obj.RAMmaximum);
				}
			}
		}
	}
	if(couchDB){
		var couch_folder = __dirname+'/../couchdbTest/reports/' + test_name+'/';
		if(fs.existsSync(couch_folder)){
			var couch_files = fs.readdirSync(couch_folder);
			couchreports = {};
			for (var b in couch_files) {
				var cufile = couch_folder + couch_files[b];
				if (fs.existsSync(cufile) && path.extname(cufile) == '.json') {
					var obj = JSON.parse(fs.readFileSync(cufile));
					var title = obj.title;
					if (!couchreports[title]) couchreports[title] = {};
					if (!couchreports[title]['cseries']) couchreports[title]['cseries'] = {};
					if (!couchreports[title]['cseries']['Mean']) couchreports[title]['cseries']['Mean'] = [];
					if (!couchreports[title]['cseries']['Min']) couchreports[title]['cseries']['Min'] = [];
					if (!couchreports[title]['cseries']['Max']) couchreports[title]['cseries']['Max'] = [];
					if (!couchreports[title]['category']) couchreports[title]['category'] = [];
					couchreports[title]['category'].push(obj.concurrency);
					couchreports[title]['cseries']['Mean'].push(obj.meanRequest);
					couchreports[title]['cseries']['Min'].push(obj.minReq);
					couchreports[title]['cseries']['Max'].push(obj.maxReq);
				}
			}
		}
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
	
	if(fs.existsSync(test_folder+'/currentstatus.stat')){
		var progressImg = '<img alt="" src="data:image/gif;base64,R0lGODlhEAAQAPQAAP///wAAAPj4+Dg4OISEhAYGBiYmJtbW1qioqBYWFnZ2dmZmZuTk5JiYmMbGxkhISFZWVgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh/hpDcmVhdGVkIHdpdGggYWpheGxvYWQuaW5mbwAh+QQJCgAAACwAAAAAEAAQAAAFUCAgjmRpnqUwFGwhKoRgqq2YFMaRGjWA8AbZiIBbjQQ8AmmFUJEQhQGJhaKOrCksgEla+KIkYvC6SJKQOISoNSYdeIk1ayA8ExTyeR3F749CACH5BAkKAAAALAAAAAAQABAAAAVoICCKR9KMaCoaxeCoqEAkRX3AwMHWxQIIjJSAZWgUEgzBwCBAEQpMwIDwY1FHgwJCtOW2UDWYIDyqNVVkUbYr6CK+o2eUMKgWrqKhj0FrEM8jQQALPFA3MAc8CQSAMA5ZBjgqDQmHIyEAIfkECQoAAAAsAAAAABAAEAAABWAgII4j85Ao2hRIKgrEUBQJLaSHMe8zgQo6Q8sxS7RIhILhBkgumCTZsXkACBC+0cwF2GoLLoFXREDcDlkAojBICRaFLDCOQtQKjmsQSubtDFU/NXcDBHwkaw1cKQ8MiyEAIfkECQoAAAAsAAAAABAAEAAABVIgII5kaZ6AIJQCMRTFQKiDQx4GrBfGa4uCnAEhQuRgPwCBtwK+kCNFgjh6QlFYgGO7baJ2CxIioSDpwqNggWCGDVVGphly3BkOpXDrKfNm/4AhACH5BAkKAAAALAAAAAAQABAAAAVgICCOZGmeqEAMRTEQwskYbV0Yx7kYSIzQhtgoBxCKBDQCIOcoLBimRiFhSABYU5gIgW01pLUBYkRItAYAqrlhYiwKjiWAcDMWY8QjsCf4DewiBzQ2N1AmKlgvgCiMjSQhACH5BAkKAAAALAAAAAAQABAAAAVfICCOZGmeqEgUxUAIpkA0AMKyxkEiSZEIsJqhYAg+boUFSTAkiBiNHks3sg1ILAfBiS10gyqCg0UaFBCkwy3RYKiIYMAC+RAxiQgYsJdAjw5DN2gILzEEZgVcKYuMJiEAOwAAAAAAAAAAAA==" />';
		html += '<script>setTimeout(function(){location.reload();},10000)</script><br><center>'+progressImg+'</center>';
	}else{
		testCompleted = true;
	}
	if(Object.keys(reports).length  == 0){
		html += 'No reports found, please wait for test to complete';
		return html;
	}
	html += '<ul id="tabs" class="nav nav-tabs" data-tabs="tabs">'; 
	for (var s in reports) {
		html += '<li><a href="#tab_'+s+'" data-toggle="tab"> '+s+' </a></li>';
	}
	html += '</ul>';
	html += '<div id="my-tab-content" class="tab-content">';
	var requests = obj.params.requests; // test here
	for (var i in reports) {
		title = reports[i];
		html +="<div class='tab-pane' id='tab_"+i+"'><table><tr>"
			+"<th>Concurrency</th><th>Min response Time</th><th>Mean response Time</th><th>Median response Time</th>"
			+"<th>Std. Deviation</th><th>90\% responses Time<th>Max response Time</th><th>HTTP Errors (in %)</th><th>Total Failed Requests (in %) </th>"
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
			avg['errors'] =((avg['errors'] / (requests*count))*100).toFixed(2);
			avg['fail_total'] =((avg['fail_total'] / (requests*count))*100).toFixed(2);
			html+="<tr><td>" + atag;
			
			html+="</td><td>"+avg['min']+"</td><td>"+avg['mean']+"</td><td>"+avg['median']+"</td>"
				+"<td>"+avg['sd']+"</td><td>"+avg['90']+"</td><td>"+avg['max']+"</td><td>"+avg['errors']+"</td><td>"+avg['fail_total']+"</td>"
				+"<td>"+avg['fail_connect']+"</td><td>"+avg['fail_receive']+"</td><td>"+avg['fail_length']+"</td><td>"+avg['fail_exception']+"</td>"
				+"</tr>\n";
		}
		if(testCompleted){
			html +=  self.prepareChart(i, requests, reports, cloudreports, couchreports);
		}
		html += '</table><br><br></div>';
	}
	html += '</div></div></center><script type="text/javascript">jQuery(document).ready(function ($) {$("#tabs").tab();});</script>';
	// console.log(reports);
	// fs.writeFileSync('./reports/' + 'TEST' + '.html', html);
	
	return html;
}

Apache.prepareChart = function(dataPage,requests,report, cloudreports, couchreports) { 
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
	var chart = '';
	chart = "<div id="+dataPage+" '>";
	chart += "<div id="+dataPage+"_report style='max-width: 800px; height: 300px; margin: 0 auto' ></div><script>$('#"+dataPage+"_report'). highcharts({ title: { text: 'Requests :"+requests+"  --  Page "+dataPage+" ', x: -20}, xAxis: { title: { text: ' Concurrency ' },categories: "+JSON.stringify(dataCat)+"}, yAxis: { title: { text: 'Response Time ' }, plotLines: [{ value : 0, width: 1, color: '#808080' }] }, tooltip: { valueSuffix: 'msec' }, legend: { layout: 'vertical', align: 'right', verticalAlign: 'middle', borderWidth: 0 }, series: "+JSON.stringify(cSeries)+" });</script>";
	if(cloudreports){
		var cloudCat = cloudreports[dataPage]['category'];
		var cloudSeries = [];
		for(var m in cloudreports[dataPage]['cseries']){
			var cData = {};
			cData['name'] = m;
			cData['data'] = cloudreports[dataPage]['cseries'][m];
			cloudSeries.push(cData);
		}
		
		chart += "<div id="+dataPage+"_cloudReport style='max-width: 800px; height: 300px; margin: 0 auto' ></div><script>$('#"+dataPage+"_cloudReport'). highcharts({ title: { text: 'Requests :"+requests+"  --  Page "+dataPage+" ', x: -20}, xAxis: { title: { text: ' Concurrency ' },categories: "+JSON.stringify(cloudCat)+"}, yAxis: { title: { text: ' CPU & RAM Utilization ' }, plotLines: [{ value : 0, width: 1, color: '#808080' }],min:0,max:100 }, tooltip: { valueSuffix: '%' }, legend: { layout: 'vertical', align: 'right', verticalAlign: 'middle', borderWidth: 0 }, series: "+JSON.stringify(cloudSeries)+" });</script>";
		
	}
	if(couchreports){
		var couchCat = couchreports[dataPage]['category'];
		var couchSeries = [];
		for(var m in couchreports[dataPage]['cseries']){
			var cData = {};
			cData['name'] = m;
			cData['data'] = couchreports[dataPage]['cseries'][m];
			couchSeries.push(cData);
		}
		
		chart += "<div id="+dataPage+"_couchReport style='max-width: 800px; height: 300px; margin: 0 auto' ></div><script>$('#"+dataPage+"_couchReport'). highcharts({ title: { text: 'Requests :"+requests+"  --  Page "+dataPage+" ', x: -20}, xAxis: { title: { text: ' Concurrency ' },categories: "+JSON.stringify(couchCat)+"}, yAxis: { title: { text: ' CouchDb Request Time ' }, plotLines: [{ value : 0, width: 1, color: '#808080' }] }, tooltip: { valueSuffix: 'msec' }, legend: { layout: 'vertical', align: 'right', verticalAlign: 'middle', borderWidth: 0 }, series: "+JSON.stringify(couchSeries)+" });</script>";
		
	}
	chart += "</div><br>";
return chart;
}
module.exports = Apache;
