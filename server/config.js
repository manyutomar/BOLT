var config = {
	executable: (process.platform == 'win32' ? 'C:\\Program Files\\Apache Software Foundation\\Apache2.2\\bin\\ab.exe' : 'ab'),
	
	host: '127.0.0.1',
	port: 8000,
	clients : {},	
	busy: {},
	
	concurrency : {
		min : 1,
		max : 200,
		diff: 50
	},
	
};

module.exports = config;
