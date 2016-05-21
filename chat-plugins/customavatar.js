/* Custom avatar Plugin
 * by kota/pika
 */
'use strict';
const fs = require('fs');

function reloadCustomAvatars() {
	let path = require('path');
	let newCustomAvatars = {};
	fs.readdirSync('./config/avatars').forEach(function (file) {
		let ext = path.extname(file);
		if (ext !== '.png' && ext !== '.gif')
			return;

		let user = toId(path.basename(file, ext));
		newCustomAvatars[user] = file;
		delete Config.customavatars[user];
	});

	// Make sure the manually entered avatars exist
	for (let a in Config.customavatars) {
		if (typeof Config.customavatars[a] === 'number') {
			newCustomAvatars[a] = Config.customavatars[a];
		} else {
			fs.exists('./config/avatars/' + Config.customavatars[a], function (user, file, isExists) {
				if (isExists)
					Config.customavatars[user] = file;
			}.bind(null, a, Config.customavatars[a]));
		}
		Config.customavatars = newCustomAvatars;
	}
}
reloadCustomAvatars();

if (Config.watchConfig) {
	fs.watchFile('./config/config.js', function (curr, prev) {
		if (curr.mtime <= prev.mtime) return;
		reloadCustomAvatars();
	});
}

const script = function () {
/*
	FILENAME=`mktemp`
	function cleanup {
		rm -f $FILENAME
	}
	trap cleanup EXIT

	set -xe

	timeout 10 wget "$1" -nv -O $FILENAME

	FRAMES=`identify $FILENAME | wc -l`
	if [ $FRAMES -gt 1 ]; then
		EXT=".gif"
	else
		EXT=".png"
	fi

	timeout 10 convert $FILENAME -layers TrimBounds -coalesce -adaptive-resize 80x80\> -background transparent -gravity center -extent 80x80 "$2$EXT"
*/
}.toString().match(/[^]*\/\*([^]*)\*\//)[1];

let pendingAdds = {};

exports.commands = {
	sca: 'customavatar',
	customavatars: 'customavatar',
	customavatar: function (target, room, user) {
		let parts = target.split(',');
		let cmd = parts[0].trim().toLowerCase();

		if (cmd in {'':1, show:1, view:1, display:1}) {
			let message = "";
			for (let a in Config.customavatars)
				message += "<strong>" + Tools.escapeHTML(a) + ":</strong> " + Tools.escapeHTML(Config.customavatars[a]) + "<br />";
			return this.sendReplyBox(message);
		}

		if (!this.can('pban') && !Gold.hasBadge(toId(user.name),'vip')) return false;

		switch (cmd) {
			case 'set':
				let userid = toId(parts[1]);
				let targetUser = Users.getExact(userid);
				let avatar = parts.slice(2).join(',').trim();
				if (!this.can('pban') && Gold.hasBadge(toId(user.name),'vip') && userid !== user.userid) return false;

				if (!userid) return this.errorReply("You didn't specify a user.");
				if (Config.customavatars[userid]) return this.errorReply(userid + " already has a custom avatar.");

				let hash = require('crypto').createHash('sha512').update(userid + '\u0000' + avatar).digest('hex').slice(0, 8);
				pendingAdds[hash] = {userid: userid, avatar: avatar};
				parts[1] = hash;

				if (!targetUser) {
					this.errorReply("Warning: " + userid + " is not online.");
					this.errorReply("If you want to continue, use: /customavatar forceset, " + hash);
					return;
				}

			/* falls through */
			case 'forceset':
				if (user.avatarCooldown && !this.can('pban')) {
					let milliseconds = (Date.now() - user.avatarCooldown);
					let seconds = ((milliseconds / 1000) % 60);
					let minutes = ((seconds / 60) % 60);
					let remainingTime = Math.round(seconds - (5 * 60));
					if (((Date.now() - user.avatarCooldown) <= 5 * 60 * 1000)) return this.sendReply("You must wait " + (remainingTime - remainingTime * 2) + " seconds before setting another avatar.");
				}
				user.avatarCooldown = Date.now();

				let hash = parts[1].trim();
				if (!pendingAdds[hash]) return this.errorReply("Invalid hash.");

				let userid = pendingAdds[hash].userid;
				let avatar = pendingAdds[hash].avatar;
				delete pendingAdds[hash];

				require('child_process').execFile('bash', ['-c', script, '-', avatar, './config/avatars/' + userid], function (e, out, err) {
					if (e) {
						this.sendReply(userid + "'s custom avatar failed to be set. Script output:");
						(out + err).split('\n').forEach(this.sendReply.bind(this));
						return;
					}

					reloadCustomAvatars();

					let targetUser = Users.getExact(userid);
					if (targetUser) targetUser.avatar = Config.customavatars[userid];

					this.sendReply(userid + "'s custom avatar has been set.");

					Rooms.get('staff').add('|raw|' + Gold.nameColor(userid, true) + ' has received a custom avatar from ' + Gold.nameColor(user.name, true)).update();
					Users.get(userid).popup('|modal||html|<font color="red"><strong>ATTENTION!</strong></font><br /> You have received a custom avatar from ' + Gold.nameColor(user.name, true) + ': <img src="' + avatar + '" width="80" height="80">');
					room.update();
				}.bind(this));
				break;

			case 'remove':
			case 'delete':
				let userid = toId(parts[1]);
				if (!this.can('pban') && Gold.hasBadge(toId(user.name),'vip') && userid !== user.userid) return false;
				if (!Config.customavatars[userid]) return this.errorReply(userid + " does not have a custom avatar.");

				if (Config.customavatars[userid].toString().split('.').slice(0, -1).join('.') !== userid)
					return this.errorReply(userid + "'s custom avatar (" + Config.customavatars[userid] + ") cannot be removed with this script.");

				let targetUser = Users.getExact(userid);
				if (targetUser) targetUser.avatar = 1;

				fs.unlink('./config/avatars/' + Config.customavatars[userid], function (e) {
					if (e) return this.errorReply(userid + "'s custom avatar (" + Config.customavatars[userid] + ") could not be removed: " + e.toString());

					delete Config.customavatars[userid];
					this.sendReply(userid + "'s custom avatar removed successfully");
				}.bind(this));
				break;

			case 'reload':
				if (!this.can('hotpatch')) return false;
				reloadCustomAvatars();
				for (let leUsers of Users.users) {
					leUsers = leUsers[1];
					if (Config.customavatars[leUsers]) Users(leUsers).avatar = Config.customavatars[leUsers];
				}
				this.privateModCommand("(" + user.name + " has reloaded all custom avatars.)");
				break;

			default:
				return this.parse("/help customavatar");
		}
	},
	customavatarhelp: ["/customavatar [set/delete], [user] - Sets to deletes a users custom avatar.  Requires VIP, &, ~",
		"/customavatar reload - Reloads all current set custom avatars on the server. Requires ~"],
};
