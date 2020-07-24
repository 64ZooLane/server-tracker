const { Client, MessageEmbed } = require("discord.js");
const client = new Client();
const { accessSync, constants, readFileSync, writeFileSync } = require("fs");
const status = require("minecraft-server-util");
const moment = require("moment");

const defaultConfig = {
    prefix: "-",
    category: "",
    permission: "Administrator",
    updatedelay: 5,
    servers: []
}

let config, token;

loadConfig("./config.json", defaultConfig);
loadConfig("./token.json", { "token": "" });

client.login(token).catch((e) => { console.error(e.toString()); process.exit(); });

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);
    update();    
})

client.on("message", async message => {

    if (message.author.bot || message.author.id == client.user.id) return;
    if (!message.content.startsWith(config.prefix)) return;
    if (!message.channel.type == "text") return;

    let args = message.content.trim().split(/ +/g);
    let cmd = args[0].slice(config.prefix.length).toLowerCase();

    if (cmd == "help") {
        if (!message.member.permissions.has(config.permission.toUpperCase(), true)) return;
        let description = [
            "**help** - Display all available commands",
            "**config** - Display the current config settings",
            "**set <key> <value>** - Set a value in the config",
            "**add <ip>** - Add a server to the tracking list",
            "**remove <ip>** - Remove a server from the tracking list",
            "**list** - Display all tracked servers"
        ]
        let embed = new MessageEmbed()
        .setAuthor("Help Page", message.guild.iconURL())
        .setColor("BLUE")
        .setDescription(description[0] ? description.join("\n") : "No commands found :(")
        .setFooter("Do not include <> it indicates required options");

        return message.channel.send(embed).catch(console.error);
    } else if (cmd == "config") {
        if (!message.member.permissions.has(config.permission.toUpperCase(), true)) return;
        let embed = new MessageEmbed().setColor("BLUE");
        let cfg = Object.entries(config).filter(s => typeof s[1] !== "object").map(s => `**${s[0]}** -> ${s[1] ? `\`${s[1]}\`` : "*Not set*"}`).join("\n");
        return message.channel.send(embed.setDescription(cfg));
    } else if (cmd == "set") {
        let embed = new MessageEmbed().setColor("BLUE");
        if (!message.member.permissions.has(config.permission.toUpperCase(), true)) return;
        if (!args[1] || !args[2]) {
            return message.channel.send(embed.setDescription(`Missing parameters. Refer to \`${config.prefix}help\` for further details`));
        }
        if (!["string", "boolean", "number"].includes(typeof config[args[1].toLowerCase()])) {
            return message.channel.send(embed.setDescription(`No setting for \`${args[1]}\` could be found. Refer to \`${config.prefix}config\` for further details`));
        }
        else {
            if (typeof config[args[1]] !== "object") {
                config[args[1].toLowerCase()] = args.slice(2).join(" ");
                updateConfig("./config.json");
                return message.channel.send(embed.setDescription(`Successfully updated \`${args[1]}\` to \`${args[2]}\``));
            }
            else {
                return message.channel.send(embed.setDescription(`You cannot update this setting!`));
            }
        }
    } else if (cmd == "add") {
        if (!message.member.permissions.has(config.permission.toUpperCase(), true)) return;
        let embed = new MessageEmbed().setColor("BLUE");
        if (!args[1]) {
            return message.channel.send(embed.setDescription(`Missing parameters. Refer to \`${config.prefix}help\` for further details`));
        }
        if (config.servers.filter(s => s.ip.toLowerCase() == args[1].toLowerCase())[0]) {
            return message.channel.send(`The server \`${args[1]}\` is already being tracked!`);
        }
        else {
            config.servers.push({ip: args[1]});
            updateConfig("./config.json");
            return message.channel.send(embed.setDescription(`The server \`${args[1]}\` is now being tracked :thumbsup:`));
        }
    }
    else if (cmd == "remove") {
        if (!message.member.permissions.has(config.permission.toUpperCase(), true)) return;
        let embed = new MessageEmbed().setColor("BLUE");
        if (!args[1]) {
            return message.channel.send(embed.setDescription(`Missing parameters. Refer to \`${config.prefix}help\` for further details`));
        }
        if (!config.servers.filter(s => s.ip.toLowerCase() == args[1].toLowerCase())[0]) {
            return message.channel.send(embed.setDescription(`The server \`${args[1]}\` isn't being tracked!`));
        }
        else {
            config.servers.splice(config.servers.indexOf(config.servers.filter(s => s.ip.toLowerCase() == args[1].toLowerCase())[0]), 1);
            updateConfig("./config.json");
            return message.channel.send(embed.setDescription(`The server \`${args[1]}\` is no longer being tracked :thumbsup:`));
        }
    }
    else if (cmd == "list") {
        if (!message.member.permissions.has(config.permission.toUpperCase(), true)) return;
        let embed = new MessageEmbed().setColor("BLUE")
        .addField("Tracked Servers", config.servers[0] ? `\`${config.servers.map(s => s.ip).join("`, `")}\`` : "None");
        return message.channel.send(embed);
    }
})

function update() {

    let category = client.channels.cache.filter(c => c.type == "category").filter(c => c.id == config.category).first();
    if (category) {
        config.servers.forEach(async server => {

            let servername = server.ip.split(".")[server.ip.split(".").length - 2].toLowerCase();
            let serverStatus = await status(server.ip, 25565).catch(() => {});
            if (!serverStatus) return;
            let channel = category.children.find(c => c.name.toLowerCase() == servername);
            let difference;

            if (typeof server.players == "number") {
                if (serverStatus.onlinePlayers < server.players) difference = `| ⬇️(-${server.players - serverStatus.onlinePlayers})`;
                else if (serverStatus.onlinePlayers > server.players) difference = `| ⬆️(+${serverStatus.onlinePlayers - server.players})`;
                else if (serverStatus.onlinePlayers == server.players) difference = "| (0)";
            }
            if (!server.message) config.servers[config.servers.indexOf(server)].message = "";
            config.servers[config.servers.indexOf(server)].players = serverStatus.onlinePlayers;
            if (!server.record || !Array.isArray(server.record)) {
                config.servers[config.servers.indexOf(server)].record = [];
            }
            let recordDate = moment(server.record[1]).fromNow();
            if (!server.average || !Array.isArray(server.average)) {
                config.servers[config.servers.indexOf(server)].average = [];
            }
            if (!server.record || !server.record[0] || server.record[0] < serverStatus.onlinePlayers) {
                config.servers[config.servers.indexOf(server)].record = [serverStatus.onlinePlayers, Date.now()];
            }
            config.servers[config.servers.indexOf(server)].average.unshift(serverStatus.onlinePlayers);
            config.servers[config.servers.indexOf(server)].average = config.servers.filter(s => s == server)[0].average.slice(0, 10);

            let embed = new MessageEmbed()
            .setTitle(server.ip)
            .setColor("BLUE")
            .addField("Currently Online", `${serverStatus.onlinePlayers} ${difference ? difference : ""}`)
            .addField("Average Players", Math.round(server.average.reduce((a, b) => a + b) / server.average.length))
            .addField("Player Record", server.record ? (server.record[0] ? `${server.record[0]} (${recordDate})` : "N/A") : "N/A")
            .addField("MOTD", serverStatus.descriptionText.replace(/§[a-f0-9l-okr]/g, ""));

            if (channel) {
                let message = await client.channels.cache.get(channel.id).messages.fetch(server.message).catch(() => {});
                if (message) message.edit(embed);
                else {
                    channel.send(embed).then(msg => {
                        config.servers[config.servers.indexOf(server)].message = msg.id;
                        updateConfig("./config.json");
                    });
                }
            }
            else if (category.permissionsFor(category.guild.me).has("MANAGE_CHANNELS", true)) {
                channel = await category.guild.channels.create(servername, {permissionOverwrites: category.permissionOverwrites})
                    .then(c => c.setParent(category)).catch(() => {});

                if (channel) {
                    channel.send(embed).then(msg => {
                        config.servers[config.servers.indexOf(server)].message = msg.id;
                        updateConfig("./config.json");
                    });
                }
            }
            else {
                await category.guild.channels.cache.filter(c => c.type == "text")
                    .filter(c => c.permissionsFor(category.guild.me).has("SEND_MESSAGES")).first()
                    .send(":warning: Missing permissions to create channel for " + servername).catch(console.error);
                return process.exit();
            }
        })
    }
    updateConfig("./config.json");
    setTimeout(() => {
        update();
    }, parseInt(config.updatedelay) * 1000)
}

function loadConfig(path, defaultConfig) {
    try {
        accessSync(path, constants.F_OK | constants.R_OK);
        if (path.includes("token")) {
            token = JSON.parse(readFileSync(path).toString()).token;
        }
        else if (path.includes("config")) {
            config = JSON.parse(readFileSync(path).toString());
        }
    }
    catch (e) {
        if (e.code == "ENOENT") {
            try {
                writeFileSync(path, JSON.stringify(defaultConfig, null, 4));
                return loadConfig(path, defaultConfig);
            }
            catch(e) {
                console.error("Unable to write default config to json file");
                return process.exit();
            }
        }
        else {
            console.error(e.toString());
            return process.exit();
        }
    }
}

function updateConfig(path) {
    try {
        accessSync(path, constants.W_OK)
        writeFileSync(path, JSON.stringify(config, null, 4));
    }
    catch (e) {
        console.error("Unable to write config to json file");
        return process.exit();
    }
}
