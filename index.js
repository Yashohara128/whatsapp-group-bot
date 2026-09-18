const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

// ========================================
// CONFIGURATION
// ========================================

const TARGET_GROUP_ID = "120363427144307038@g.us";
const CHROME_PATH = "/usr/bin/chromium-browser";

// ========================================
// SETTINGS
// ========================================

const ENABLE_AUTO_REMOVE = true;
const SPAM_WINDOW_MS = 10 * 1000;
const SPAM_LIMIT = 5;

// ========================================
// DATA
// ========================================

const spamTracker = new Map();
const blacklistedUsers = new Set(); // 🚫 Blacklist Data

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

// ========================================
// QR
// ========================================

client.on("qr", (qr) => {
    console.log("\n========================================");
    console.log("📱 SCAN QR CODE");
    console.log("========================================\n");
    qrcode.generate(qr, { small: true });
});

// ========================================
// AUTHENTICATED
// ========================================

client.on("authenticated", () => {
    console.log("✅ WhatsApp authenticated");
});

// ========================================
// AUTH FAILURE
// ========================================

client.on("auth_failure", (error) => {
    console.log("❌ Authentication failed");
    console.error(error);
});

// ========================================
// READY
// ========================================

client.on("ready", () => {
    console.log("\n========================================");
    console.log("🤖 BOT READY");
    console.log("========================================");
    console.log("Target:", TARGET_GROUP_ID);
    console.log("Auto Remove:", ENABLE_AUTO_REMOVE ? "ON 🚨" : "OFF 🧪");
    console.log(`Spam: ${SPAM_LIMIT} messages / ${SPAM_WINDOW_MS / 1000}s`);
    console.log("========================================\n");
});

// ========================================
// CONTACT INFO
// ========================================

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
        console.log("❌ Contact lookup failed:", error.message || error);
        return null;
    }
}

// ========================================
// COUNTRY CHECK
// ========================================

function isSriLankan(number) {
    if (!number) return false;
    return number.startsWith("94");
}

// ========================================
// DIRECT REMOVE (Includes Admin Protection)
// ========================================

async function directRemoveParticipant(participantId, reason) {
    try {
        console.log("\n========================================");
        console.log("🚨 REMOVE REQUEST");
        console.log("========================================");
        console.log("Participant:", participantId);
        console.log("Reason:", reason);

        if (!ENABLE_AUTO_REMOVE) {
            console.log("🧪 TEST MODE - NOT REMOVED");
            return false;
        }

        const result = await client.pupPage.evaluate(async (groupId, participantId) => {
            try {
                const WWebJS = window.WWebJS;
                if (!WWebJS) return { success: false, error: "WWebJS unavailable" };

                try {
                    const groupWid = window.require("WAWebWidFactory").createWid(groupId);
                    await window.require("WAWebGroupQueryJob").queryAndUpdateGroupMetadataById({ id: groupId });
                } catch (metadataError) {
                    console.log("Metadata refresh failed:", metadataError);
                }

                const chat = await WWebJS.getChat(groupId, { getAsModel: false });
                if (!chat) return { success: false, error: "Group chat unavailable" };

                const resolved = await WWebJS.enforceLidAndPnRetrieval(participantId);
                const lid = resolved && resolved.lid ? resolved.lid : null;
                const phone = resolved && resolved.phone ? resolved.phone : null;

                let participant = null;
                if (lid && chat.groupMetadata && chat.groupMetadata.participants) participant = chat.groupMetadata.participants.get(lid._serialized);
                if (!participant && phone && chat.groupMetadata && chat.groupMetadata.participants) participant = chat.groupMetadata.participants.get(phone._serialized);
                if (!participant && chat.groupMetadata && chat.groupMetadata.participants) participant = chat.groupMetadata.participants.get(participantId);

                if (!participant) return { success: false, error: "Participant not found in group metadata" };

                // ADMIN PROTECTION CHECK
                if (participant.isAdmin === true || participant.isSuperAdmin === true) {
                    return { success: false, error: "ADMIN_PROTECTED" };
                }

                await window.require("WAWebModifyParticipantsGroupAction").removeParticipants(chat, [participant]);
                return { success: true };

            } catch (error) {
                return { success: false, error: error && error.message ? error.message : String(error) };
            }
        }, TARGET_GROUP_ID, participantId);

        console.log("Removal result:", result);

        if (result && result.success) {
            console.log("✅ USER REMOVED SUCCESSFULLY 🚨");
            return true;
        }

        if (result && result.error === "ADMIN_PROTECTED") {
            console.log("🛡️ ADMIN PROTECTED (Ignored)");
            return false; // Admin කෙනෙක් නිසා අයින් කළේ නෑ
        }

        console.log("❌ REMOVE FAILED:", result ? result.error : "Unknown error");
        return false;
    } catch (error) {
        console.log("❌ DIRECT REMOVE ERROR");
        console.error(error);
        return false;
    }
}

// ========================================
// GROUP JOIN
// ========================================

client.on("group_join", async (notification) => {
    try {
        if (notification.chatId !== TARGET_GROUP_ID) return;

        console.log("\n========================================");
        console.log("👤 NEW MEMBER");
        console.log("========================================");

        const users = notification.recipientIds || [];

        for (const userId of users) {
            console.log("\nParticipant:", userId);
            const info = await getContactInfo(userId);
            if (!info) {
                console.log("❓ Cannot resolve contact");
                continue;
            }

            console.log("Name:", info.name);
            console.log("Actual ID:", info.actualId);
            console.log("Number:", info.actualNumber ? "+" + info.actualNumber : "Unknown");
            
            // 🚫 Blacklist චෙක් කිරීම
            if (blacklistedUsers.has(userId)) {
                console.log("🚫 BLACKLISTED USER TRIED TO JOIN");
                await client.sendMessage(TARGET_GROUP_ID, `🚫 @${userId.split('@')[0]} You are blacklisted from this group.`, { mentions: [userId] });
                await directRemoveParticipant(userId, "Blacklisted");
                continue;
            }

            // 🌍 Non-Sri Lankan චෙක් කිරීම
            if (!isSriLankan(info.actualNumber)) {
                console.log("🚨 NON-SRI-LANKAN");
                await client.sendMessage(TARGET_GROUP_ID, `🌍 @${userId.split('@')[0]} Sorry, only Sri Lankan numbers (+94) are allowed in this group. You will be removed.`, { mentions: [userId] });
                await directRemoveParticipant(userId, "Non-Sri-Lankan number");
                continue;
            }

            // 👋 ලංකාවේ කෙනෙක් නම් Welcome මැසේජ් එක යැවීම
            console.log("🇱🇰 ALLOWED - Sending Welcome");
            
            const welcomeMsg = `📜 *GROUP GUIDELINES*\n\n👋 Welcome to the IFSLS 11th INTAKE MAIN GROUP 01 \n\nHi @${userId.split('@')[0]} (${info.name})\n\nPlease follow these rules:\n\n1️⃣ Respect all group members.\n2️⃣ 🚫 No spam or message flooding.\n3️⃣ 🚫 No scams, fraud or suspicious links.\n4️⃣ 🚫 No illegal or harmful content.\n5️⃣ Only Sri Lankan numbers are allowed.\n6️⃣ 🤝 Keep conversations respectful.\n7️⃣ 🛡️ Follow admin instructions.\n\n⚠️ Breaking these rules may result in automatic removal.\n\nThank you for being a responsible member!`;
            
            await client.sendMessage(TARGET_GROUP_ID, welcomeMsg, { mentions: [userId] });
        }
    } catch (error) {
        console.log("❌ Group join error");
        console.error(error);
    }
});

// ========================================
// MESSAGE
// ========================================

client.on("message", async (message) => {
    try {
        if (!message.from || !message.from.endsWith("@g.us")) return;
        if (message.from !== TARGET_GROUP_ID) return;
        if (!message.author) return;

        console.log("\n----------------------------------------");
        console.log("📩 Message:", message.body || "[Media]");
        console.log("LID:", message.author);
        
        const info = await getContactInfo(message.author);
        if (!info) {
            console.log("❓ Could not resolve sender");
            return;
        }

        console.log("Name:", info.name);
        console.log("Actual Number:", info.actualNumber ? "+" + info.actualNumber : "Unknown");

        // 🌍 NON-SRI-LANKAN (මැසේජ් කරනකොට අල්ලනවා)
        if (info.actualNumber && !isSriLankan(info.actualNumber)) {
            console.log("🚨 NON-SRI-LANKAN USER");
            // අයින් කරලා බලනවා (Admin නම් අයින් වෙන්නේ නෑ)
            const removed = await directRemoveParticipant(message.author, "Non-Sri-Lankan number");
            if (removed) {
                await client.sendMessage(TARGET_GROUP_ID, `🌍 @${message.author.split('@')[0]} Sorry, only Sri Lankan numbers (+94) are allowed in this group.`, { mentions: [message.author] });
            }
            return;
        }

        // 🚨 SPAM (චෙක් කරනවා)
        await checkSpam(message.author, info.name);

    } catch (error) {
        console.log("❌ Message handler error");
        console.error(error);
    }
});

// ========================================
// SPAM CHECK
// ========================================

async function checkSpam(senderId, name) {
    const now = Date.now();

    if (!spamTracker.has(senderId)) {
        spamTracker.set(senderId, []);
    }

    let timestamps = spamTracker.get(senderId);
    timestamps = timestamps.filter(timestamp => now - timestamp < SPAM_WINDOW_MS);
    timestamps.push(now);
    spamTracker.set(senderId, timestamps);

    console.log(`📊 Spam count: ${timestamps.length}/${SPAM_LIMIT}`);

    if (timestamps.length >= SPAM_LIMIT) {
        console.log("\n========================================");
        console.log("🚨🚨 SPAM DETECTED 🚨🚨");
        console.log("User:", name);

        // Reset before removal
        spamTracker.set(senderId, []);

        // Remove කරන්න Try කරනවා. 
        // (අදාළ කෙනා Admin කෙනෙක් නම් directRemoveParticipant එක ඇතුළෙන්ම අයින් කරන එක නවත්තනවා).
        const removed = await directRemoveParticipant(senderId, "Spam - 5 messages within 10 seconds");

        // සාර්ථකව අයින් වුණා නම් (ඒ කියන්නේ Admin කෙනෙක් නෙවෙයි නම්) විතරක් Blacklist කරලා මැසේජ් එක දානවා.
        if (removed) {
            blacklistedUsers.add(senderId);
            if (ENABLE_AUTO_REMOVE) {
                await client.sendMessage(TARGET_GROUP_ID, `🚨 @${senderId.split('@')[0]} has been removed for SPAMMING.`, { mentions: [senderId] });
            }
        }
    }
}

// ========================================
// GROUP LEAVE
// ========================================

client.on("group_leave", (notification) => {
    if (notification.chatId !== TARGET_GROUP_ID) return;
    console.log("👋 User left/was removed:", notification.recipientIds || []);
});

// ========================================
// STATE
// ========================================

client.on("change_state", (state) => {
    console.log("WhatsApp State:", state);
});

// ========================================
// DISCONNECTED
// ========================================

client.on("disconnected", (reason) => {
    console.log("⚠️ WhatsApp disconnected:", reason);
});

// ========================================
// START
// ========================================

console.log("\n========================================");
console.log("🤖 WHATSAPP MODERATION BOT");
console.log("========================================");
console.log("Starting...\n");

client.initialize();
