const {MessageAttachment, MessageEmbed} = require("discord.js");
const osu = __("app/osu");

const osuCmd = new Command({
    label: "osu",
    aliases: ["oxu", "o"],
    description: "Osu!Command",
    usage: "osu <user | beatmap | mirror | link> [opts...]",
    execute: execute,
    data: {
        modifier: 0x6,
        permissions: []
    }
});

module.exports = osuCmd;

async function execute(args, message) {
    const {channel} = message;
    switch (args.length) {
        case 0:
            let linked = await osu.getUser(message.author.id);
            if (linked.length === 0) {
                await channel.send(`**Usage:** \`${osuCmd.usage}\``);
                return false;
            }
            let [{osu_id}] = linked;
            let pinfo = await playerInfo(osu_id);
            await channel.send(pinfo);
            return !!pinfo;
        case 1:
            switch (args.shift().toLowerCase()) {
                case "profile":
                case "player":
                case "p":
                case "user":
                case "u":
                    let linked = await osu.getUser(message.author.id);
                    if (linked.length === 0) {
                        await channel.send("**Usage:** `osu user <username | user_id | profile_url> [--mode <mode>]`");
                        return false;
                    }
                    let [{osu_id}] = linked;
                    let pinfo = await playerInfo(osu_id);
                    await channel.send(pinfo);
                    return !!pinfo;
                case "beatmap":
                case "bm":
                case "b":
                    await channel.send("**Usage:** `osu beatmap <beatmap_id | beatmap_url> [mode]`");
                    return false;
                case "mirror":
                case "m":
                    await channel.send("**Usage:** `osu mirror <beatmapset_id | beatmapset_url>`");
                    return false;
                case "link":
                case "l":
                    await channel.send("**Usage:** `osu link <user_id | profile_url>`");
                    return false;
                default:
                    await channel.send(`**Usage:** \`${osuCmd.usage}\``);
                    return false;
            }
        case 2:
            switch (args.shift().toLowerCase()) {
                default:
                    await channel.send(`**Usage:** \`${osuCmd.usage}\``);
                    return false;
                case "player":
                case "p":
                case "profile":
                case "user":
                case "u":
                    let pinfo = await playerInfo(args[0]);
                    await channel.send(pinfo || "Unknown player");
                    return !!pinfo;
                case "beatmap":
                case "bm":
                case "b":
                    let binfo = await beatmapInfo(args[0]);
                    await channel.send(binfo);
                    return !!binfo;
                case "mirror":
                case "m":
                    await channel.send("Getting beatmap...");
                    let id = Number.isInteger(+args[0]) ? args[0] : osu.parseLink(args[0]).beatmapset_id;
                    let d = await osu.download(id);
                    if (d.status != 200) {
                        await channel.send((await d.json()).message);
                        return false;
                    }
                    await channel.send(d.url);
                    let size = (+d.headers.get("content-length")) / 1048576; // to Mb
                    if (size > 8) return true;
                    const pattern = /filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?;?/i;
                    let name = d.headers.get("content-disposition").match(pattern)[1];
                    name = decodeURI(name);
                    await channel.send("Attachment", new MessageAttachment(await d.buffer(), name));
                    return true;
                case "link":
                case "l":
                    let res = await link(message.author.id, args.join(" "))
                        .catch(e => {
                            error(e, {label: "Discord"});
                            return false;
                        });
                    await channel.send(res ? `Linked with ${res.username} (${res.id}) successfully` : `Failed to link with ${res.name} (${res.id})`);
                    return !!res;
            }
        default:
            switch (args.shift().toLowerCase()) {
                case "profile":
                case "player":
                case "p":
                case "user":
                case "u":
                    let mode = 0;
                    let pname;
                    for (let i = 0; i < args.length; i++) {
                        if (args[i] === "--mode" || args[i] === "-m") {
                            pname = args.slice(0, i).join(" ");
                            console.log(pname);
                            mode = args.slice(i + 1).join(" ");
                            break;
                        }
                    }
                    let pinfo = await playerInfo(pname, mode);
                    await channel.send(pinfo);
                    return !!pinfo;
                case "beatmap":
                case "bm":
                case "b":
                    if (args.length !== 2) return false;
                    let binfo = await beatmapInfo(args[0], args[1]);
                    await channel.send(binfo);
                    return !!binfo;
                default:
                    await channel.send(`**Usage:** \`${osuCmd.usage}\``);
                    return false;
            }
    }
}

async function link(discordId, player) {
    if ((player + "").indexOf("osu.ppy.sh") !== -1) {
        player = osu.parseLink(player).user_id;
    }
    if (!player) return false;
    try {
        player = await osu.apiV2.user(player, 0);
    } catch (e) {
        Logger.error(e, {label: "Discord"});
        return false;
    }
    return osu.setUser(discordId, player.id).then(_ => player);
}

const formatPlayTime = playTime => {
    let d = Math.floor(playTime / (3600 * 24));
    let h = Math.floor(playTime % (3600 * 24) / 3600);
    let m = Math.floor(playTime % 3600 / 60);
    let hours = Math.round(playTime / 3600);
    return `${d}d ${h}h ${m}m (${hours} hours)`;
}

Number.prototype.pad = function (n = 2) {
    return this.toString().padStart(n, "0");
}
const formatJoinDate = joinDate => {
    let date = new Date(joinDate);
    return `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).pad()}-${date.getUTCDate().pad()} ${date.getUTCHours().pad()}:${date.getUTCMinutes().pad()}:${date.getUTCSeconds().pad()}`
}

const formatNumber = n => typeof n === "number" ? n.toLocaleString("en-US") : n

async function playerInfo(player, mode = 0) {
    player = player + "";
    let m;
    if (!!(m = player.match(/<@!?(\d{17,19})>/))) {
        let linked = await osu.getUser(m[1]);
        if (linked.length === 0) return false;
        let [{osu_id}] = linked;
        player = osu_id;
    } else if (player.indexOf("osu.ppy.sh") !== -1) {
        player = osu.parseLink(player).user_id;
    }
    if (!player) return false;
    mode = osu.getModeId(mode);
    let p;
    try {
        p = await osu.apiV2.user(player, mode);
    } catch (e) {
        Logger.error(e, {label: "Discord"});
        return false;
    }
    mode = osu.getModeId(p.playmode);

    let description = [
        `**User**: ${p.username} (ID: [${p.id}](https://osu.ppy.sh/u/${p.id}))`,
        `**Joined Osu!:** ${formatJoinDate(p.join_date)}`,
        `**Accuracy: ** ${p.statistics.hit_accuracy && p.statistics.hit_accuracy.toFixed(2)}%`,
        `**Level:** ${p.statistics.level.current}`,
        `**Total Play Time:** ${formatPlayTime(p.statistics.play_time)}`,
        "",
        `**Ranked Score:** ${formatNumber(p.statistics.ranked_score)}`,
        `**Total Score:** ${formatNumber(p.statistics.total_score)}`,
        `**PP:** ${Math.floor(p.statistics.pp).toLocaleString("en-US")}`,
        `**Rank:** #${formatNumber(p.statistics.global_rank)}`,
        `**Country rank:** #${formatNumber(p.statistics.rank.country)}`,
        "",
        `**Play Count:** ${formatNumber(p.statistics.play_count)}`,
        `**SS+ plays:** ${formatNumber(p.statistics.grade_counts.ssh)}`,
        `**SS plays:** ${formatNumber(p.statistics.grade_counts.ss)}`,
        `**S+ plays:** ${formatNumber(p.statistics.grade_counts.sh)}`,
        `**S plays:** ${formatNumber(p.statistics.grade_counts.s)}`,
        `**A plays:** ${formatNumber(p.statistics.grade_counts.a)}`
    ].join("\n");
    // const avatar = await osu.getUserAvatar(p.id);
    if (p.avatar_url === "/images/layout/avatar-guest.png") p.avatar_url = "https://osu.ppy.sh" + p.avatar_url;
    let color = (p.profile_colour ?? "#ff66aa").substr(1);
    let img = new URL("https://lemmmy.pw/osusig/sig.php?countryrank&flagshadow&onlineindicator&xpbar&xpbarhex");
    const params = Object.entries({
        colour: "hex" + color,
        pp: 2,
        uname: p.username,
        mode,
    });
    await params.forEach(([k, v]) => img.searchParams.append(k, v))
    img = await fetch(img.toString()).then(_ => _.buffer());
    const name = p.id + ".png";
    img = new MessageAttachment(img, name);
    return new MessageEmbed()
        .attachFiles([img])
        .setColor(parseInt(color, 16))
        .setDescription(description)
        .setThumbnail(p.avatar_url)
        .setImage("attachment://" + name)
        .setAuthor(p.username, p.avatar_url, `https://osu.ppy.sh/users/${p.id}`)
        .setFooter(`Mode: ${osu.getModeName(mode)}`)
}

async function beatmapInfo(b) {
    if ((b + "").indexOf("osu.ppy.sh") !== -1) {
        b = osu.parseLink(b).beatmap_id;
    }
    if (!b) return false;
    b = await osu.apiV2.beatmap(b);
    let s = b.beatmapset;

    let description = [
        `**Beatmap:** ${b.url}`,
        `**Title:** ${s.title}`,
        `**Origin Title:** ${s.source}`,
        `**Artist**: ${s.artist}`,
        `**Creator:** ${s.creator}`,
        `**BPM:** ${s.bpm}`,
        `**Status:** ${s.status}`,
        "",
        `**Version:** ${b.version}`,
        `**Circle size (CS): ** ${b.cs.toFixed(1)}`,
        `**Drain (HP):** ${b.drain.toFixed(1)}`,
        `**Overall (OD)**: ${b.accuracy.toFixed(1)}`,
        `**Approach rate (AR):** ${b.ar.toFixed(1)}`,
        `**Star difficulty:** ${b.difficulty_rating.toFixed(2)} ⭐`
    ].join("\n");
    return new MessageEmbed()
        .setColor(0xff66aa)
        .setDescription(description)
        .setThumbnail(s.covers.list)
        .setImage(s.covers.cover)
}