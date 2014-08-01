var config = {	
	port: 8001,
	
	server: {
		ip: '54.209.158.128',
		port: 8000
	},
	
	executable: (process.platform == 'win32' ? 'C:\\Program Files\\Apache Software Foundation\\Apache2.2\\bin\\ab.exe' : 'ab'),
};

module.exports = config;
