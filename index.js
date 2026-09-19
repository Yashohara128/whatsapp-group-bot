const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const cron = require("node-cron");
const fs = require("fs");

// ========================================
// CONFIGURATION
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

const BAD_WORDS = [
    "hutto",
    "uba",
    "thopi",
    "pakyala",
    "palayan",
    "pnnyo"
];

// How often the bot checks group members
// for newly joined/added students.
const MEMBER_CHECK_INTERVAL_MS = 5000;

// ========================================
// DATA & BLACKLIST SYSTEM
// ========================================

const spamTracker = new Map();
const linkWarningTracker = new Map();
const badWordWarningTracker = new Map();

const BLACKLIST_FILE = "./blacklist.json";

let blacklistedUsers = new Set();

if (fs.existsSync(BLACKLIST_FILE)) {
    try {
        blacklistedUsers = new Set(
            JSON.parse(fs.readFileSync(BLACKLIST_FILE, "utf-8"))
        );
    } catch (e) {
        console.log("⚠️ Error loading blacklist", e);
    }
}

function saveBlacklist() {
    try {
        fs.writeFileSync(
            BLACKLIST_FILE,
            JSON.stringify([...blacklistedUsers])
        );
    } catch (e) {
        console.log("⚠️ Error saving blacklist", e);
    }
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

// ========================================
// QR
// ========================================

client.on("qr", (qr) => {
    console.log("\n========================================");
    console.log("📱 SCAN QR CODE");
    console.log("========================================\n");

    qrcode.generate(qr, {
        small: true
    });
});

// ========================================
// AUTHENTICATED
// ========================================

client.on("authenticated", () => {
    console.log("✅ WhatsApp authenticated");
});

// ========================================
// CONTACT / LID RESOLVER
// ========================================

async function getContactInfo(id) {
    try {
        if (!id) {
            return null;
        }

        const contact = await client.getContactById(id);

        if (!contact) {
            return null;
        }

        const originalId =
            contact.id && contact.id._serialized
                ? contact.id._serialized
                : id;

        const name =
            contact.pushname ||
            contact.name ||
            contact.shortName ||
            "Unknown User";

        let phoneId = null;
        let phoneNumber = "";

        // ==================================================
        // IMPORTANT:
        // WhatsApp can give group participants as @lid.
        // Resolve @lid -> real @c.us phone ID.
        // ==================================================

        try {
            const resolved = await client.pupPage.evaluate(
                async (participantId) => {
                    try {
                        if (
                            !window.WWebJS ||
                            typeof window.WWebJS
                                .enforceLidAndPnRetrieval !== "function"
                        ) {
                            return null;
                        }

                        const result =
                            await window.WWebJS.enforceLidAndPnRetrieval(
                                participantId
                            );

                        return {
                            lid:
                                result && result.lid
                                    ? result.lid._serialized
                                    : null,

                            phone:
                                result && result.phone
                                    ? result.phone._serialized
                                    : null
                        };
                    } catch (e) {
                        return null;
                    }
                },
                id
            );

            if (resolved && resolved.phone) {
                phoneId = resolved.phone;
                phoneNumber = resolved.phone.split("@")[0];
            }
        } catch (e) {
            console.log(
                "⚠️ LID resolution failed:",
                e.message || e
            );
        }

        // Normal @c.us ID
        if (!phoneId && originalId.endsWith("@c.us")) {
            phoneId = originalId;
            phoneNumber = originalId.split("@")[0];
        }

        // Fallback using contact.number
        if (!phoneId && contact.number) {
            phoneNumber = String(contact.number).replace(/\D/g, "");

            if (phoneNumber) {
                phoneId = `${phoneNumber}@c.us`;
            }
        }

        return {
            contact,
            name,

            actualId: phoneId || originalId,

            actualNumber: phoneNumber,

            dmId: phoneId || originalId,

            originalId
        };

    } catch (error) {
        console.log(
            "⚠️ getContactInfo error:",
            error.message || error
        );

        return null;
    }
}

// ========================================
// SRI LANKAN NUMBER CHECK
// ========================================

function isSriLankan(number) {
    if (!number) {
        return false;
    }

    return number.startsWith("94");
}

// ========================================
// REMOVE PARTICIPANT
// ========================================

async function directRemoveParticipant(
    groupId,
    participantId,
    reason
) {
    try {
        if (!ENABLE_AUTO_REMOVE) {
            return false;
        }

        const result = await client.pupPage.evaluate(
            async (groupId, participantId) => {
                try {
                    const WWebJS = window.WWebJS;

                    if (!WWebJS) {
                        return {
                            success: false,
                            error: "WWebJS unavailable"
                        };
                    }

                    // Refresh group metadata
                    try {
                        window
                            .require("WAWebWidFactory")
                            .createWid(groupId);

                        await window
                            .require("WAWebGroupQueryJob")
                            .queryAndUpdateGroupMetadataById({
                                id: groupId
                            });

                    } catch (metadataError) {}

                    const chat = await WWebJS.getChat(
                        groupId,
                        {
                            getAsModel: false
                        }
                    );

                    if (!chat) {
                        return {
                            success: false,
                            error: "Group chat unavailable"
                        };
                    }

                    // Resolve LID / Phone ID
                    let resolved = null;

                    try {
                        resolved =
                            await WWebJS.enforceLidAndPnRetrieval(
                                participantId
                            );
                    } catch (resolveError) {}

                    const lid =
                        resolved && resolved.lid
                            ? resolved.lid
                            : null;

                    const phone =
                        resolved && resolved.phone
                            ? resolved.phone
                            : null;

                    let participant = null;

                    if (
                        lid &&
                        chat.groupMetadata &&
                        chat.groupMetadata.participants
                    ) {
                        participant =
                            chat.groupMetadata.participants.get(
                                lid._serialized
                            );
                    }

                    if (
                        !participant &&
                        phone &&
                        chat.groupMetadata &&
                        chat.groupMetadata.participants
                    ) {
                        participant =
                            chat.groupMetadata.participants.get(
                                phone._serialized
                            );
                    }

                    if (
                        !participant &&
                        chat.groupMetadata &&
                        chat.groupMetadata.participants
                    ) {
                        participant =
                            chat.groupMetadata.participants.get(
                                participantId
                            );
                    }

                    if (!participant) {
                        return {
                            success: false,
                            error: "Participant not found"
                        };
                    }

                    // Never remove admins
                    if (
                        participant.isAdmin === true ||
                        participant.isSuperAdmin === true
                    ) {
                        return {
                            success: false,
                            error: "ADMIN_PROTECTED"
                        };
                    }

                    await window
                        .require(
                            "WAWebModifyParticipantsGroupAction"
                        )
                        .removeParticipants(
                            chat,
                            [participant]
                        );

                    return {
                        success: true
                    };

                } catch (error) {
                    return {
                        success: false,
                        error: String(error)
                    };
                }
            },
            groupId,
            participantId
        );

        if (result && result.success) {
            console.log(
                `✅ Removed participant. Reason: ${reason}`
            );

            return true;
        }

        console.log(
            `⚠️ Remove failed. Reason: ${reason}`,
            result
        );

        return false;

    } catch (error) {
        console.log(
            "❌ directRemoveParticipant error:",
            error.message || error
        );

        return false;
    }
}

// ========================================
// WELCOME MESSAGE
// ========================================

function createWelcomeMessage(name) {
    return `🎓 *Welcome to IFSLS 11th INTAKE MAIN GROUP* 🎓

👋 Hello / ආයුබෝවන් *${name}*,

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

📺 *YouTube Playlist:*
https://youtube.com/playlist?list=PL-ZbzAh0pKykpa-odcUrDEg94PBbTQp9M&si=F9L3Spy-pLZJq31n

⚠️ *Note:* Breaking these rules will result in an automatic permanent ban by the system.
(මෙම නීති කඩකරන අයව පද්ධතිය මගින් ස්වයංක්‍රීයව සමූහයෙන් ඉවත් කරනු ලැබේ.)

Thank you! / ස්තූතියි!

🤖 _System Generated Message. Please do not reply._`;
}

// ========================================
// SEND WELCOME DM
// ========================================

async function sendWelcomeDM(userId) {
    try {
        console.log(
            `📨 Preparing welcome DM for: ${userId}`
        );

        let info = await getContactInfo(userId);

        if (!info) {
            console.log(
                `❌ Could not get contact information for ${userId}`
            );

            return false;
        }

        console.log(
            `👤 Detected user: ${info.name}`
        );

        console.log(
            `📱 Original ID: ${info.originalId}`
        );

        console.log(
            `📱 Resolved ID: ${info.dmId}`
        );

        console.log(
            `📞 Number: ${info.actualNumber}`
        );

        // Only Sri Lankan numbers
        if (!isSriLankan(info.actualNumber)) {
            console.log(
                `🌍 Non-Sri-Lankan user detected: ${info.name}`
            );

            return false;
        }

        const welcomeMsg =
            createWelcomeMessage(info.name);

        const recipient =
            info.dmId || info.actualId;

        if (!recipient) {
            console.log(
                `❌ No DM recipient available for ${info.name}`
            );

            return false;
        }

        // ==================================================
        // FIRST ATTEMPT
        // ==================================================

        try {
            await client.sendMessage(
                recipient,
                welcomeMsg
            );

            console.log(
                `✅ WELCOME DM SENT to ${info.name}`
            );

            return true;

        } catch (firstError) {

            console.log(
                `⚠️ First DM attempt failed for ${info.name}:`,
                firstError.message || firstError
            );
        }

        // ==================================================
        // SECOND ATTEMPT
        // Refresh LID -> Phone mapping
        // ==================================================

        await new Promise(resolve =>
            setTimeout(resolve, 1500)
        );

        try {
            info = await getContactInfo(userId);

            if (!info) {
                return false;
            }

            const retryRecipient =
                info.dmId || info.actualId;

            if (!retryRecipient) {
                return false;
            }

            await client.sendMessage(
                retryRecipient,
                welcomeMsg
            );

            console.log(
                `✅ WELCOME DM RETRY SUCCESS for ${info.name}`
            );

            return true;

        } catch (retryError) {

            console.log(
                `❌ WELCOME DM RETRY FAILED:`,
                retryError.message || retryError
            );

            return false;
        }

    } catch (error) {

        console.log(
            "❌ sendWelcomeDM error:",
            error.message || error
        );

        return false;
    }
}

// ========================================
// NEW MEMBER TRACKER
// ========================================

// groupId -> Set(participant IDs)
const knownGroupMembers = new Map();

// Prevent duplicate welcome messages
const welcomedUsers = new Set();

// Prevent simultaneous processing
const processingWelcomeUsers = new Set();

// ========================================
// INITIALIZE GROUP MEMBER CACHE
// ========================================

async function initializeMemberCache() {
    console.log("\n========================================");
    console.log("👥 INITIALIZING GROUP MEMBER WATCHER");
    console.log("========================================");

    for (const groupId of TARGET_GROUP_IDS) {
        try {
            const chat =
                await client.getChatById(groupId);

            if (
                !chat ||
                !chat.participants
            ) {
                console.log(
                    `⚠️ Cannot read members of ${groupId}`
                );

                continue;
            }

            const members = new Set();

            for (const participant of chat.participants) {
                if (
                    participant &&
                    participant.id &&
                    participant.id._serialized
                ) {
                    members.add(
                        participant.id._serialized
                    );
                }
            }

            knownGroupMembers.set(
                groupId,
                members
            );

            console.log(
                `✅ Cached ${members.size} members for ${groupId}`
            );

        } catch (error) {

            console.log(
                `❌ Cache error for ${groupId}:`,
                error.message || error
            );
        }
    }

    console.log("========================================\n");
}

// ========================================
// CHECK FOR NEW MEMBERS
// ========================================

async function checkForNewMembers() {
    for (const groupId of TARGET_GROUP_IDS) {

        try {
            const chat =
                await client.getChatById(groupId);

            if (
                !chat ||
                !chat.participants
            ) {
                continue;
            }

            let knownMembers =
                knownGroupMembers.get(groupId);

            if (!knownMembers) {
                knownMembers = new Set();

                for (
                    const participant
                    of chat.participants
                ) {
                    if (
                        participant &&
                        participant.id &&
                        participant.id._serialized
                    ) {
                        knownMembers.add(
                            participant.id._serialized
                        );
                    }
                }

                knownGroupMembers.set(
                    groupId,
                    knownMembers
                );

                continue;
            }

            const currentMembers = new Set();

            for (
                const participant
                of chat.participants
            ) {
                if (
                    participant &&
                    participant.id &&
                    participant.id._serialized
                ) {
                    currentMembers.add(
                        participant.id._serialized
                    );
                }
            }

            // Find new members
            const newMembers = [];

            for (
                const memberId
                of currentMembers
            ) {
                if (!knownMembers.has(memberId)) {
                    newMembers.push(memberId);
                }
            }

            // Update cache immediately
            knownGroupMembers.set(
                groupId,
                currentMembers
            );

            // No new members
            if (newMembers.length === 0) {
                continue;
            }

            console.log("\n========================================");
            console.log(
                `🆕 NEW MEMBER(S) DETECTED: ${newMembers.length}`
            );
            console.log(
                `👥 Group: ${groupId}`
            );
            console.log("========================================");

            for (const userId of newMembers) {

                if (
                    welcomedUsers.has(userId)
                ) {
                    continue;
                }

                if (
                    processingWelcomeUsers.has(userId)
                ) {
                    continue;
                }

                processingWelcomeUsers.add(
                    userId
                );

                try {

                    console.log(
                        `🔍 Processing new member: ${userId}`
                    );

                    const info =
                        await getContactInfo(userId);

                    if (!info) {
                        console.log(
                            `⚠️ Contact information unavailable for ${userId}`
                        );

                        continue;
                    }

                    console.log(
                        `👤 New member name: ${info.name}`
                    );

                    console.log(
                        `📞 Resolved number: ${info.actualNumber}`
                    );

                    // ==================================================
                    // BLACKLIST CHECK
                    // ==================================================

                    if (
                        blacklistedUsers.has(userId) ||
                        blacklistedUsers.has(info.dmId)
                    ) {

                        console.log(
                            `🚫 Blacklisted user detected: ${info.name}`
                        );

                        await client.sendMessage(
                            groupId,
                            `🚫 @${info.actualNumber || userId.split("@")[0]} (*${info.name}*), ඔබට මෙම සමූහයට නැවත සම්බන්ධ වීමට අවසර නැත (ඔබව Banned කර ඇත).`,
                            {
                                mentions: [
                                    info.dmId || userId
                                ]
                            }
                        );

                        await directRemoveParticipant(
                            groupId,
                            userId,
                            "Blacklisted"
                        );

                        continue;
                    }

                    // ==================================================
                    // COUNTRY CHECK
                    // ==================================================

                    if (
                        !isSriLankan(
                            info.actualNumber
                        )
                    ) {

                        console.log(
                            `🌍 NON-SRI-LANKAN USER: ${info.name}`
                        );

                        await client.sendMessage(
                            groupId,
                            `🌍 @${info.actualNumber || userId.split("@")[0]} (*${info.name}*) Sorry, only Sri Lankan numbers (+94) are allowed in this group. You will be removed.`,
                            {
                                mentions: [
                                    info.dmId || userId
                                ]
                            }
                        );

                        await directRemoveParticipant(
                            groupId,
                            userId,
                            "Non-Sri-Lankan number"
                        );

                        continue;
                    }

                    // ==================================================
                    // SEND WELCOME DM
                    // ==================================================

                    const sent =
                        await sendWelcomeDM(
                            userId
                        );

                    if (sent) {

                        welcomedUsers.add(
                            userId
                        );

                        console.log(
                            `🎉 Welcome process completed for ${info.name}`
                        );

                    } else {

                        console.log(
                            `⚠️ Welcome DM could not be sent to ${info.name}`
                        );
                    }

                } catch (error) {

                    console.log(
                        `❌ New member processing error:`,
                        error.message || error
                    );

                } finally {

                    processingWelcomeUsers.delete(
                        userId
                    );
                }

                // Small delay between users
                await new Promise(resolve =>
                    setTimeout(resolve, 500)
                );
            }

            console.log("========================================\n");

        } catch (error) {

            console.log(
                `⚠️ Member watcher error for ${groupId}:`,
                error.message || error
            );
        }
    }
}

// ========================================
// START MEMBER WATCHER
// ========================================

function startMemberWatcher() {

    console.log(
        `👀 Member watcher started. Checking every ${MEMBER_CHECK_INTERVAL_MS / 1000}s`
    );

    setInterval(
        checkForNewMembers,
        MEMBER_CHECK_INTERVAL_MS
    );
}

// ========================================
// READY
// ========================================

client.on("ready", async () => {

    console.log("\n========================================");
    console.log("🤖 BOT READY");
    console.log("========================================");

    console.log(
        `Working on ${TARGET_GROUP_IDS.length} Groups!`
    );

    console.log(
        "Features Active: Any YouTube Link Allowed | Bad Words | Auto-Ban & Admin Bypass | Night Mode"
    );

    console.log(
        `Total Blacklisted Users: ${blacklistedUsers.size}`
    );

    console.log(
        "📨 Welcome DM: NEW MEMBER WATCHER ENABLED"
    );

    console.log(
        "📨 Welcome DM: LID → @c.us RESOLUTION ENABLED"
    );

    console.log(
        "👀 New member check interval: 5 seconds"
    );

    console.log("========================================\n");

    // ==================================================
    // IMPORTANT:
    // Cache existing members first.
    // Therefore existing users won't receive welcome.
    // ==================================================

    await initializeMemberCache();

    // Start new member watcher
    startMemberWatcher();

    // ==================================================
    // NIGHT MODE - 11 PM
    // ==================================================

    cron.schedule(
        "0 23 * * *",
        async () => {

            for (
                const groupId
                of TARGET_GROUP_IDS
            ) {

                try {

                    const chat =
                        await client.getChatById(
                            groupId
                        );

                    await chat.setMessagesAdminsOnly(
                        true
                    );

                    await chat.sendMessage(
                        "🌙 *රාත්‍රී 11:00 Group Admin Mode Active වී ඇත.* නැවත උදේ 6:00 ට open වේ. Good Night All!😴 Bot generated message.don't reply"
                    );

                } catch (e) {}
            }

        },
        {
            scheduled: true,
            timezone: "Asia/Colombo"
        }
    );

    // ==================================================
    // MORNING MODE - 6 AM
    // ==================================================

    cron.schedule(
        "0 6 * * *",
        async () => {

            for (
                const groupId
                of TARGET_GROUP_IDS
            ) {

                try {

                    const chat =
                        await client.getChatById(
                            groupId
                        );

                    await chat.setMessagesAdminsOnly(
                        false
                    );

                    await chat.sendMessage(
                        "☀️ *Good Morning All!* ගෲප් එක Open.😊Bot generated message.don't reply"
                    );

                } catch (e) {}
            }

        },
        {
            scheduled: true,
            timezone: "Asia/Colombo"
        }
    );
});

// ========================================
// GROUP JOIN EVENT
// ========================================
//
// Keep the original event as an additional
// fast path.
//
// The member watcher above is the important
// fallback for cases where group_join does not
// fire correctly.
//

client.on(
    "group_join",
    async (notification) => {

        try {

            if (
                !TARGET_GROUP_IDS.includes(
                    notification.chatId
                )
            ) {
                return;
            }

            const groupId =
                notification.chatId;

            console.log(
                `📥 group_join event received for ${groupId}`
            );

            const users =
                notification.recipientIds || [];

            if (users.length === 0) {

                console.log(
                    "⚠️ group_join event had no recipientIds. Member watcher will handle it."
                );

                return;
            }

            for (
                const userId
                of users
            ) {

                if (
                    welcomedUsers.has(userId)
                ) {
                    continue;
                }

                // Give member watcher a chance first
                await new Promise(resolve =>
                    setTimeout(resolve, 1000)
                );

                const sent =
                    await sendWelcomeDM(
                        userId
                    );

                if (sent) {

                    welcomedUsers.add(
                        userId
                    );
                }
            }

        } catch (error) {

            console.log(
                "❌ group_join error:",
                error.message || error
            );
        }
    }
);

// ========================================
// MESSAGE HANDLER
// ========================================

client.on(
    "message",
    async (message) => {

        try {

            // Only group messages
            if (
                !message.from ||
                !message.from.endsWith("@g.us")
            ) {
                return;
            }

            // Ignore own messages
            if (message.fromMe) {
                return;
            }

            // Only target groups
            if (
                !TARGET_GROUP_IDS.includes(
                    message.from
                )
            ) {
                return;
            }

            const groupId =
                message.from;

            if (!message.author) {
                return;
            }

            const info =
                await getContactInfo(
                    message.author
                );

            if (!info) {
                return;
            }

            const textLower =
                (message.body || "").toLowerCase();

            console.log(
                "\n----------------------------------------"
            );

            console.log(
                `📩 Group ID : ${groupId}`
            );

            console.log(
                `👤 Name     : ${info.name}`
            );

            console.log(
                `💬 Type     : ${message.type}`
            );

            console.log(
                `💬 Message  : ${message.body || "[Media / Sticker / Invite]"}`
            );

            console.log(
                "----------------------------------------"
            );

            // ==================================================
            // NON-SRI-LANKAN MESSAGE CHECK
            // ==================================================

            if (
                info.actualNumber &&
                !isSriLankan(
                    info.actualNumber
                )
            ) {

                const removed =
                    await directRemoveParticipant(
                        groupId,
                        message.author,
                        "Non-Sri-Lankan number"
                    );

                if (removed) {

                    await client.sendMessage(
                        groupId,
                        `🌍 @${info.actualNumber || message.author.split("@")[0]} (*${info.name}*) Sorry, only Sri Lankan numbers (+94) are allowed in this group.`,
                        {
                            mentions: [
                                info.dmId ||
                                message.author
                            ]
                        }
                    );
                }

                return;
            }

            // ==================================================
            // LINK CHECK
            // ==================================================

            const isNativeGroupInvite =
                message.type === "group_invite";

            const hasLinkIndicator =
                isNativeGroupInvite ||
                textLower.includes("http://") ||
                textLower.includes("https://") ||
                textLower.includes("www.") ||
                textLower.includes(".com") ||
                textLower.includes(".net") ||
                textLower.includes(".org") ||
                textLower.includes(".me") ||
                textLower.includes(".co") ||
                textLower.includes("t.me") ||
                textLower.includes("chat.whatsapp.com");

            if (hasLinkIndicator) {

                let isAdmin = false;

                try {

                    const chat =
                        await message.getChat();

                    if (
                        chat &&
                        chat.participants
                    ) {

                        const participant =
                            chat.participants.find(
                                p =>
                                    p.id._serialized ===
                                    message.author
                            );

                        isAdmin =
                            participant &&
                            (
                                participant.isAdmin ||
                                participant.isSuperAdmin
                            );
                    }

                } catch (err) {

                    isAdmin = false;
                }

                if (!isAdmin) {

                    const isTelegramLink =
                        textLower.includes("t.me/") ||
                        textLower.includes("telegram.me/");

                    const isWhatsAppGroupLink =
                        isNativeGroupInvite ||
                        textLower.includes(
                            "chat.whatsapp.com"
                        );

                    const isAllowedYT =
                        textLower.includes(
                            "youtube.com"
                        ) ||
                        textLower.includes(
                            "youtu.be"
                        );

                    const isAllowedDrive =
                        textLower.includes(
                            "drive.google.com"
                        );

                    const isAllowedZoom =
                        textLower.includes(
                            "zoom.us"
                        );

                    const isAllowedTeams =
                        textLower.includes(
                            "teams.microsoft.com"
                        );

                    const isAllowedDocs =
                        textLower.includes(
                            "docs.google.com"
                        );

                    const isAllowedForms =
                        textLower.includes(
                            "forms.gle"
                        );

                    const isAllowedClassroom =
                        textLower.includes(
                            "classroom.google.com"
                        );

                    const isAllowedEducationalLink =
                        isAllowedYT ||
                        isAllowedDrive ||
                        isAllowedZoom ||
                        isAllowedTeams ||
                        isAllowedDocs ||
                        isAllowedForms ||
                        isAllowedClassroom;

                    const scamOrBusinessKeywords = [
                        "earn money",
                        "crypto",
                        "forex",
                        "business",
                        "job opportunity",
                        "free cash",
                        "marketing",
                        "signals",
                        "trading",
                        "invest",
                        "lottery",
                        "win cash",
                        "fast money",
                        "income"
                    ];

                    const containsScamOrBusiness =
                        scamOrBusinessKeywords.some(
                            keyword =>
                                textLower.includes(
                                    keyword
                                )
                        );

                    let shouldBlock = false;

                    if (isTelegramLink) {
                        shouldBlock = true;
                    }

                    else if (
                        containsScamOrBusiness
                    ) {
                        shouldBlock = true;
                    }

                    else if (
                        isWhatsAppGroupLink
                    ) {
                        shouldBlock = true;
                    }

                    else if (
                        !isAllowedEducationalLink
                    ) {
                        shouldBlock = true;
                    }

                    if (shouldBlock) {

                        try {

                            await message.delete(
                                true
                            );

                            console.log(
                                "✅ Message successfully deleted."
                            );

                        } catch (e) {

                            console.log(
                                "⚠️ Could not delete message."
                            );
                        }

                        let warnings =
                            linkWarningTracker.get(
                                message.author
                            ) || 0;

                        warnings++;

                        linkWarningTracker.set(
                            message.author,
                            warnings
                        );

                        if (warnings === 1) {

                            await client.sendMessage(
                                groupId,
                                `⚠️ @${message.author.split("@")[0]} (*${info.name}*)
මෙම කණ්ඩායම තුළ වෙනත් WhatsApp Group ලින්ක්, ටෙලිග්‍රෑම් ලින්ක් හෝ ව්‍යාපාරික දේවල් Share කිරීම තහනම්! ඔයාට group link share කරගන්න අවශ්‍යනම් group admin කෙනෙක් හරහා යොමු කරන්න🤠 මෙය ඔබගේ *පළමු අවවාදයයි*. නැවත දැමුවහොත් ගෲප් එකෙන් ඉවත් කරනු ලැබේ කරුණාකර link එක group එකෙන් ඉවත් කරගන්න.. 🚫`,
                                {
                                    mentions: [
                                        message.author
                                    ]
                                }
                            );

                        } else {

                            const removed =
                                await directRemoveParticipant(
                                    groupId,
                                    message.author,
                                    "Unauthorized Links/Group Invites"
                                );

                            if (removed) {

                                blacklistedUsers.add(
                                    message.author
                                );

                                saveBlacklist();

                                if (
                                    ENABLE_AUTO_REMOVE
                                ) {

                                    await client.sendMessage(
                                        groupId,
                                        `🚫 @${message.author.split("@")[0]} (*${info.name}*) අවවාද නොතකා නැවත තහනම් ලින්ක් දැමූ නිසා ගෲප් එකෙන් ස්ථිරවම ඉවත් කරන ලදී.`,
                                        {
                                            mentions: [
                                                message.author
                                            ]
                                        }
                                    );
                                }
                            }
                        }

                        return;
                    }
                }
            }

            // ==================================================
            // BAD WORD CHECK
            // ==================================================

            const containsBadWord =
                BAD_WORDS.some(
                    word =>
                        textLower.includes(
                            word.toLowerCase()
                        )
                );

            if (containsBadWord) {

                let isAdmin = false;

                try {

                    const chat =
                        await message.getChat();

                    if (
                        chat &&
                        chat.participants
                    ) {

                        const participant =
                            chat.participants.find(
                                p =>
                                    p.id._serialized ===
                                    message.author
                            );

                        isAdmin =
                            participant &&
                            (
                                participant.isAdmin ||
                                participant.isSuperAdmin
                            );
                    }

                } catch (err) {

                    isAdmin = false;
                }

                if (!isAdmin) {

                    try {
                        await message.delete(true);
                    } catch (e) {}

                    let warnings =
                        badWordWarningTracker.get(
                            message.author
                        ) || 0;

                    warnings++;

                    badWordWarningTracker.set(
                        message.author,
                        warnings
                    );

                    if (warnings === 1) {

                        await client.sendMessage(
                            groupId,
                            `⚠️ @${message.author.split("@")[0]} (*${info.name}*)
මෙම කණ්ඩායම තුළ අපහාසාත්මක හෝ තහනම් වචන භාවිතය තහනම්! මෙය ඔබගේ *පළමු අවවාදයයි*. නැවත එවැනි වචන භාවිත කළහොත් ගෲප් එකෙන් ඉවත් කරනු ලැබේ. 🤬`,
                            {
                                mentions: [
                                    message.author
                                ]
                            }
                        );

                    } else {

                        const removed =
                            await directRemoveParticipant(
                                groupId,
                                message.author,
                                "Bad Words"
                            );

                        if (removed) {

                            blacklistedUsers.add(
                                message.author
                            );

                            saveBlacklist();

                            if (
                                ENABLE_AUTO_REMOVE
                            ) {

                                await client.sendMessage(
                                    groupId,
                                    `🚫 @${message.author.split("@")[0]} (*${info.name}*) අවවාද නොතකා නැවත අපහාසාත්මක වචන භාවිත කළ නිසා ගෲප් එකෙන් ස්ථිරවම ඉවත් කරන ලදී.`,
                                    {
                                        mentions: [
                                            message.author
                                        ]
                                    }
                                );
                            }
                        }
                    }
                }

                return;
            }

            // ==================================================
            // SPAM CHECK
            // ==================================================

            await checkSpam(
                message,
                message.author,
                info.name,
                groupId
            );

        } catch (error) {

            console.log(
                "❌ Message handler error:",
                error.message || error
            );
        }
    }
);

// ========================================
// SPAM CHECK
// ========================================

async function checkSpam(
    message,
    senderId,
    name,
    groupId
) {

    const now = Date.now();

    if (
        !spamTracker.has(senderId)
    ) {
        spamTracker.set(
            senderId,
            []
        );
    }

    let timestamps =
        spamTracker.get(
            senderId
        );

    timestamps =
        timestamps.filter(
            timestamp =>
                now - timestamp <
                SPAM_WINDOW_MS
        );

    timestamps.push(now);

    spamTracker.set(
        senderId,
        timestamps
    );

    if (
        timestamps.length >=
        SPAM_LIMIT
    ) {

        spamTracker.set(
            senderId,
            []
        );

        const removed =
            await directRemoveParticipant(
                groupId,
                senderId,
                "Spam"
            );

        if (removed) {

            blacklistedUsers.add(
                senderId
            );

            saveBlacklist();

            if (
                ENABLE_AUTO_REMOVE
            ) {

                await client.sendMessage(
                    groupId,
                    `🚨 @${senderId.split("@")[0]} (*${name}*) has been permanently removed for SPAMMING.`,
                    {
                        mentions: [
                            senderId
                        ]
                    }
                );
            }
        }
    }
}

// ========================================
// START BOT
// ========================================

console.log(
    "\n========================================"
);

console.log(
    "🤖 WHATSAPP MODERATION BOT"
);

console.log(
    "========================================"
);

client.initialize();
