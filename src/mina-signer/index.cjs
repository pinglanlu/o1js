// this file is a wrapper for supporting commonjs imports

let Client = require('./mina-signer.js');

module.exports = Client.default;
