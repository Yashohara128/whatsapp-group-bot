const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const cron = require("node-cron"); 
const fs = require("fs"); 

const TARGET_GROUP_IDS = [
    "120363427144307038@g.us",
    "120363428845309010@g.us",
    "120363431402119738@g.us"
];

const CHROME_PATH = "/usr/bin/chromium-browser";
const ENABLE_AUTO_REMOVE = true;
const SPAM_WINDOW_MS = 10 * 1000;
const SPAM_LIMIT = 3;
const BAD_WORDS = ["hutto", "uba", "thopi", "pakyala","palayan","pnnyo"]; 

// ⏳ බෑන් වන කෙනෙකුට නැවත ජොයින් වීමට ගත විය යුතු කාලය (පැය 24ක් ලෙස සකසා ඇත - මිලලිසෙකන්ඩ් වලින්)
const BAN_DURATION_MS = 24 * 60 * 60 * 1000; 

const spamTracker = new Map();
const linkWarningTracker = new Map();   
const badWordWarningTracker = new Map(); 

const BLACKLIST_FILE = "./blacklist.json";
let blacklistedUsers = {}; // දැන් මේක Object එකක් (userId -> banExpiryTime)

if (fs.existsSync(BLACKLIST_FILE)) {
    try {
        blacklistedUsers = JSON.parse(fs.readFileSync(BLACKLIST_FILE, "utf-8"));
    } catch(e) { blacklistedUsers = {}; }
}

function saveBlacklist() {
    try {
        fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklistedUsers, null, 2));
    } catch(e) { }
}

// 🧹 කල් ඉකුත් වූ (Expired) බෑන් ස්වයංක්‍රීයව ඉවත් කිරීමේ ශ්‍රිතය
function cleanExpiredBans() {
    const now = Date.now();
    let updated = false;
    for (let userId in blacklistedUsers) {
        if (blacklistedUsers[userId] && now > blacklistedUsers[userId]) {
            delete blacklistedUsers[userId];
            updated = true;
        }
    }
    if (updated) {
        saveBlacklist();
    }
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: CHROME_PATH,
        headless: true, 
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--single-process",
            "--disable-gpu"
        ]
    }
});

client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
    console.log("✅ WhatsApp authenticated");
});

client.on("ready", async () => {
    console.log("\n========================================");
    console.log("🤖 BOT READY - AUTO-EXPIRE BAN SYSTEM");
    console.log("========================================");
    console.log(`Working on ${TARGET_GROUP_IDS.length} Groups!`);


// අලුත් කෑල්ල: WhatsApp සර්වර් එකෙන් ගෲප් ටික ලෝඩ් කරගැනීම
    console.log("⏳ Loading all chats from WhatsApp servers... (This might take a few seconds)");
    try {
        const chats = await client.getChats();
        console.log(`✅ Successfully loaded ${chats.length} chats into memory!`);
    } catch (e) {
        console.log("❌ Failed to load chats:", e);
    }


    cron.schedule("40 10 * * *", async () => {
        for (const groupId of TARGET_GROUP_IDS) {
            try {
                const chat = await client.getChatById(groupId);
                await chat.setMessagesAdminsOnly(true); 
                await chat.sendMessage("🌙 *රාත්‍රී 11:00 Group Admin Mode Active වී ඇත.* නැවත උදේ 6:00 ට open වේ. Good Night All!😴 Bot generated message.don't reply");
            } catch (e) { }
        }
    }, { scheduled: true, timezone: "Asia/Colombo" });

    cron.schedule("0 6 * * *", async () => {
        for (const groupId of TARGET_GROUP_IDS) {
            try {
                const chat = await client.getChatById(groupId);
                await chat.setMessagesAdminsOnly(false); 
                await chat.sendMessage("☀️ *Good Morning All!* ගෲප් එක Open.😊Bot generated message.don't reply");
            } catch (e) { }
        }
    }, { scheduled: true, timezone: "Asia/Colombo" });
});

async function getContactInfo(id) {
    try {
        if (!id) return null;
        const contact = await client.getContactById(id);
        if (!contact) return null;
        const actualId = contact.id && contact.id._serialized ? contact.id._serialized : "";
        const actualNumber = actualId ? actualId.split("@")[0] : "";
        const name = contact.pushname || contact.name || contact.shortName || "Unknown User";
        return { contact, name, actualId, actualNumber };
    } catch (error) {
        return null;
    }
}

function isSriLankan(number) {
    if (!number) return false;
    return number.startsWith("94");
}

async function directRemoveParticipant(groupId, participantId) {
    try {
        if (!ENABLE_AUTO_REMOVE) return false;
        const result = await client.pupPage.evaluate(async (groupId, participantId) => {
            try {
                const WWebJS = window.WWebJS;
                if (!WWebJS) return { success: false };
                const chat = await WWebJS.getChat(groupId, { getAsModel: false });
                if (!chat) return { success: false };

                const resolved = await WWebJS.enforceLidAndPnRetrieval(participantId);
                const lid = resolved && resolved.lid ? resolved.lid : null;
                const phone = resolved && resolved.phone ? resolved.phone : null;

                let participant = null;
                if (lid && chat.groupMetadata && chat.groupMetadata.participants) participant = chat.groupMetadata.participants.get(lid._serialized);
                if (!participant && phone && chat.groupMetadata && chat.groupMetadata.participants) participant = chat.groupMetadata.participants.get(phone._serialized);
                if (!participant && chat.groupMetadata && chat.groupMetadata.participants) participant = chat.groupMetadata.participants.get(participantId);

                if (!participant || participant.isAdmin || participant.isSuperAdmin) return { success: false };
                await window.require("WAWebModifyParticipantsGroupAction").removeParticipants(chat, [participant]);
                return { success: true };
            } catch (error) { return { success: false }; }
        }, groupId, participantId);
        return result && result.success;
    } catch (error) { return false; }
}

client.on("group_join", async (notification) => {
    try {
        cleanExpiredBans(); // ජොයින් වෙද්දීල් පැරණි බෑන්ස් ක්ලියර් කරයි

        const groupId = typeof notification.chatId === 'object' ? notification.chatId._serialized : String(notification.chatId);
        if (!TARGET_GROUP_IDS.includes(groupId)) return;

        console.log(`\n📥 [GROUP JOIN DETECTED]`);
        console.log(`📍 Group: ${groupId}`);

        const users = notification.recipientIds || [];
        for (const userId of users) {
            const info = await getContactInfo(userId);
            if (!info) continue; 
            
            console.log(`👤 New Member: ${info.name} (${info.actualNumber})`);

            let isBanned = false;
            const now = Date.now();
            
            // නම්බර් එක හෝ අයිඩී එක බ්ලැක්ලිස්ට් එකේ ඇද්ද සහ කාලය ඉවර වී ඇද්ද බැලීම
            for (let bannedId in blacklistedUsers) {
                if ((bannedId === userId || bannedId.includes(info.actualNumber)) && now < blacklistedUsers[bannedId]) {
                    isBanned = true;
                    break;
                }
            }

            if (isBanned) {
                await client.sendMessage(groupId, `🚫 @${userId.split('@')[0]} (*${info.name}*), ඔබට තවමත් මෙම සමූහයට සම්බන්ධ වීමට කාලය පැමිණ නැත (ඔබගේ Ban කාලය තවම අවසන් වී නැත).`, { mentions: [userId] });
                await directRemoveParticipant(groupId, userId);
                continue; 
            }

            if (!isSriLankan(info.actualNumber)) {
                await client.sendMessage(groupId, `🌍 @${userId.split('@')[0]} (*${info.name}*) Sorry, only Sri Lankan numbers (+94) are allowed in this group. You will be removed.`, { mentions: [userId] });
                await directRemoveParticipant(groupId, userId);
                continue;
            }

            const welcomeMsg = `🎓 *Welcome to IFSLS 11th INTAKE MAIN GROUP* 🎓

👋 Hello / ආයුබෝවන් *${info.name}*,

Please follow these group guidelines to maintain a good learning environment.
කරුණාකර සමූහයේ යහපැවැත්ම උදෙසා පහත නීති මාලාව පිළිපදින්න.

*GROUP RULES / නීති මාලාව:*
1️⃣ Be respectful to everyone.
(සියලුම සාමාජිකයින්ට ගෞරවයෙන් සලකන්න.)

2️⃣ 🚫 No Spamming or flooding messages.
(අනවශ්‍ය පණිවිඩ යැවීමෙන් වළකින්න.)

3️⃣ 🚫 No unauthorized links (Other WhatsApp groups, Telegram, Scam/Business links). Only educational links are allowed.
(වෙනත් WhatsApp Group, Telegram හෝ ව්‍යාපාරික ලින්ක් දැමීම සපුරා තහනම්. අධ්‍යාපනික ලින්ක් සඳහා පමණක් අවසර ඇත.)

4️⃣ 🌙 Group will be closed for messages from 11:00 PM to 6:00 AM.
(දිනපතා රාත්‍රී 11:00 සිට උදෑසන 6:00 දක්වා සමූහය වසා තැබේ.)

5️⃣ 🎓 For further questions regarding student loans, please contact the group admins. Please watch the YouTube playlist below for more information.
(ශිෂ්‍ය ණය පිළිබඳ වැඩිදුර ප්‍රශ්න සඳහා සමූහයේ Admin වරුන් සම්බන්ධ කරගන්න. ණය පිළිබඳ සියලුම තොරතුරු දැනගැනීමට පහත YouTube Playlist එක අනිවාර්යයෙන්ම නරඹන්න.)
📺 *YouTube Playlist:* https://youtube.com/playlist?list=PL-ZbzAh0pKykpa-odcUrDEg94PBbTQp9M&si=F9L3Spy-pLZJq31n

⚠️ *Note:* Breaking these rules will result in an automatic permanent ban by the system.
(මෙම නීති කඩකරන අයව පද්ධතිය මගින් ස්වයංක්‍රීයව සමූහයෙන් ඉවත් කරනු ලැබේ.)

Thank you! / ස්තූතියි!
🤖 _System Generated Message. Please do not reply._`;

            await client.sendMessage(userId, welcomeMsg);
            console.log(`✅ Welcome successfully sent to: ${info.name}`);
        }
    } catch (error) {
        console.log("⚠️ Error in group_join event:", error);
    }
});

client.on("message_create", async (message) => {
    try {
        const groupId = message.fromMe ? message.to : message.from;
        if (!groupId || !groupId.endsWith("@g.us")) return;
        if (!TARGET_GROUP_IDS.includes(groupId)) return;
        
        const textLower = (message.body || "").toLowerCase();
        if (message.fromMe) return; 

        const senderId = message.author || message.from;
        const info = await getContactInfo(senderId);
        if (!info) return;

        console.log("\n----------------------------------------");
        console.log(`📩 Group ID : ${groupId}`);
        console.log(`👤 Name     : ${info.name}`);
        console.log(`💬 Type     : ${message.type}`);
        console.log(`💬 Message  : ${message.body || "[Media / Sticker / Invite]"}`);
        console.log("----------------------------------------");

        if (info.actualNumber && !isSriLankan(info.actualNumber)) {
            const removed = await directRemoveParticipant(groupId, senderId);
            if (removed) {
                blacklistedUsers[senderId] = Date.now() + BAN_DURATION_MS;
                if (info.actualId) blacklistedUsers[info.actualId] = Date.now() + BAN_DURATION_MS;
                saveBlacklist();
                await client.sendMessage(groupId, `🌍 @${senderId.split('@')[0]} (*${info.name}*) Sorry, only Sri Lankan numbers (+94) are allowed in this group.`, { mentions: [senderId] });
            }
            return;
        }

        const isNativeGroupInvite = message.type === 'group_invite';
        const hasLinkIndicator = isNativeGroupInvite || textLower.includes("http://") || textLower.includes("https://") || textLower.includes("www.") || textLower.includes(".com") || textLower.includes(".net") || textLower.includes(".org") || textLower.includes(".me") || textLower.includes(".co") || textLower.includes("t.me") || textLower.includes("chat.whatsapp.com");

        if (hasLinkIndicator) {
            let isAdmin = false;
            try {
                const chat = await message.getChat();
                if (chat && chat.participants) {
                    const participant = chat.participants.find(p => p.id._serialized === senderId);
                    isAdmin = participant && (participant.isAdmin || participant.isSuperAdmin);
                }
            } catch (err) { }

            if (!isAdmin) {
                const isTelegramLink = textLower.includes("t.me/") || textLower.includes("telegram.me/");
                const isWhatsAppGroupLink = isNativeGroupInvite || textLower.includes("chat.whatsapp.com"); 
                
                const isAllowedYT = textLower.includes("youtube.com") || textLower.includes("youtu.be");
                const isAllowedDrive = textLower.includes("drive.google.com");
                const isAllowedZoom = textLower.includes("zoom.us");
                const isAllowedTeams = textLower.includes("teams.microsoft.com");
                const isAllowedDocs = textLower.includes("docs.google.com");
                const isAllowedForms = textLower.includes("forms.gle");
                const isAllowedClassroom = textLower.includes("classroom.google.com");

                const isAllowedEducationalLink = isAllowedYT || isAllowedDrive || isAllowedZoom || isAllowedTeams || isAllowedDocs || isAllowedForms || isAllowedClassroom;
                
                const scamOrBusinessKeywords = ["earn money", "crypto", "forex", "business", "job opportunity", "free cash", "marketing", "signals", "trading", "invest", "lottery", "win cash", "fast money", "income"];
                const containsScamOrBusiness = scamOrBusinessKeywords.some(keyword => textLower.includes(keyword));

                let shouldBlock = false;
                if (isTelegramLink) shouldBlock = true; 
                else if (containsScamOrBusiness) shouldBlock = true; 
                else if (isWhatsAppGroupLink) shouldBlock = true; 
                else if (!isAllowedEducationalLink) shouldBlock = true; 

                if (shouldBlock) {
                    try { await message.delete(true); } catch(e) { } 

                    let warnings = linkWarningTracker.get(senderId) || 0;
                    warnings++;
                    linkWarningTracker.set(senderId, warnings);

                    if (warnings === 1) {
                        await client.sendMessage(groupId, `⚠️ @${senderId.split('@')[0]} (*${info.name}*)\nමෙම කණ්ඩායම තුළ වෙනත් WhatsApp Group ලින්ක්, ටෙලිග්‍රෑම් ලින්ක් හෝ ව්‍යාපාරික දේවල් Share කිරීම තහනම්! ඔයාට group link share කරගන්න අවශ්‍යනම් group admin කෙනෙක් හරහා යොමු කරන්න🤠 මෙය ඔබගේ *පළමු අවවාදයයි*. නැවත දැමුවහොත් ගෲප් එකෙන් ඉවත් කරනු ලැබේ කරුණාකර link එක group එකෙන් ඉවත් කරගන්න.. 🚫`, { mentions: [senderId] });
                    } else {
                        const removed = await directRemoveParticipant(groupId, senderId);
                        if (removed) {
                            blacklistedUsers[senderId] = Date.now() + BAN_DURATION_MS;
                            if (info.actualId) blacklistedUsers[info.actualId] = Date.now() + BAN_DURATION_MS;
                            saveBlacklist(); 
                            if (ENABLE_AUTO_REMOVE) {
                                await client.sendMessage(groupId, `🚫 @${senderId.split('@')[0]} (*${info.name}*) අවවාද නොතකා නැවත තහනම් ලින්ක් දැමූ නිසා පැය 24කට ගෲප් එකෙන් ඉවත් කරන ලදී.`, { mentions: [senderId] });
                            }
                        }
                    }
                    return;
                }
            }
        }

        const containsBadWord = BAD_WORDS.some(word => textLower.includes(word.toLowerCase()));
        if (containsBadWord) {
            let isAdmin = false;
            try {
                const chat = await message.getChat();
                if (chat && chat.participants) {
                    const participant = chat.participants.find(p => p.id._serialized === senderId);
                    isAdmin = participant && (participant.isAdmin || participant.isSuperAdmin);
                }
            } catch (err) { }

            if (!isAdmin) {
                try { await message.delete(true); } catch(e) {} 
                let warnings = badWordWarningTracker.get(senderId) || 0;
                warnings++;
                badWordWarningTracker.set(senderId, warnings);

                if (warnings === 1) {
                    await client.sendMessage(groupId, `⚠️ @${senderId.split('@')[0]} (*${info.name}*)\nමෙම කණ්ඩායම තුළ අපහාසාත්මක හෝ තහනම් වචන භාවිතය තහනම්! මෙය ඔබගේ *පළමු අවවාදයයි*. නැවත එවැනි වචන භාවිත කළහොත් ගෲප් එකෙන් ඉවත් කරනු ලැබේ. 🤬`, { mentions: [senderId] });
                } else {
                    const removed = await directRemoveParticipant(groupId, senderId);
                    if (removed) {
                        blacklistedUsers[senderId] = Date.now() + BAN_DURATION_MS;
                        if (info.actualId) blacklistedUsers[info.actualId] = Date.now() + BAN_DURATION_MS;
                        saveBlacklist(); 
                        if (ENABLE_AUTO_REMOVE) {
                            await client.sendMessage(groupId, `🚫 @${senderId.split('@')[0]} (*${info.name}*) අවවාද නොතකා නැවත අපහාසාත්මක වචන භාවිත කළ නිසා පැය 24කට ගෲප් එකෙන් ඉවත් කරන ලදී.`, { mentions: [senderId] });
                        }
                    }
                }
            }
            return;
        }

        await checkSpam(message, senderId, info.name, groupId);

    } catch (error) {}
});

async function checkSpam(message, senderId, name, groupId) {
    const now = Date.now();
    if (!spamTracker.has(senderId)) spamTracker.set(senderId, []);
    let timestamps = spamTracker.get(senderId);
    timestamps = timestamps.filter(timestamp => now - timestamp < SPAM_WINDOW_MS);
    timestamps.push(now);
    spamTracker.set(senderId, timestamps);

    if (timestamps.length >= SPAM_LIMIT) {
        spamTracker.set(senderId, []);
        const removed = await directRemoveParticipant(groupId, senderId);
        if (removed) {
            blacklistedUsers[senderId] = Date.now() + BAN_DURATION_MS;
            const info = await getContactInfo(senderId);
            if (info && info.actualId) blacklistedUsers[info.actualId] = Date.now() + BAN_DURATION_MS;
            saveBlacklist(); 
            if (ENABLE_AUTO_REMOVE) {
                await client.sendMessage(groupId, `🚨 @${senderId.split('@')[0]} (*${name}*) has been temporarily removed for SPAMMING (24h ban).`, { mentions: [senderId] });
            }
        }
    }
}

client.initialize();
