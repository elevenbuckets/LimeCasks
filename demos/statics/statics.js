'use strict';

const LimeCasks = require('LimeCasks/core/Wrap3.js');
const ciapi = new LimeCasks('/home/jasonlin/.rinkeby/config.json');
const fs = require('fs');

let nodeset = [];

process.on('SIGINT', () => {
	console.log("Thank you for trying LimeCasks!!")
	ciapi.closeIPC();
	fs.writeFileSync('./static-nodes.json', JSON.stringify(nodeset,0,2));
	process.exit(0);
})

ciapi.connectIPC().then((rc) => {
	if (!rc) throw("Not connected");
	if (fs.existsSync('./static-nodes.json')) {
		nodeset = JSON.parse(fs.readFileSync('./static-nodes.json').toString());
		fs.rename('./static-nodes.json', './output/static-nodes.json.' + Date.now(), () => { console.log("backing up existing static-nodes.json..."); })
	}
	return ciapi.ipc3.net._requestManager.provider.connection;
})
.then((socket) => {
	setInterval(() => { socket.write('{"jsonrpc":"2.0","method":"admin_peers","params":[],"id":1}'+"\n"); }, 12000);
	socket.on('data', (buf) => { 
		let data = JSON.parse(buf.toString()); 
		let nodelist = data.result.map((i) => {
			return 'enode://' + i.id + '@' + i.network.remoteAddress;
		})
		console.log(JSON.stringify(nodelist,0,2))
		let _nodes = [ ...nodeset, ...nodelist ];
		nodeset = [ ...new Set(_nodes) ];
	})
})
.catch((err) => {
	console.log(err);
	process.exit(1);
})
