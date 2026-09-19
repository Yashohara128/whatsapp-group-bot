const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const cron = require("node-cron"); 
const fs = require("fs"); // 📂 Blacklist එක සේව් කරන්න අලුතින් ගත්ත කෑල්ල

// ========================================
// CONFIGURATION (ඔයාගේ Groups ටික)
// ========================================

const TARGET_GROUP_IDS = [
    "120363427144307038@g.us",
    "120363428845309010@g.us",
    "120363431402119738@g.us"
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
// DATA & BLACKLIST SYSTEM (Permanent Ban System)
// ========================================

const spamTracker = new Map();
const linkWarningTracker = new Map();   
const badWordWarningTracker = new Map(); 

const BLACKLIST_FILE = "./blacklist.json";
let blacklistedUsers = new Set();

// 📂 සර්වර් එක ඔන් වෙද්දි පරණ Blacklist එක ලෝඩ් කරනවා
if (fs.existsSync(BLACKLIST_FILE)) {
    try {
        blacklistedUsers = new Set(JSON.parse(fs.readFileSync(BLACKLIST_FILE, "utf-8")));
    } catch(e) { console.log("⚠️ Error loading blacklist", e); }
}

// 📂 අලුතින් බෑන් වෙන අයව ෆයිල් එකේ සේව් කරන ෆන්ක්ෂන් එක
function saveBlacklist() {
    try {
        fs.writeFileSync(BLACKLIST_FILE, JSON.stringify([...blacklistedUsers]));
    } catch(e) { console.log("⚠️ Error saving blacklist", e); }
}

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
    console.log("Features Active: Link Filter | Bad Words | Auto-Ban & Admin Bypass | Night Mode");
    console.log(`Total Blacklisted Users: ${blacklistedUsers.size}`);
    console.log("========================================\n");

    // 🌙 AUTO NIGHT MODE (රෑ 11:00 ට)
    cron.schedule("0 23 * * *", async () => {
        for (const groupId of TARGET_GROUP_IDS) {
            try {
                const chat = await client.getChatById(groupId);
                await chat.setMessagesAdminsOnly(true); 
                await chat.sendMessage("🌙 *රාත්‍රී 11:00 Group Admin Mode Active වී ඇත.* නැවත උදේ 6:00 ට open වේ. Good Night All!😴 Bot generated message.don't reply");
            } catch (e) { console.log("Night mode error", e); }
        }
    }, { scheduled: true, timezone: "Asia/Colombo" });

    // ☀️ AUTO MORNING MODE (උදේ 6:00 ට)
    cron.schedule("0 6 * * *", async () => {
        for (const groupId of TARGET_GROUP_IDS) {
            try {
                const chat = await client.getChatById(groupId);
                await chat.setMessagesAdminsOnly(false); 
                await chat.sendMessage("☀️ *Good Morning All!* ගෲප් එක Open.😊Bot generated message.don't reply");
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

        // 👨‍✈️ ඇඩ්මින් කෙනෙක්ද මේ යූසර්ව Add කළේ කියලා බලනවා
        const chat = await client.getChatById(groupId);
        let addedByAdmin = false;
        if (notification.author) {
            const authorParticipant = chat.participants.find(p => p.id._serialized === notification.author);
            if (authorParticipant && (authorParticipant.isAdmin || authorParticipant.isSuperAdmin)) {
                addedByAdmin = true;
            }
        }

        const users = notification.recipientIds || [];
        for (const userId of users) {
            const info = await getContactInfo(userId);
            if (!info) continue;
            
            // 🚫 BLACKLIST (BANNED) Check
            if (blacklistedUsers.has(userId)) {
                if (addedByAdmin) {
                    // ඇඩ්මින් කෙනෙක් අතින් add කළොත් බෑන් එක අයින් කරනවා!
                    blacklistedUsers.delete(userId);
                    saveBlacklist();
                    console.log(`✅ [UNBAN] Admin manually added ${info.name}. Removed from blacklist.`);
                } else {
                    // ලින්ක් එකෙන් ආවොත් කෙළින්ම අයින් කරනවා!
                    await client.sendMessage(groupId, `🚫 @${userId.split('@')[0]} (*${info.name}*), ඔබට මෙම සමූහයට නැවත සම්බන්ධ වීමට අවසර නැත (ඔබව Banned කර ඇත).`, { mentions: [info.contact] });
                    await directRemoveParticipant(groupId, userId, "Blacklisted (Tried to join via link)");
                    continue; // ඊළඟ පියවරවල් වලට යන්නෙ නෑ
                }
            }

            // 🌍 NON-SRI-LANKAN Check
            if (!isSriLankan(info.actualNumber)) {
                await client.sendMessage(groupId, `🌍 @${userId.split('@')[0]} (*${info.name}*) Sorry, only Sri Lankan numbers (+94) are allowed in this group. You will be removed.`, { mentions: [info.contact] });
                await directRemoveParticipant(groupId, userId, "Non-Sri-Lankan number");
                continue;
            }

            // 👋 WELCOME MESSAGE
            const welcomeMsg = `📜 *GROUP GUIDELINES*\n\n👋 Welcome to the IFSLS 11th INTAKE MAIN GROUP\n\nHi @${userId.split('@')[0]} (*${info.name}*)\n\nPlease follow these new admin rules:\n\n1️⃣ Respect all group members.\n2️⃣ 🚫 No spam or message flooding.\n3️⃣ 🚫 No scams, fraud or suspicious links.\n4️⃣ 🚫 No illegal or harmful content.\n5️⃣ Only Sri Lankan numbers are allowed.\n6️⃣ 🤝 Keep conversations respectful.\n7️⃣ 🛡️ Follow admin instructions.\n\n⚠️ Breaking these rules may result in automatic removal or ban from the group.\n\nThank you for being a responsible member.Bot generated message.don't reply!`;
            
            await client.sendMessage(userId, welcomeMsg);
        }
    } catch (error) { console.log("❌ Group join error", error); }
});

client.on("message", async (message) => {
    try {
        if (!message.from || !message.from.endsWith("@g.us")) return;
        
        if (!TARGET_GROUP_IDS.includes(message.from)) {
            return;
        }
        
        const groupId = message.from;
        if (!message.author) return;

        const info = await getContactInfo(message.author);
        if (!info) return;
        const textLower = (message.body || "").toLowerCase();

        // ----------------------------------------
        // 📩 CONSOLE LOG
        // ----------------------------------------
        console.log("\n----------------------------------------");
        console.log(`📩 Group ID : ${groupId}`);
        console.log(`👤 Name     : ${info.name}`);
        console.log(`📞 Number   : +${info.actualNumber}`);
        console.log(`💬 Message  : ${message.body || "[Media / Sticker]"}`);
        console.log("----------------------------------------");

        // 🌍 NON-SRI-LANKAN Check (මැසේජ් දාද්දි අහුවුණොත්)
        if (info.actualNumber && !isSriLankan(info.actualNumber)) {
            const removed = await directRemoveParticipant(groupId, message.author, "Non-Sri-Lankan number");
            if (removed) {
                await client.sendMessage(groupId, `🌍 @${message.author.split('@')[0]} (*${info.name}*) Sorry, only Sri Lankan numbers (+94) are allowed in this group.`, { mentions: [info.contact] });
            }
            return;
        }

        // 🔗 CRASH-PROOF SMART LINK FILTER
        const hasLinkIndicator = textLower.includes("http://") || 
                                 textLower.includes("https://") || 
                                 textLower.includes("www.") || 
                                 textLower.includes(".com") || 
                                 textLower.includes(".net") || 
                                 textLower.includes(".org") || 
                                 textLower.includes(".me") || 
                                 textLower.includes(".co") ||
                                 textLower.includes("t.me");

        if (hasLinkIndicator) {
            let isAdmin = false;
            
            try {
                const chat = await message.getChat();
                if (chat && chat.participants) {
                    const participant = chat.participants.find(p => p.id._serialized === message.author);
                    isAdmin = participant && (participant.isAdmin || participant.isSuperAdmin);
                }
            } catch (err) {
                console.log("⚠️ [WARNING] Could not verify admin status due to WWebJS Bug. Assuming normal user.");
                isAdmin = false;
            }

            if (!isAdmin) {
                const isTelegramLink = textLower.includes("t.me/") || textLower.includes("telegram.me/");
                const isAllowedEducationalLink = textLower.includes("youtube.com") || 
                                                 textLower.includes("youtu.be") || 
                                                 textLower.includes("drive.google.com") || 
                                                 textLower.includes("zoom.us") || 
                                                 textLower.includes("teams.microsoft.com") || 
                                                 textLower.includes("docs.google.com") || 
                                                 textLower.includes("forms.gle") || 
                                                 textLower.includes("classroom.google.com");

                const scamOrBusinessKeywords = [
                    "earn money", "crypto", "forex", "business", "job opportunity", 
                    "free cash", "marketing", "signals", "trading", "invest", 
                    "lottery", "win cash", "fast money", "income", "whatsapp.com/chat"
                ];

                const containsScamOrBusiness = scamOrBusinessKeywords.some(keyword => textLower.includes(keyword));

                let shouldBlock = false;
                if (isTelegramLink) {
                    shouldBlock = true; 
                } else if (containsScamOrBusiness) {
                    shouldBlock = true; 
                } else if (!isAllowedEducationalLink && !textLower.includes("chat.whatsapp.com")) {
                    shouldBlock = true; 
                }

                if (shouldBlock) {
                    console.log("🚨 [FILTER] Link Block Triggered! Deleting message...");
                    
                    try { 
                        await message.delete(true); 
                        console.log("✅ Message successfully deleted.");
                    } catch(e) { 
                        console.log("⚠️ Could not delete message:", e); 
                    } 

                    let warnings = linkWarningTracker.get(message.author) || 0;
                    warnings++;
                    linkWarningTracker.set(message.author, warnings);

                    if (warnings === 1) {
                        await client.sendMessage(groupId, `⚠️ @${message.author.split('@')[0]} (*${info.name}*)\nමෙම කණ්ඩායම තුළ අවසර නොලත් ලින්ක් හෝ ව්‍යාපාරික/ටෙලිග්‍රෑම් ලින්ක් Share කිරීම තහනම්! මෙය ඔබගේ *පළමු අවවාදයයි*. අධ්‍යාපනික ලින්ක් සහ අධ්‍යාපනික වට්ස්ඇප් ගෲප් ලින්ක් පමණක් අවසර ඇත. නැවත දැමුවහොත් ගෲප් එකෙන් ඉවත් කරනු ලැබේ. 🚫`, { mentions: [info.contact] });
                    } else {
                        const removed = await directRemoveParticipant(groupId, message.author, "Sending Unauthorized Links");
                        if (removed) {
                            blacklistedUsers.add(message.author);
                            saveBlacklist(); // 📂 බෑන් ලිස්ට් එක සේව් කරනවා
                            if (ENABLE_AUTO_REMOVE) {
                                await client.sendMessage(groupId, `🚫 @${message.author.split('@')[0]} (*${info.name}*) අවවාද නොතකා නැවත තහනම් ලින්ක් දැමූ නිසා ගෲප් එකෙන් ස්ථිරවම ඉවත් කරන ලදී.`, { mentions: [info.contact] });
                            }
                        }
                    }
                    return;
                }
            }
        }

        // 🤬 BAD WORDS FILTER 
        const containsBadWord = BAD_WORDS.some(word => textLower.includes(word.toLowerCase()));
        if (containsBadWord) {
            let isAdmin = false;
            
            try {
                const chat = await message.getChat();
                if (chat && chat.participants) {
                    const participant = chat.participants.find(p => p.id._serialized === message.author);
                    isAdmin = participant && (participant.isAdmin || participant.isSuperAdmin);
                }
            } catch (err) {
                isAdmin = false;
            }

            if (!isAdmin) {
                try { await message.delete(true); } catch(e) {} 

                let warnings = badWordWarningTracker.get(message.author) || 0;
                warnings++;
                badWordWarningTracker.set(message.author, warnings);

                if (warnings === 1) {
                    await client.sendMessage(groupId, `⚠️ @${message.author.split('@')[0]} (*${info.name}*)\nමෙම කණ්ඩායම තුළ අපහාසාත්මක හෝ තහනම් වචන භාවිතය තහනම්! මෙය ඔබගේ *පළමු අවවාදයයි*. නැවත එවැනි වචන භාවිත කළහොත් ගෲප් එකෙන් ඉවත් කරනු ලැබේ. 🤬`, { mentions: [info.contact] });
                } else {
                    const removed = await directRemoveParticipant(groupId, message.author, "Bad Words");
                    if (removed) {
                        blacklistedUsers.add(message.author);
                        saveBlacklist(); // 📂 බෑන් ලිස්ට් එක සේව් කරනවා
                        if (ENABLE_AUTO_REMOVE) {
                            await client.sendMessage(groupId, `🚫 @${message.author.split('@')[0]} (*${info.name}*) අවවාද නොතකා නැවත අපහාසාත්මක වචන භාවිත කළ නිසා ගෲප් එකෙන් ස්ථිරවම ඉවත් කරන ලදී.`, { mentions: [info.contact] });
                        }
                    }
                }
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

    } catch (error) {
        console.log("❌ [CRITICAL ERROR IN MESSAGE EVENT]:", error);
    }
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
            saveBlacklist(); // 📂 බෑන් ලිස්ට් එක සේව් කරනවා
            if (ENABLE_AUTO_REMOVE) {
                const info = await getContactInfo(senderId);
                const contact = info ? info.contact : senderId;
                const displayName = info ? info.name : "Unknown User";
                await client.sendMessage(groupId, `🚨 @${senderId.split('@')[0]} (*${displayName}*) has been permanently removed for SPAMMING.`, { mentions: [contact] });
            }
        }
    }
}

console.log("\n========================================");
console.log("🤖 WHATSAPP MODERATION BOT");
console.log("========================================");
console.log("Starting...\n");
client.initialize();
