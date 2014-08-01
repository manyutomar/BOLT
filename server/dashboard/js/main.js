$(document).ready(function () {
	$('#frmTest').submit(function () {
		var frm = this;
		var qs = $(this).serialize();
		
	//	qs = qs.replace(/[^&]+=\.?(?:&|$)/g, ''); // Just to remove empty fields
		
		$.ajax({
			url: '/start',
			type: 'POST',
			data: qs,
			success: function (res) {
				// res.reportId;
				
				reportLink = '/reports/?test_name=' + frm.elements['test_name'].value + '&test_type=' + frm.elements['test_type'].value;
				//$('#viewReport').attr('href', reportLink).show();
			}
		});
		
		return false;
	});
	
	var tblPages = $('#pages')[0];
	$('#addMore').bind('click', function () {
		tr = tblPages.rows[tblPages.rows.length - 1];
		tbody = $(tr).closest('tbody');
		tr = $(tr).clone();
		tbody.append(tr);
		$(tr).find('input').val('');
		tblPages.parentNode.scrollTop = tblPages.parentNode.scrollHeight;
	});
	
	$('#pages').delegate('button.close', 'click', function () {
		var tr = this.parentNode.parentNode;
		if (tblPages.rows.length > 1) tblPages.deleteRow(tr.rowIndex);
	});
	
	$('#stop').bind('click', function () {
		frm = $('#frmTest')[0];
		var data = {
			test_name: frm.elements['test_name'].value
		};
		socket.emit('abort', data);
		console.log('Abort');
	});
	
	// f = $('#frmTest')[0];
	// f[1].value = 'localhost'
	// f[2].value = 'http://localhost'
	// f[3].value = '100'
	// f[4].value = '50'
	// f[5].value = '100'
	// f[10].value = 'http://localhost:89/'
	// f[11].value = 'home'
});

var socket = io.connect('/browser');
socket.on('connect', function (data) {
	
});

socket.on('status', function (data) {
	$('#status').append('<b>Message:</b>\t' + data.msg + '\r\n');
	$('#progress').scrollTop($('#progress')[0].scrollHeight);
});

socket.on('progress', function (data) {
	$('#status').append('<b title="'+ data.client.ip +'">Client (' + data.client.id + '):</b>\t' + data.msg + '\r\n')
	$('#progress').scrollTop($('#progress')[0].scrollHeight);
});

socket.on('TEST', function (data) {
	console.log(data)
});

socket.on('start', function (data) {
	console.log(data);
});
