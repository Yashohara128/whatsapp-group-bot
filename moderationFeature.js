const fs = require("fs");
const path = require("path");
const { getContentType, jidNormalizedUser } = require("@whiskeysockets/baileys");

const TARGET_GROUP_IDS = [
    "120363427144307038@g.us",
    "120363428845309010@g.us",
    "120363431402119738@g.us"
];

const EXTRA_ADMINS = [
    "94722268122",
    "94762068122",
    "94761200261",
    "94773751413",
    "94710875268",
    "94760630712",
    "94765990540",
    "94785325717",
    "94751132588",
    "94779483956",
    "94760580735",
    "94740868458",
    "94771248970",
    "94786215746",
    "94764466939",
    "185126747156564",
    "168182413316185"
];

// Test karana kota false thiyala warnings/logs/delete/broadcast balanna;
// hari giyama true karala 24h auto-remove enable karanna.
const ENABLE_AUTO_REMOVE = true;
const SPAM_WINDOW_MS = 10 * 1000;
const SPAM_LIMIT = 6;
const BAN_DURATION_MS = 24 * 60 * 60 * 1000;
const BAD_WORDS = ["hutto", "uba", "thopi", "pakyala", "palayan", "pnnyo"];

const BLACKLIST_FILE = path.join(__dirname, "blacklist.json");
let blacklistedUsers = {};

if (fs.existsSync(BLACKLIST_FILE)) {
    try {
        blacklistedUsers = JSON.parse(fs.readFileSync(BLACKLIST_FILE, "utf-8"));
    } catch (_) {
        blacklistedUsers = {};
    }
}

function saveBlacklist() {
    try {
        fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklistedUsers, null, 2));
    } catch (e) {
        console.error("[moderation] Failed to save blacklist:", e.message);
    }
}

function cleanExpiredBans() {
    const now = Date.now();
    let updated = false;
    for (const userId of Object.keys(blacklistedUsers)) {
        if (blacklistedUsers[userId] && now > blacklistedUsers[userId]) {
            delete blacklistedUsers[userId];
            updated = true;
        }
    }
    if (updated) saveBlacklist();
}

const stickerWarnings = new Map();
const linkWarningTracker = new Map();
const badWordWarningTracker = new Map();
const spamTracker = new Map();
const groupMetaCache = new Map();

function digitsOnly(val) {
    return String(val || "").replace(/\D/g, "");
}

function getSenderJid(msg) {
    return msg.key?.participant || msg.key?.remoteJid || "";
}

function isSriLankanNumber(num) {
    if (!num) return true;
    return String(num).startsWith("94");
}

function isStickerOrGifMessage(msg) {
    const m = msg.message;
    if (!m) return false;
    const type = getContentType(m);
    if (type === "stickerMessage") return true;
    if (type === "videoMessage" && m.videoMessage?.gifPlayback) return true;
    return false;
}

async function getGroupParticipantIds(sock, groupId) {
    const now = Date.now();
    const cached = groupMetaCache.get(groupId);
    if (cached && now - cached.ts < 60 * 1000) {
        return cached.adminIds;
    }

    const adminIds = new Set();
    try {
        const meta = await sock.groupMetadata(groupId);
        for (const p of meta?.participants || []) {
            if (p.admin === "admin" || p.admin === "superadmin") {
                if (p.id) adminIds.add(jidNormalizedUser(p.id));
                if (p.jid) adminIds.add(jidNormalizedUser(p.jid));
                if (p.lid) adminIds.add(jidNormalizedUser(p.lid));
            }
        }
        groupMetaCache.set(groupId, { ts: now, adminIds });
    } catch (_) {}
    return adminIds;
}

async function isGroupAdmin(sock, groupId, senderJid) {
    const senderDigits = digitsOnly(senderJid);
    if (senderDigits && EXTRA_ADMINS.includes(senderDigits)) {
        return true;
    }

    const adminIds = await getGroupParticipantIds(sock, groupId);
    const normSender = senderJid ? jidNormalizedUser(senderJid) : "";
    if (normSender && adminIds.has(normSender)) {
        return true;
    }

    for (const aid of adminIds) {
        if (senderDigits && digitsOnly(aid) === senderDigits) {
            return true;
        }
    }
    return false;
}

async function banAndMaybeRemove(sock, groupId, senderJid, reasonText) {
    const num = digitsOnly(senderJid) || "member";
    const normJid = senderJid ? jidNormalizedUser(senderJid) : "";

    blacklistedUsers[senderJid] = Date.now() + BAN_DURATION_MS;
    if (normJid) blacklistedUsers[normJid] = Date.now() + BAN_DURATION_MS;
    saveBlacklist();

    if (ENABLE_AUTO_REMOVE && senderJid) {
        try {
            await sock.groupParticipantsUpdate(groupId, [senderJid], "remove");
            await sock.sendMessage(groupId, {
                text: `🚫 @${num} ${reasonText} (24h ban).`,
                mentions: [senderJid]
            });
            return true;
        } catch (err) {
            console.error("[moderation] Remove failed:", err.message);
        }
    }

    await sock.sendMessage(groupId, {
        text: `🛡️ *[SAFE TEST MODE]* @${num} flagged for: ${reasonText} (Auto-remove is OFF).`,
        mentions: senderJid ? [senderJid] : []
    });
    return false;
}

async function tryDeleteMessage(sock, groupId, msg) {
    try {
        await sock.sendMessage(groupId, { delete: msg.key });
    } catch (_) {}
}

async function handleBroadcastCommand(sock, chatId, senderJid, text, replyText) {
    const lower = String(text || "").trim().toLowerCase();
    if (!lower.startsWith("/broadcast") && !lower.startsWith("/boradcast")) {
        return false;
    }

    const senderDigits = digitsOnly(senderJid);
    const authorized = EXTRA_ADMINS.includes(senderDigits);
    if (!authorized) {
        console.log(`❌ [BROADCAST DENIED] Sender: ${senderJid} (${senderDigits})`);
        return true;
    }

    const customBody = text.replace(/^\/(broadcast|boradcast)\s*/i, "").trim();
    const textToSend = `📢🎓 *IFSLS වැදගත් දැනුම්දීමයි!* 🎓📢

ළමයි හැමෝටම සුබ දවසක්! පහත කරුණු දෙක ගැන විශේෂ අවධානය යොමු කරන්න. 👇

🔹 *1. නව FAQ Commands (/faq-si & /faq-en)*
IFSLS ශිෂ්‍ය ණය යෝජනා ක්‍රමය සම්බන්ධයෙන් නිතර අසනු ලබන ප්‍රශ්න සහ පිළිතුරු දැන් සිංහල සහ English දෙකෙන්ම Bot හරහා ලබාගත හැක:
• *සිංහල FAQ:* /faq-si
• *English FAQ:* /faq-en

🔹 *2. /cutoff Command පිළිබඳ දැනුම්දීම*
*/cutoff* command එක දැනට වැඩ කරන්නේ නැහැ — Google Form submissions තවම නැති නිසා.
ඒ feature එක *12th Intake* එක වෙනුවෙන් හදපු එකක් බව කරුණාවෙන් සලකන්න. ✨

🎓 *IFSLS STUDENT ADMIN COMMUNITY*`;
    let sentCount = 0;
    for (const gid of TARGET_GROUP_IDS) {
        try {
            await sock.sendMessage(gid, { text: textToSend });
            sentCount++;
            await new Promise((r) => setTimeout(r, 2000));
        } catch (err) {
            console.error(`❌ [BROADCAST ERROR] ${gid}:`, err.message);
        }
    }

    await replyText(`✅ *Broadcast Complete!* Sent to ${sentCount}/${TARGET_GROUP_IDS.length} target groups.`);
    return true;
}

async function moderateGroupMessage(sock, msg, groupId, text, replyText) {
    cleanExpiredBans();

    const senderJid = getSenderJid(msg);
    const senderNum = digitsOnly(senderJid) || "member";
    const isAdmin = await isGroupAdmin(sock, groupId, senderJid);

    if (await handleBroadcastCommand(sock, groupId, senderJid, text, replyText)) {
        return true;
    }

    if (isAdmin) {
        return false;
    }

    // 1. Sticker / GIF warning
    if (isStickerOrGifMessage(msg)) {
        const key = `${groupId}_${senderJid}`;
        const prev = stickerWarnings.get(key) || 0;
        if (prev === 0) {
            stickerWarnings.set(key, 1);
            await sock.sendMessage(groupId, {
                text:
                    `⚠️ @${senderNum}, මෙම සමූහය තුළ සාමාජිකයන් සදහා කරදරකාරී වන Stickers හෝ GIFs භාවිතය සිමා කර ඇත!\n\n` +
                    `📌 මෙය ඔබගේ *පළමු සහ අවසන් අනතුරු ඇඟවීමයි*. නැවත වතාවක් යොමු කලහොත් 24h ban/remove ක්‍රියාත්මක වේ.`,
                mentions: senderJid ? [senderJid] : []
            });
        } else {
            stickerWarnings.delete(key);
            await banAndMaybeRemove(sock, groupId, senderJid, "Repeated Stickers/GIFs after warning");
        }
        return true;
    }

    const textLower = String(text || "").toLowerCase();
    if (!textLower) return false;

    // 2. Status mention check
    if (
        textLower.includes("mentioned this group") ||
        textLower.includes("in a status") ||
        textLower.includes("තත්වයක් තුළ මෙම සමූහය")
    ) {
        await tryDeleteMessage(sock, groupId, msg);
        await banAndMaybeRemove(sock, groupId, senderJid, "Mentioning group in status");
        return true;
    }

    // 3. Bad words filter
    if (BAD_WORDS.some((w) => textLower.includes(w.toLowerCase()))) {
        await tryDeleteMessage(sock, groupId, msg);
        const warnings = (badWordWarningTracker.get(senderJid) || 0) + 1;
        badWordWarningTracker.set(senderJid, warnings);

        if (warnings === 1) {
            await sock.sendMessage(groupId, {
                text: `⚠️ @${senderNum}, මෙම කණ්ඩායම තුළ අපහාසාත්මක හෝ තහනම් වචන භාවිතය තහනම්! මෙය ඔබගේ *පළමු අවවාදයයි*. 🤬`,
                mentions: senderJid ? [senderJid] : []
            });
        } else {
            await banAndMaybeRemove(sock, groupId, senderJid, "Repeated prohibited/bad words");
        }
        return true;
    }

    // 4. Unauthorized / scam / Telegram / WhatsApp group link filter
    const strictLinkRegex =
        /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|lk|org|net|gov|edu|io|me|info|co|biz|xyz|app|dev)(\/[^\s]*)?|chat\.whatsapp\.com\/[^\s]+)/i;
    if (strictLinkRegex.test(text)) {
        const isTelegramLink = textLower.includes("t.me/") || textLower.includes("telegram.me/");
        const isWhatsAppGroupLink = textLower.includes("chat.whatsapp.com");
        const isAllowedEdu =
            textLower.includes("youtube.com") ||
            textLower.includes("youtu.be") ||
            textLower.includes("drive.google.com") ||
            textLower.includes("zoom.us") ||
            textLower.includes("teams.microsoft.com") ||
            textLower.includes("docs.google.com") ||
            textLower.includes("forms.gle") ||
            textLower.includes("classroom.google.com") ||
            textLower.includes("studentloans.mohe.gov.lk") ||
            textLower.includes("mohe.gov.lk") ||
            textLower.includes("facebook.com") ||
            textLower.includes("fb.watch") ||
            textLower.includes("fb.me");

        const scamKeywords = [
            "earn money", "crypto", "forex", "business", "job opportunity",
            "free cash", "marketing", "signals", "trading", "invest",
            "lottery", "win cash", "fast money", "income"
        ];
        const hasScam = scamKeywords.some((k) => textLower.includes(k));

        if (isTelegramLink || isWhatsAppGroupLink || hasScam || !isAllowedEdu) {
            await tryDeleteMessage(sock, groupId, msg);
            const warnings = (linkWarningTracker.get(senderJid) || 0) + 1;
            linkWarningTracker.set(senderJid, warnings);

            if (warnings === 1) {
                await sock.sendMessage(groupId, {
                    text:
                        `⚠️ @${senderNum}\n` +
                        `මෙම කණ්ඩායම තුළ අවසර නැති Links / WhatsApp Group / Telegram / ව්‍යාපාරික Links Share කිරීම තහනම්! මෙය ඔබගේ *පළමු අවවාදයයි*. 🚫`,
                    mentions: senderJid ? [senderJid] : []
                });
            } else {
                await banAndMaybeRemove(sock, groupId, senderJid, "Repeated unauthorized/prohibited links");
            }
            return true;
        }
    }

    // 5. Spam burst detection (6 messages in 10s)
    const now = Date.now();
    const recent = (spamTracker.get(senderJid) || []).filter((ts) => now - ts < SPAM_WINDOW_MS);
    recent.push(now);
    spamTracker.set(senderJid, recent);

    if (recent.length >= SPAM_LIMIT) {
        spamTracker.set(senderJid, []);
        await banAndMaybeRemove(sock, groupId, senderJid, "Spamming (6+ messages in 10s)");
        return true;
    }

    return false;
}

module.exports = {
    moderateGroupMessage,
    blacklistedUsers
};
