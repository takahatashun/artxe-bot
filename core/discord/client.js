const {join} = require('path');
const {Client} = require('discord.js');
const {config, shell, logger} = process.global;
module.exports = async () => {
	const client = new Client();
	return (async () => 
		config.discord["bot-token"] || 
		shell.asyncAsk("Config bot-token is empty, please input bot token here: ")
	)()
	.then(token => client.login(token))
	.then(token => {
		process.global.discord = {
			token: token,
			client: client
		};
		return client;
	});
};