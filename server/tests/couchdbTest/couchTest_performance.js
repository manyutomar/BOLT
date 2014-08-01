var http = require('http');
var fs = require('fs');
var stime = new Date();
var testname = process.argv[2] || 'couchTest_'+stime.toJSON();
fs.mkdirSync(__dirname + '/'+testname);
fs.mkdirSync(__dirname+'/'+testname + '/logs');
function couchStats(){
	console.log('Starting');
	var result = '';
	var d1 = new Date();
	var couch_req = http.request({
		"host": "10.1.4.206", 
		"auth":"junit:junit",
		"port": 5984,
		"headers":{"User-Agent":  "NodeJS HTTP Client"},
		"method": "GET",
		"path": "/_stats?range=60"
		}, function(res) {
			res.setEncoding('utf8');
			res.on('data', function (chunk) {
				result += chunk;
			});
			res.on('end', function () {
				console.log('incoming data');
				fs.writeFile(__dirname+'/'+testname + '/logs/'+d1.toJSON(), result, 'UTF-8', function (err) {
					console.log('response saved');
					setTimeout(function(){
						couchStats();
					},60000);
				});
			});
	});
	couch_req.end();
	couch_req.on('error', function(e) {
		console.error(e);
	});
}
couchStats();
