var fs = require('fs');
var	spawn = require('child_process').spawn;
var path = require('path');
var testName = process.argv[2];
var test_folder = '../ab/reports/'+testName+'/';
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
var distinctConc = [];
for (var k in reports) {
	for(j in reports[k]){
		distinctConc.push(reports[k][j]);
	}
}
if(!fs.existsSync(__dirname + '/reports/' + testName)){
	fs.mkdirSync(__dirname + '/reports/' + testName);
}

function cloudWatch (k){
	var self = this;
	var concTest =  distinctConc[k];
	var startTime = '';
	var endTime = '';
	var conc = '';
	var page = '';
	for(var z =0;z<concTest.length;z++){
		var d1 = new Date(concTest[z]['params']['startTime']);
		var d2 = new Date(concTest[z]['params']['endTime']);
		var sTime = d1.getTime();
		var eTime = d2.getTime();
		if(startTime == '' || startTime > sTime){
			startTime = d1;
		}
		if(endTime == '' || endTime < eTime){
			endTime = d2;
		}
		conc = concTest[z]['params']['concurrency'];
		page = concTest[z]['params']['title'];
	}
	if(startTime.getMinutes() == endTime.getMinutes() || startTime.getMinutes()+5 > endTime.getMinutes()){
	//if(startTime.getMinutes() == endTime.getMinutes()){
		//endTime.setMinutes(endTime.getMinutes() + 1);
		endTime.setMinutes(startTime.getMinutes()+5);
	}
	startTime = startTime.toJSON();
	endTime = endTime.toJSON();
	console.log('start : '+startTime+'  et1 : '+endTime);
	var child = spawn('mon-get-stats', [
		'CPUUtilization',
		'-start-time',
		startTime,
		'-end-time',
		endTime,
		'-period',
		3600,
		'-statistics',
		'Average,Minimum,Maximum',
		'-namespace',
		'AWS/EC2',
		'-dimensions',
		'InstanceId=i-11408c3f'
	]);
	
	self.child = child;
	
	child.stdout.cpuText = '';
	
	child.stdout.on('data', function (data) {
		console.log('data '+data);
		this.cpuText += data;
	});
	
	child.on('exit', function (code) {
		if(code == null){
			console.log('exiting');
			return;
		}
		console.log('CPU done');
		
		self.CPUreport = this.stdout.cpuText;	
		console.log(self.CPUreport);
		var strPatternCPU =/(\d{4})\-(\d{2})\-(\d{2})\s*(\d{2})\:(\d{2})\:(\d{2})\s*([\d\.]+)\s*([\d\.]+)\s*([\d\.]+)/ig ;	
		var cpuResponseData = strPatternCPU.exec(self.CPUreport);
		console.log(cpuResponseData);
		var cloudData = {
			'concurrency' : conc,
			'title'  : page,
			'startTime' : startTime,
			'endTime': endTime,
			'CPUaverage': parseFloat(cpuResponseData[7]),
			'CPUminimum': parseFloat(cpuResponseData[8]),
			'CPUmaximum': parseFloat(cpuResponseData[9])
			};
		console.log('Starting RAM Test');
		
		var child2 = spawn('mon-get-stats', [
			'MemUsage',
			'-start-time',
			startTime,
			'-end-time',
			endTime,
			'-period',
			3600,
			'-statistics',
			'Average,Minimum,Maximum',
			'-namespace',
			'EC2/Memory',
			'-dimensions',
			'InstanceId=i-11408c3f'
		]);
		self.child2 = child2;
	
		child2.stdout.ramText = '';
		
		child2.stdout.on('data', function (data) {
			console.log('data '+data);
			this.ramText += data;
		});
		
		child2.on('exit', function (code) {
			if(code == null){
				console.log('exiting');
				return;
			}
			console.log('RAM done');
			self.RAMreport = this.stdout.ramText;	
			var strPatternRAM =/(\d{4})\-(\d{2})\-(\d{2})\s*(\d{2})\:(\d{2})\:(\d{2})\s*([\d\.]+)\s*([\d\.]+)\s*([\d\.]+)/ig ;	
			var ramResponseData = strPatternRAM.exec(self.RAMreport);
			cloudData['RAMaverage'] = parseFloat(ramResponseData[7]);
			cloudData['RAMminimum'] = parseFloat(ramResponseData[8]);
			cloudData['RAMmaximum'] = parseFloat(ramResponseData[9]);
			var filename = 'cloudWatch_'+page+'_'+conc;
			var dir = __dirname + '/reports/' + testName+'/' + filename + '.json';
			fs.writeFileSync(dir, JSON.stringify(cloudData));
			console.log('Report written...for '+filename);
			k++;
			if(k < distinctConc.length){
				cloudWatch(k);
			}else{
				console.log('completed');
			}	
		});
		child2.stderr.on('data', function (progress) {
			progress = progress.toString();
			console.log(progress);
		});
	});

	child.stderr.on('data', function (progress) {
		progress = progress.toString();
		console.log(progress);
	});
}
cloudWatch(0);
//console.log(reports);
//console.log(distinctConc);
