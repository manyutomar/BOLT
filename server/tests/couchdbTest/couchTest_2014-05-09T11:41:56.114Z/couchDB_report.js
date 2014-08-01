var http = require('http');
var fs = require('fs');
var path = require('path');
var stime = new Date();
var testname = process.argv[2] ;
var couchDir = __dirname+'/logs/';
var testDir = '../../cloudwatch/reports/'+testname+'/';
if(!fs.existsSync(testDir)){
	console.log('Could not found test dir in cloudWatch Tests'+testDir);
	process.exit();
}
if(!fs.existsSync('../reports/' + testname)){
	fs.mkdirSync('../reports/' + testname);
}
var couchfiles = fs.readdirSync(couchDir);
var testFiles = fs.readdirSync(testDir);

function parseCouchLogs(k){
	var file = testDir + testFiles[k];
	var obj = JSON.parse(fs.readFileSync(file));
	var conc = obj.concurrency;
	var title = obj.title;
	var sTime = new Date(obj.startTime);
	var eTime = new Date(obj.endTime);
	var testSet = [];
	var fileSet = [];
	for(var m=0;m<couchfiles.length;m++){
		var ftime = new Date(couchfiles[m]);
		if(sTime.getTime() < ftime.getTime() && eTime.getTime()+60000 > ftime.getTime()){
			fileSet.push(couchfiles[m]);
			var couchObj = JSON.parse(fs.readFileSync(couchDir+couchfiles[m]));
			testSet.push(couchObj);
		}
	}
	var meanRequest = 0;
	var minReq = 9999999;
	var maxReq = null;
	for(var v=0;v<testSet.length;v++){
		meanRequest = (testSet[v]['couchdb']['request_time']['mean'])?(meanRequest != 0)?(parseFloat(testSet[v]['couchdb']['request_time']['mean'])+meanRequest)/2:parseFloat(testSet[v]['couchdb']['request_time']['mean']):meanRequest;
		minReq =  (testSet[v]['couchdb']['request_time']['min'] && parseFloat(testSet[v]['couchdb']['request_time']['min']) < minReq)?parseFloat(testSet[v]['couchdb']['request_time']['min']):minReq;
		maxReq =  (testSet[v]['couchdb']['request_time']['max'] && parseFloat(testSet[v]['couchdb']['request_time']['max']) > maxReq)?parseFloat(testSet[v]['couchdb']['request_time']['max']):maxReq;
	}
	var report = {
		'title' : title,
		'concurrency' : conc,
		'file' : fileSet,
		'meanRequest' : meanRequest,
		'minReq' : minReq,
		'maxReq' : maxReq
	};
	var filename = 'couchTest_'+title+'_'+conc;
	var repdir = '../reports/'+ testname +'/'+ filename + '.json';
	fs.writeFileSync(repdir, JSON.stringify(report));
	console.log('report done for '+filename);
	k++;
	if(k < testFiles.length){
		parseCouchLogs(k);
	}else{
		console.log('Test Completed');
	}
}
parseCouchLogs(0);
