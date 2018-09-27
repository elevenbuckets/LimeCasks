'use strict';

const Web3 = require('web3');
const net  = require('net');
const os   = require('os');
const path = require('path');

// For web3.eth, "CUE" simply pointing to existing web3 functions.
// the reason to place them under "CUE" is to unify the job queue
// interface regardless the transaction is smart contract related 
// or not. Its "CUE" type is called "Web3"; "contract" is called
// "eth".
//
// web3.eth related conditions are imported with default setups, 
// similar to smart contracts.

const web3EthFulfill = require( __dirname + '/conditions/Web3/Fulfill.js' );
const web3EthSanity  = require( __dirname + '/conditions/Web3/Sanity.js' );
const allConditions  = { ...web3EthSanity, ...web3EthFulfill };
const fs = require('fs');

// Main Class
class Wrap3 {

	constructor(cfpath)
	{
		const __watcher = (cfpath) => {
			console.log("No config found, watcher triggered ...");
			let cfgw = fs.watch(path.dirname(cfpath), (e, f) => {
				console.log(`CastIron::__watcher: got fsevent ${e} on ${f}`);
				if ((e === 'rename' || e === 'change') && f === path.basename(cfpath) && fs.existsSync(cfpath)) {
					console.log("got config file, parsing ...");
					let buffer = fs.readFileSync(cfpath);
					this.configs = JSON.parse(buffer.toString());
					this.networkID = this.configs.networkID;
				}
			})
		}

		// path check
		if (!fs.existsSync(cfpath)) {
			this.networkID = 'NO_CONFIG';
			this.configs = {};
			__watcher(cfpath);
		} else {
			let buffer = fs.readFileSync(cfpath);
			this.configs = JSON.parse(buffer.toString());
			this.networkID = this.configs.networkID;
		}

		this.rpcAddr = this.configs.rpcAddr || null;
		this.ipcPath = this.configs.ipcPath || null;

		this.web3 = new Web3();
                //this.web3.setProvider(new Web3.providers.HttpProvider(this.rpcAddr));

		/*
		// check personal class access via RPC, make sure it does *NOT* work
		let tp = null;

                try {
                        tp = this.web3.personal.listAccounts;
                } catch(err) {
			true;
                }
		
		if (tp !== null) throw("Please disable personal via RPC access");
		*/

    		this.web3.toAddress = address => {
			let addr = String(this.web3.toHex(this.web3.toBigNumber(address)));

        		if (addr.length === 42) {
				return addr
			} else if (addr.length > 42) {
				throw "Not valid address";
			}

        		let pz = 42 - addr.length;
        		addr = addr.replace('0x', '0x' + '0'.repeat(pz));

        		return addr;
		};

    		this.ipc3 = new Web3();
    		//this.ipc3.setProvider(new Web3.providers.IpcProvider(this.ipcPath, net));

		// this.CUE[type][contract][call](...args, txObj)
		// Only web3.eth.sendTransaction requires password unlock.
		this.CUE = { 'Web3': { 'ETH': {'sendTransaction': this.web3.eth.sendTransaction } } };

		// ... Thus the conditions should only need to sanity check or fulfill this function
		Object.keys(allConditions).map( (f) => { if(typeof(this[f]) === 'undefined') this[f] = allConditions[f] } );
	}

	allAccounts = () => { return this.web3.eth.accounts; }

	/*
	ethNetStatus = () => 
	{
		let blockHeight = this.web3.eth.blockNumber;
		let blockTime   = this.web3.eth.getBlock(blockHeight).timestamp;

		return {blockHeight, blockTime};
	}
	*/

	ethNetStatus = () => 
	{
		if (this.web3.net.peerCount === 0 && this.web3.eth.mining === false) {
			return {blockHeight: 0, blockTime: 0, highestBlock: 0};
		}

		let sync = this.web3.eth.syncing;

		if (sync === false) {
			let blockHeight = this.web3.eth.blockNumber;
			let blockTime   = this.web3.eth.getBlock(blockHeight).timestamp;

			return {blockHeight, blockTime, highestBlock: blockHeight};
		} else {
			return {blockHeight: sync.currentBlock, blockTime: this.web3.eth.getBlock(sync.currentBlock).timestamp, highestBlock: sync.highestBlock};
		}
	}

	addrEtherBalance = addr => { return this.web3.eth.getBalance(addr); }

	unlockViaIPC = passwd => addr => 
	{
                const __unlockToExec = (resolve, reject) => {
                        this.ipc3.personal.unlockAccount(addr, passwd, 120, (error, result) => {
                                if (error) {
                                        reject(error);
                                } else if (result != true) {
                                        setTimeout( () => __unlockToExec(resolve, reject), 500 );
                                } else {
                                        resolve(true);
                                }
                        });
                };

                return new Promise(__unlockToExec);
        }

	configured = () => {
		if (this.networkID === 'NO_CONFIG') {
			return false;
		} else {
			return true;
		}
	}

	connected = () => {
		if (!this.configured()) return false;

		let live;
		try {
		        live = this.web3 instanceof Web3 && this.web3.net._requestManager.provider instanceof Web3.providers.HttpProvider;
			this.web3.net.listening
		} catch(err) {
			live = false;
		}

		return live;
	}

	connectRPC = () => {
                const __connectRPC = (resolve, reject) => {
                        try {
                                if (
                                    this.web3 instanceof Web3
                                 && this.web3.net._requestManager.provider instanceof Web3.providers.HttpProvider
                                ) {

					if (this.networkID === 'NO_CONNECTION') this.networkID = this.configs.networkID; // reconnected
                                        if (this.web3.version.network != this.networkID) {
                                                throw(`Connected to network with wrong ID: wants: ${this.networkID}; geth: ${this.web3.net.version}`);
                                        }

                                        resolve(true);
                                } else if (this.web3 instanceof Web3) {
                                        this.web3.setProvider(new Web3.providers.HttpProvider(this.rpcAddr));
					
					if (this.networkID === 'NO_CONNECTION') this.networkID = this.configs.networkID; // reconnected
					if (this.web3.version.network != this.networkID) {
                                                throw(`Connected to network with wrong ID: wants: ${this.networkID}; geth: ${this.web3.net.version}`);
                                        }

                                        resolve(true);
                                } else {
                                        reject(false);
                                }
                        } catch (err) {
                                console.log(err);
                                reject(false);
                        }
                }

                return new Promise(__connectRPC);
        }

        connectIPC = () => {
                const __connectIPC = (resolve, reject) => {
                        try {
                                if (
                                    this.ipc3 instanceof Web3
                                 && this.ipc3.net._requestManager.provider instanceof Web3.providers.IpcProvider
                                ) {
                                        resolve(true);
                                } else if (this.ipc3 instanceof Web3) {
                                        this.ipc3.setProvider(new Web3.providers.IpcProvider(this.ipcPath, net));
                                        resolve(true);
                                } else {
                                        reject(false);
                                }
                        } catch (err) {
                                console.log(err);
                                reject(false);
                        }
                }

                return new Promise(__connectIPC);
        }

	connect = () => {
		let stage = Promise.resolve();

		stage = stage.then(() => {
			return this.connectRPC();
		})
		.then((rc) => {
		        if (rc) {	
				return this.connectIPC();
			} else {
				throw("no connection");
			}
		})
		.catch((err) => {
			this.networkID = 'NO_CONNECTION'; 
			return Promise.resolve(false); 
		});

		return stage;	
	}

	closeIPC = () =>
        {
                const __closeIPC = (resolve, reject) => {
			try {
	                        if (
	                            this.ipc3 instanceof Web3
	                         && this.ipc3.net._requestManager.provider instanceof Web3.providers.IpcProvider
	                        ) {
	                                console.log("Shutdown ipc connection!!!");
	                                resolve(this.ipc3.net._requestManager.provider.connection.destroy());
	                        } else if (this.ipc3 instanceof Web3) {
	                                console.log("Still pending to shutdown ipc connection!!!");
	                                setTimeout( () => __closeIPC(resolve, reject), 500 );
	                        } 
			} catch (err) {
                                console.log("Uh Oh...... (closeIPC)" + err);
                                reject(false);
                        }
                };

                return new Promise(__closeIPC);
        }

	getReceipt = (txHash, interval) => 
	{
		if (txHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
			return Promise.resolve({transactionHash: txHash});
		}

    		const transactionReceiptAsync = (resolve, reject) => {
        		this.web3.eth.getTransactionReceipt(txHash, (error, receipt) => {
            			if (error) {
                			reject(error);
            			} else if (receipt == null) {
                			setTimeout( () => transactionReceiptAsync(resolve, reject), interval ? interval : 500);
            			} else {
                			resolve(receipt);
            			}
        		});
    		};

		if (Array.isArray(txHash)) {
        		return Promise.all( txHash.map(oneTxHash => this.getReceipt(oneTxHash, interval)) );
    		} else if (typeof txHash === "string") {
        		return new Promise(transactionReceiptAsync);
    		} else {
        		throw new Error("Invalid Type: " + txHash);
    		}
	}

	// txObj is just standard txObj in ethereum transaction calls
	gasCostEst = (addr, txObj) => 
	{
		if (
			txObj.hasOwnProperty('gas') == false
		     || txObj.hasOwnProperty('gasPrice') == false
		) { throw new Error("txObj does not contain gas-related information"); }

		let gasBN = this.web3.toBigNumber(txObj.gas);
                let gasPriceBN = this.web3.toBigNumber(txObj.gasPrice);
                let gasCost = gasBN.mul(gasPriceBN);

		return gasCost;
	}

	byte32ToAddress = (b) => { return this.web3.toAddress(this.web3.toHex(this.web3.toBigNumber(String(b)))); };
	byte32ToDecimal = (b) => { return this.web3.toDecimal(this.web3.toBigNumber(String(b))); };
	byte32ToBigNumber = (b) => { return this.web3.toBigNumber(String(b)); };

	// Web3.eth.filter related functions are not delegated to external objects.
	// type is either 'pending' or 'latest'
	/*
	getTx = type =>
	{
		if (type != 'pending' && type != 'latest') throw new Error(`Invalid getTx type: ${type}`);

		this.web3.eth.filter(type)
	}
	*/
}

module.exports = Wrap3;
