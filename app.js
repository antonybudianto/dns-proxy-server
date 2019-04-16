'use strict';

let ui = require('./ui/index.js')
let dns = require('native-dns');
let server = dns.createServer();
let async = require('async');

server.on('listening', () => console.log('server listening on', server.address()));
server.on('close', () => console.log('server closed', server.address()));
server.on('error', (err, buff, req, res) => console.error(err.stack));
server.on('socketError', (err, socket) => console.error(err));

server.serve(53);

const googleDns = '8.8.8.8'
let authority = { address: googleDns, port: 53, type: 'udp' };

function proxy(question, response, cb) {
	// console.log('proxying', JSON.stringify(question));

	var request = dns.Request({
		question: question, // forwarding the question
		server: authority,  // this is the DNS server we are asking
		timeout: 1000
	});


	request.on('timeout', function () {
		console.log('Timeout in making request no forwarding', question.name);
	});

	// when we get answers, append them to the response
	request.on('message', (err, msg) => {
		msg.answer.forEach(a => {
				response.answer.push(a);
				// console.log('remote DNS response: ', a)
		});
	});

	request.on('end', cb);
	request.send();
}


function handleRequest(request, response) {
	var question = request.question[0];
	// console.log('request from', request.address.address, 'for', question.name);
	// console.log('questions', request.question);

	let f = [];

	request.question.forEach(question => {
		let entry = ui.entries.filter(r => new RegExp(r.domain, 'i').exec(question.name));

		// a local resolved host
		if (entry.length) {
			entry[0].records.forEach(record => {
				record.name = question.name;
				record.ttl = record.ttl || 1800;
				if (record.type == 'CNAME') {
					record.data = record.address;
					f.push(cb => proxy({ name: record.data, type: dns.consts.NAME_TO_QTYPE.A, class: 1 }, response, cb));
				}
				response.answer.push(dns[record.type](record));
			});
		} else {
			// forwarding host
			f.push(cb => proxy(question, response, cb));
		}
	});

	async.parallel(f, function() { response.send(); });
}

server.on('request', handleRequest);