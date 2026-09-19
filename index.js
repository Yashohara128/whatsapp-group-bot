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

const spamTracker = new Map();
const linkWarningTracker = new Map();   
const badWordWarningTracker = new Map(); 

const BLACKLIST_FILE = "./blacklist.json";
const WELCOMED_FILE = "./welcomed_users.json"; 

let blacklistedUsers = new Set();
let welcomedUsers = new Set();

if (fs.existsSync(BLACKLIST_FILE)) {
    try {
        blacklistedUsers = new Set(JSON.parse(fs.readFileSync(BLACKLIST_FILE, "utf-8")));
    } catch(e) {}
}

if (fs.existsSync(WELCOMED_FILE)) {
    try {
        welcomedUsers = new Set(JSON.parse(fs.readFileSync(WELCOMED_FILE, "utf-8")));
    } catch(e) {}
}

function saveBlacklist() {
    try {
        fs.writeFileSync(BLACKLIST_FILE, JSON.stringify([...blacklistedUsers]));
    } catch(e) {}
}

function saveWelcomedUsers() {
    try {
        fs.writeFileSync(WELCOMED_FILE, JSON.stringify([...welcomedUsers]));
    } catch(e) {}
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

client.on("ready", () => {
    console.log("🤖 BOT READY - STABLE & CLEAN");
    console.log(`Working on ${TARGET_GROUP_IDS.length} Groups!`);
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
        let groupId = "";
        if (notification.chatId) {
            groupId = typeof notification.chatId === 'object' ? notification.chatId._serialized : String(notification.chatId);
        }
        
        if (!groupId || !TARGET_GROUP_IDS.includes(groupId)) return;

        const users = notification.recipientIds || [];
        for (const userId of users) {
            const info = await getContactInfo(userId);
            if (!info) return;

            if (blacklistedUsers.has(userId)) {
                await directRemoveParticipant(groupId, userId);
                continue;
            }

            if (!isSriLankan(info.actualNumber)) {
                await client.sendMessage(groupId, `🌍 @${userId.split('@')[0]} (*${info.name}*) Sorry, only Sri Lankan numbers (+94) are allowed.`, { mentions: [userId] });
                await directRemoveParticipant(groupId, userId);
                continue;
            }

            if (!welcomedUsers.has(userId)) {
                welcomedUsers.add(userId);
                saveWelcomedUsers();

                const welcomeMsg = `🎓 *Welcome to IFSLS 11th INTAKE MAIN GROUP* 🎓

👋 Hello / ආයුබෝවන් *${info.name}*,

Please follow these group guidelines to maintain a good learning environment.
කරුණාකර සමූහයේ යහපැවැත්ම උදෙසා පහත නීති මාලාව පිළිපදින්න.

*GROUP RULES / නීති මාලාව:*
1️⃣ Be respectful to everyone.
(සියලුම සාමාජිකයින්ට ගෞරවයෙන් සලකන්න.)

2️⃣ 🚫 No Spamming or flooding messages.
(අනවශ්‍ය පණිවිඩ යැවීමෙන් වළකින්න.)

3️⃣ 🚫 No unauthorized links (Other WhatsApp groups, Telegram, Scam/Business links). Only educational links and our official Facebook group are allowed.
(වෙනත් WhatsApp Group, Telegram හෝ ව්‍යාපාරික ලින්ක් දැමීම සපුරා තහනම්. අධ්‍යාපනික ලින්ක් සහ අපගේ නිල Facebook Group එකට පමණක් අවසර ඇත.)

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
                console.log(`✅ Welcome sent to: ${info.name}`);
            }
        }
    } catch (err) {}
});

client.on("message", async (message) => {
    try {
        if (!message.from || !message.from.endsWith("@g.us")) return;
        if (message.fromMe) return; 
        if (!TARGET_GROUP_IDS.includes(message.from)) return;
        if (!message.author) return;

        const groupId = message.from;
        const info = await getContactInfo(message.author);
        if (!info) return;
        const textLower = (message.body || "").toLowerCase();

        if (info.actualNumber && !isSriLankan(info.actualNumber)) {
            const removed = await directRemoveParticipant(groupId, message.author);
            if (removed) {
                await client.sendMessage(groupId, `🌍 @${message.author.split('@')[0]} (*${info.name}*) Sorry, only Sri Lankan numbers (+94) are allowed.`, { mentions: [message.author] });
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
                    const participant = chat.participants.find(p => p.id._serialized === message.author);
                    isAdmin = participant && (participant.isAdmin || participant.isSuperAdmin);
                }
            } catch (err) {}

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

                const isAllowedSpecificFBGroup = textLower.includes("1cum3lcfaa"); 
                const isGeneralFBLink = textLower.includes("facebook.com") || textLower.includes("fb.watch") || textLower.includes("fb.me");
                
                const isAllowedFB = !isGeneralFBLink || isAllowedSpecificFBGroup;
                const isAllowedEducationalLink = (isAllowedYT || isAllowedDrive || isAllowedZoom || isAllowedTeams || isAllowedDocs || isAllowedForms || isAllowedClassroom) && isAllowedFB;
                
                const scamOrBusinessKeywords = ["earn money", "crypto", "forex", "business", "job opportunity", "free cash", "marketing", "signals", "trading", "invest", "lottery", "win cash", "fast money", "income"];
                const containsScamOrBusiness = scamOrBusinessKeywords.some(keyword => textLower.includes(keyword));

                let shouldBlock = false;
                if (isTelegramLink) shouldBlock = true; 
                else if (containsScamOrBusiness) shouldBlock = true; 
                else if (isWhatsAppGroupLink) shouldBlock = true; 
                else if (isGeneralFBLink && !isAllowedSpecificFBGroup) shouldBlock = true; 
                else if (!isAllowedEducationalLink && !isAllowedSpecificFBGroup) shouldBlock = true; 

                if (shouldBlock) {
                    try { await message.delete(true); } catch(e) {} 

                    let warnings = linkWarningTracker.get(message.author) || 0;
                    warnings++;
                    linkWarningTracker.set(message.author, warnings);

                    if (warnings === 1) {
                        await client.sendMessage(groupId, `⚠️ @${message.author.split('@')[0]} (*${info.name}*)\nමෙම කණ්ඩායම තුළ අවසර නොලත් ලින්ක් Share කිරීම තහනම්! මෙය ඔබගේ පළමු අවවාදයයි. 🚫`, { mentions: [message.author] });
                    } else {
                        const removed = await directRemoveParticipant(groupId, message.author);
                        if (removed) {
                            blacklistedUsers.add(message.author);
                            saveBlacklist(); 
                            await client.sendMessage(groupId, `🚫 @${message.author.split('@')[0]} (*${info.name}*) අවවාද නොතකා නැවත තහනම් ලින්ක් දැමූ නිසා ඉවත් කරන ලදී.`, { mentions: [message.author] });
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
                    const participant = chat.participants.find(p => p.id._serialized === message.author);
                    isAdmin = participant && (participant.isAdmin || participant.isSuperAdmin);
                }
            } catch (err) {}

            if (!isAdmin) {
                try { await message.delete(true); } catch(e) {} 
                let warnings = badWordWarningTracker.get(message.author) || 0;
                warnings++;
                badWordWarningTracker.set(message.author, warnings);

                if (warnings === 1) {
                    await client.sendMessage(groupId, `⚠️ @${message.author.split('@')[0]} (*${info.name}*)\nඅපහාසාත්මක වචන භාවිතය තහනම්! පළමු අවවාදයයි. 🤬`, { mentions: [message.author] });
                } else {
                    const removed = await directRemoveParticipant(groupId, message.author);
                    if (removed) {
                        blacklistedUsers.add(message.author);
                        saveBlacklist(); 
                        await client.sendMessage(groupId, `🚫 @${message.author.split('@')[0]} (*${info.name}*) ඉවත් කරන ලදී.`, { mentions: [message.author] });
                    }
                }
            }
            return;
        }

    } catch (error) {}
});

client.initialize();
