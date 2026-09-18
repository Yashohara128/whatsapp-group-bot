const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const cron = require("node-cron"); // ⏰ වෙලාවට වැඩ කරන අලුත් කෑල්ල

// ========================================
// CONFIGURATION (ඔයාගේ Groups ටික)
// ========================================

const TARGET_GROUP_IDS = [
    "120363427144307038@g.us",
    "120363428845309010@g.us",
    "120363398494943813@g.us"
];

const CHROME_PATH = "/usr/bin/chromium-browser";

// ========================================
// SETTINGS
// ========================================

const ENABLE_AUTO_REMOVE = true;
const SPAM_WINDOW_MS = 10 * 1000;
const SPAM_LIMIT = 3;

// 🤬 Bad Words List 
const BAD_WORDS = ["hutto", "uba", "thopi", "pakyala","palayan","pnnyo"]; 

// ========================================
// DATA
// ========================================

const spamTracker = new Map();
const blacklistedUsers = new Set(); 

// ========================================
// CLIENT
// ========================================

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
    console.log("\n========================================");
    console.log("📱 SCAN QR CODE");
    console.log("========================================\n");
    qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
    console.log("✅ WhatsApp authenticated");
});

client.on("ready", () => {
    console.log("\n========================================");
    console.log("🤖 BOT READY");
    console.log("========================================");
    console.log(`Working on ${TARGET_GROUP_IDS.length} Groups!`);
    console.log("Features Active: Anti-Link | Bad Words | Auto-Reply | Night Mode");
    console.log("========================================\n");

    // ========================================
    // 🌙 AUTO NIGHT MODE (රෑ 10:00 ට ගෲප් වසයි)
    // ========================================
    cron.schedule("0 23 * * *", async () => {
        for (const groupId of TARGET_GROUP_IDS) {
            try {
                const chat = await client.getChatById(groupId);
                await chat.setMessagesAdminsOnly(true); // Only Admins mode දානවා
                await chat.sendMessage("🌙 *රාත්‍රී 11:00 Group Admin Mode Active වී ඇත.* නැවත උදේ 6:00 ට open වේ. Good Night All!😴 Bot generated message.don't reply");
                console.log(`🌙 Night mode activated for ${groupId}`);
            } catch (e) { console.log("Night mode error", e); }
        }
    }, { scheduled: true, timezone: "Asia/Colombo" });

    // ========================================
    // ☀️ AUTO MORNING MODE (උදේ 6:00 ට ගෲප් අරියි)
    // ========================================
    cron.schedule("0 6 * * *", async () => {
        for (const groupId of TARGET_GROUP_IDS) {
            try {
                const chat = await client.getChatById(groupId);
                await chat.setMessagesAdminsOnly(false); // හැමෝටම මැසේජ් දාන්න දෙනවා
                await chat.sendMessage("☀️ *Good Morning All!* ගෲප් එක Open.😊Bot generated message.don't reply");
                console.log(`☀️ Morning mode activated for ${groupId}`);
            } catch (e) { console.log("Morning mode error", e); }
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
        const name = contact.pushname || contact.name || contact.shortName || "Unknown";
        return { contact, name, actualId, actualNumber };
    } catch (error) {
        return null;
    }
}

function isSriLankan(number) {
    if (!number) return false;
    return number.startsWith("94");
}

async function directRemoveParticipant(groupId, participantId, reason) {
    try {
        if (!ENABLE_AUTO_REMOVE) return false;
        const result = await client.pupPage.evaluate(async (groupId, participantId) => {
            try {
                const WWebJS = window.WWebJS;
                if (!WWebJS) return { success: false, error: "WWebJS unavailable" };
                try {
                    window.require("WAWebWidFactory").createWid(groupId);
                    await window.require("WAWebGroupQueryJob").queryAndUpdateGroupMetadataById({ id: groupId });
                } catch (metadataError) {}
                const chat = await WWebJS.getChat(groupId, { getAsModel: false });
                if (!chat) return { success: false, error: "Group chat unavailable" };

                const resolved = await WWebJS.enforceLidAndPnRetrieval(participantId);
                const lid = resolved && resolved.lid ? resolved.lid : null;
                const phone = resolved && resolved.phone ? resolved.phone : null;

                let participant = null;
                if (lid && chat.groupMetadata && chat.groupMetadata.participants) participant = chat.groupMetadata.participants.get(lid._serialized);
                if (!participant && phone && chat.groupMetadata && chat.groupMetadata.participants) participant = chat.groupMetadata.participants.get(phone._serialized);
                if (!participant && chat.groupMetadata && chat.groupMetadata.participants) participant = chat.groupMetadata.participants.get(participantId);

                if (!participant) return { success: false, error: "Participant not found" };

                if (participant.isAdmin === true || participant.isSuperAdmin === true) {
                    return { success: false, error: "ADMIN_PROTECTED" };
                }

                await window.require("WAWebModifyParticipantsGroupAction").removeParticipants(chat, [participant]);
                return { success: true };
            } catch (error) { return { success: false, error: String(error) }; }
        }, groupId, participantId);

        if (result && result.success) return true;
        return false;
    } catch (error) { return false; }
}

client.on("group_join", async (notification) => {
    try {
        if (!TARGET_GROUP_IDS.includes(notification.chatId)) return;
        const groupId = notification.chatId;

        const users = notification.recipientIds || [];
        for (const userId of users) {
            const info = await getContactInfo(userId);
            if (!info) continue;
            
            if (blacklistedUsers.has(userId)) {
                await client.sendMessage(groupId, `🚫 @${userId.split('@')[0]} You are blacklisted from this group.`, { mentions: [userId] });
                await directRemoveParticipant(groupId, userId, "Blacklisted");
                continue;
            }

            if (!isSriLankan(info.actualNumber)) {
                await client.sendMessage(groupId, `🌍 @${userId.split('@')[0]} Sorry, only Sri Lankan numbers (+94) are allowed in this group. You will be removed.`, { mentions: [userId] });
                await directRemoveParticipant(groupId, userId, "Non-Sri-Lankan number");
                continue;
            }

            const welcomeMsg = `📜 *GROUP GUIDELINES*\n\n👋 Welcome to the IFSLS 11th INTAKE MAIN GROUP\n\nHi @${userId.split('@')[0]} (${info.name})\n\nPlease follow these new admin rules:\n\n1️⃣ Respect all group members.\n2️⃣ 🚫 No spam or message flooding.\n3️⃣ 🚫 No scams, fraud or suspicious links.\n4️⃣ 🚫 No illegal or harmful content.\n5️⃣ Only Sri Lankan numbers are allowed.\n6️⃣ 🤝 Keep conversations respectful.\n7️⃣ 🛡️ Follow admin instructions.\n\n⚠️ Breaking these rules may result in automatic removal or ban from the group.\n\nThank you for being a responsible member.Bot generated message.don't reply!`;
            await client.sendMessage(groupId, welcomeMsg, { mentions: [userId] });
        }
    } catch (error) { console.log("❌ Group join error", error); }
});

client.on("message", async (message) => {
    try {
        if (!message.from || !message.from.endsWith("@g.us")) return;
        
        // 📌 අලුත් Group එකක ID එක හොයාගන්න කෑල්ල
        if (!TARGET_GROUP_IDS.includes(message.from)) {
            console.log(`\n📌 [NEW GROUP ID] : ${message.from}\n`);
            return;
        }
        
        const groupId = message.from;
        if (!message.author) return;

        const info = await getContactInfo(message.author);
        if (!info) return;
        const textLower = (message.body || "").toLowerCase();

        // 🌍 NON-SRI-LANKAN Check
        if (info.actualNumber && !isSriLankan(info.actualNumber)) {
            const removed = await directRemoveParticipant(groupId, message.author, "Non-Sri-Lankan number");
            if (removed) await client.sendMessage(groupId, `🌍 @${message.author.split('@')[0]} Sorry, only Sri Lankan numbers (+94) are allowed in this group.`, { mentions: [message.author] });
            return;
        }

        // 🔗 ANTI-LINK SYSTEM
        const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|wa\.me\/\d+|chat\.whatsapp\.com\/[A-Za-z0-9]+)/gi;
        if (linkRegex.test(message.body)) {
            const removed = await directRemoveParticipant(groupId, message.author, "Sending Links");
            if (removed) { 
                try { await message.delete(true); } catch(e) {} 
                blacklistedUsers.add(message.author);
                if (ENABLE_AUTO_REMOVE) await client.sendMessage(groupId, `🚫 @${message.author.split('@')[0]} has been removed for sending unauthorized links.`, { mentions: [message.author] });
            }
            return;
        }

        // 🤬 BAD WORDS FILTER
        const containsBadWord = BAD_WORDS.some(word => textLower.includes(word.toLowerCase()));
        if (containsBadWord) {
            const removed = await directRemoveParticipant(groupId, message.author, "Bad Words");
            if (removed) {
                try { await message.delete(true); } catch(e) {} 
                blacklistedUsers.add(message.author);
                if (ENABLE_AUTO_REMOVE) await client.sendMessage(groupId, `🤬 @${message.author.split('@')[0]} has been removed for using inappropriate language.`, { mentions: [message.author] });
            }
            return;
        }

        // 🤖 AUTO-REPLY / FAQ 
        if (textLower.includes("fee") || textLower.includes("ගාස්තුව") || textLower.includes("class fee") || textLower.includes("fee eka kiyda")) {
            await message.reply("💡null");
        }
        else if (textLower.includes("time") || textLower.includes("වෙලාව") || textLower.includes("කවදද") || textLower.includes("class eka thiyenne")) {
            await message.reply("⏰ null");
        }

        // 🚨 SPAM CHECK
        await checkSpam(message, message.author, info.name, groupId);

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
        const removed = await directRemoveParticipant(groupId, senderId, "Spam");
        if (removed) {
            blacklistedUsers.add(senderId);
            if (ENABLE_AUTO_REMOVE) await client.sendMessage(groupId, `🚨 @${senderId.split('@')[0]} has been removed for SPAMMING.`, { mentions: [senderId] });
        }
    }
}

console.log("\n========================================");
console.log("🤖 WHATSAPP MODERATION BOT");
console.log("========================================");
console.log("Starting...\n");
client.initialize();
