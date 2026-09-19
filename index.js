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

// Check new members every 5 seconds
const MEMBER_CHECK_INTERVAL = 5000;

// ========================================
// DATA
// ========================================

const spamTracker = new Map();
const linkWarningTracker = new Map();
const badWordWarningTracker = new Map();

const BLACKLIST_FILE = "./blacklist.json";
const WELCOMED_FILE = "./welcomed_users.json";

let blacklistedUsers = new Set();
let welcomedUsers = new Set();

// ========================================
// LOAD BLACKLIST
// ========================================

if (fs.existsSync(BLACKLIST_FILE)) {
    try {
        blacklistedUsers = new Set(
            JSON.parse(fs.readFileSync(BLACKLIST_FILE, "utf-8"))
        );
    } catch (e) {
        console.log("⚠️ Error loading blacklist:", e);
    }
}

// ========================================
// LOAD WELCOMED USERS
// ========================================

if (fs.existsSync(WELCOMED_FILE)) {
    try {
        welcomedUsers = new Set(
            JSON.parse(fs.readFileSync(WELCOMED_FILE, "utf-8"))
        );
    } catch (e) {
        console.log("⚠️ Error loading welcomed users:", e);
    }
}

// ========================================
// SAVE BLACKLIST
// ========================================

function saveBlacklist() {
    try {
        fs.writeFileSync(
            BLACKLIST_FILE,
            JSON.stringify([...blacklistedUsers], null, 2)
        );
    } catch (e) {
        console.log("⚠️ Error saving blacklist:", e);
    }
}

// ========================================
// SAVE WELCOMED USERS
// ========================================

function saveWelcomedUsers() {
    try {
        fs.writeFileSync(
            WELCOMED_FILE,
            JSON.stringify([...welcomedUsers], null, 2)
        );
    } catch (e) {
        console.log("⚠️ Error saving welcomed users:", e);
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
// READY
// ========================================

client.on("ready", async () => {

    console.log("\n========================================");
    console.log("🤖 BOT READY");
    console.log("========================================");

    console.log(`Working on ${TARGET_GROUP_IDS.length} Groups!`);

    console.log(
        "Features Active: Welcome DM | Member Watcher | Sri Lankan Check | Bad Words | Spam | Links | Auto-Ban | Night Mode"
    );

    console.log(
        `Total Blacklisted Users: ${blacklistedUsers.size}`
    );

    console.log(
        `Total Welcomed Users: ${welcomedUsers.size}`
    );

    console.log("========================================\n");

    // Initialize existing members
    await initializeExistingMembers();

    // Start member watcher
    startMemberWatcher();

    // ========================================
    // NIGHT MODE
    // ========================================

    cron.schedule(
        "0 23 * * *",
        async () => {

            console.log("🌙 Night mode starting...");

            for (const groupId of TARGET_GROUP_IDS) {

                try {

                    const chat =
                        await client.getChatById(groupId);

                    await chat.setMessagesAdminsOnly(true);

                    await chat.sendMessage(
                        "🌙 *රාත්‍රී 11:00 Group Admin Mode Active වී ඇත.*\n\nනැවත උදේ 6:00 ට open වේ.\n\nGood Night All! 😴\n\n_Bot generated message. Don't reply._"
                    );

                } catch (e) {

                    console.log(
                        `❌ Night mode error ${groupId}:`,
                        e.message
                    );

                }

            }

        },
        {
            scheduled: true,
            timezone: "Asia/Colombo"
        }
    );

    // ========================================
    // MORNING MODE
    // ========================================

    cron.schedule(
        "0 6 * * *",
        async () => {

            console.log("☀️ Morning mode starting...");

            for (const groupId of TARGET_GROUP_IDS) {

                try {

                    const chat =
                        await client.getChatById(groupId);

                    await chat.setMessagesAdminsOnly(false);

                    await chat.sendMessage(
                        "☀️ *Good Morning All!*\n\nගෲප් එක Open. 😊\n\n_Bot generated message. Don't reply._"
                    );

                } catch (e) {

                    console.log(
                        `❌ Morning mode error ${groupId}:`,
                        e.message
                    );

                }

            }

        },
        {
            scheduled: true,
            timezone: "Asia/Colombo"
        }
    );

});

// ========================================
// GET CONTACT INFO
// ========================================

async function getContactInfo(id) {

    try {

        if (!id) {
            return null;
        }

        const contact =
            await client.getContactById(id);

        if (!contact) {
            return null;
        }

        const contactId =
            contact.id &&
            contact.id._serialized
                ? contact.id._serialized
                : id;

        let actualId = contactId;
        let phoneId = null;
        let lidId = null;

        // ========================================
        // RESOLVE LID -> PHONE
        // ========================================

        try {

            const resolved =
                await client.pupPage.evaluate(
                    async (participantId) => {

                        try {

                            if (
                                !window.WWebJS ||
                                !window.WWebJS
                                    .enforceLidAndPnRetrieval
                            ) {
                                return null;
                            }

                            const result =
                                await window.WWebJS
                                    .enforceLidAndPnRetrieval(
                                        participantId
                                    );

                            return {
                                lid: result?.lid?._serialized || null,
                                phone: result?.phone?._serialized || null
                            };

                        } catch (e) {

                            return {
                                error: String(e)
                            };

                        }

                    },
                    contactId
                );

            if (resolved) {

                lidId = resolved.lid || null;
                phoneId = resolved.phone || null;

            }

        } catch (e) {

            console.log(
                "⚠️ LID resolution failed:",
                e.message
            );

        }

        // ========================================
        // PHONE ID
        // ========================================

        if (!phoneId && contactId.endsWith("@c.us")) {
            phoneId = contactId;
        }

        if (!phoneId && contactId.endsWith("@s.whatsapp.net")) {
            phoneId = contactId;
        }

        // ========================================
        // NUMBER
        // ========================================

        let actualNumber = "";

        if (phoneId) {

            actualNumber =
                phoneId.split("@")[0];

        } else if (contactId.endsWith("@c.us")) {

            actualNumber =
                contactId.split("@")[0];

        }

        // ========================================
        // NAME
        // ========================================

        const name =
            contact.pushname ||
            contact.name ||
            contact.shortName ||
            "Unknown User";

        return {

            contact,
            name,

            originalId: id,

            actualId: contactId,

            phoneId,

            lidId,

            actualNumber

        };

    } catch (error) {

        console.log(
            "❌ getContactInfo error:",
            error.message
        );

        return null;
    }

}

// ========================================
// SRI LANKAN NUMBER
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

        console.log(
            `🗑️ Removing ${participantId} | Reason: ${reason}`
        );

        const result =
            await client.pupPage.evaluate(
                async (
                    groupId,
                    participantId
                ) => {

                    try {

                        const WWebJS =
                            window.WWebJS;

                        if (!WWebJS) {

                            return {
                                success: false,
                                error:
                                    "WWebJS unavailable"
                            };

                        }

                        // ========================================
                        // UPDATE GROUP METADATA
                        // ========================================

                        try {

                            window
                                .require(
                                    "WAWebWidFactory"
                                )
                                .createWid(
                                    groupId
                                );

                            await window
                                .require(
                                    "WAWebGroupQueryJob"
                                )
                                .queryAndUpdateGroupMetadataById(
                                    {
                                        id: groupId
                                    }
                                );

                        } catch (e) {}

                        // ========================================
                        // GET GROUP
                        // ========================================

                        const chat =
                            await WWebJS.getChat(
                                groupId,
                                {
                                    getAsModel: false
                                }
                            );

                        if (!chat) {

                            return {
                                success: false,
                                error:
                                    "Group unavailable"
                            };

                        }

                        // ========================================
                        // RESOLVE LID / PHONE
                        // ========================================

                        const resolved =
                            await WWebJS
                                .enforceLidAndPnRetrieval(
                                    participantId
                                );

                        const lid =
                            resolved?.lid || null;

                        const phone =
                            resolved?.phone || null;

                        let participant = null;

                        // LID
                        if (
                            lid &&
                            chat.groupMetadata &&
                            chat.groupMetadata.participants
                        ) {

                            participant =
                                chat.groupMetadata
                                    .participants
                                    .get(
                                        lid._serialized
                                    );

                        }

                        // PHONE
                        if (
                            !participant &&
                            phone &&
                            chat.groupMetadata &&
                            chat.groupMetadata.participants
                        ) {

                            participant =
                                chat.groupMetadata
                                    .participants
                                    .get(
                                        phone._serialized
                                    );

                        }

                        // ORIGINAL
                        if (
                            !participant &&
                            chat.groupMetadata &&
                            chat.groupMetadata.participants
                        ) {

                            participant =
                                chat.groupMetadata
                                    .participants
                                    .get(
                                        participantId
                                    );

                        }

                        if (!participant) {

                            return {
                                success: false,
                                error:
                                    "Participant not found"
                            };

                        }

                        // ========================================
                        // ADMIN PROTECTION
                        // ========================================

                        if (
                            participant.isAdmin === true ||
                            participant.isSuperAdmin === true
                        ) {

                            return {
                                success: false,
                                error:
                                    "ADMIN_PROTECTED"
                            };

                        }

                        // ========================================
                        // REMOVE
                        // ========================================

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

        if (
            result &&
            result.success
        ) {

            console.log(
                `✅ USER REMOVED | ${participantId} | ${reason}`
            );

            return true;

        }

        console.log(
            `❌ REMOVE FAILED | ${participantId} | ${result?.error}`
        );

        return false;

    } catch (error) {

        console.log(
            "❌ directRemoveParticipant error:",
            error.message
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

3️⃣ 🚫 No unauthorized links.
(වෙනත් WhatsApp Group, Telegram හෝ ව්‍යාපාරික ලින්ක් දැමීම තහනම්.)

Only educational links are allowed.

4️⃣ 🌙 Group will be closed for messages from 11:00 PM to 6:00 AM.
(දිනපතා රාත්‍රී 11:00 සිට උදෑසන 6:00 දක්වා සමූහය වසා තැබේ.)

5️⃣ 🎓 For further questions regarding student loans, please contact the group admins.

ශිෂ්‍ය ණය පිළිබඳ වැඩිදුර ප්‍රශ්න සඳහා Admin වරුන් සම්බන්ධ කරගන්න.

📺 *YouTube Playlist:*
https://youtube.com/playlist?list=PL-ZbzAh0pKykpa-odcUrDEg94PBbTQp9M&si=F9L3Spy-pLZJq31n

⚠️ *Note:*
Breaking these rules will result in an automatic permanent ban by the system.

(මෙම නීති කඩකරන අයව පද්ධතිය මගින් ස්වයංක්‍රීයව සමූහයෙන් ඉවත් කරනු ලැබේ.)

Thank you! / ස්තූතියි!

🤖 _System Generated Message. Please do not reply._`;

}

// ========================================
// SEND WELCOME DM
// ========================================

async function sendWelcomeDM(
    groupId,
    userId,
    source = "watcher"
) {

    try {

        console.log("\n----------------------------------------");

        console.log(
            `👤 NEW MEMBER DETECTED`
        );

        console.log(
            `Group    : ${groupId}`
        );

        console.log(
            `User ID  : ${userId}`
        );

        console.log(
            `Source   : ${source}`
        );

        // ========================================
        // CONTACT INFO
        // ========================================

        const info =
            await getContactInfo(userId);

        if (!info) {

            console.log(
                "❌ Could not get contact information."
            );

            return false;

        }

        console.log(
            `Name     : ${info.name}`
        );

        console.log(
            `Phone ID : ${info.phoneId}`
        );

        console.log(
            `LID      : ${info.lidId}`
        );

        console.log(
            `Number   : ${info.actualNumber}`
        );

        // ========================================
        // ALREADY WELCOMED?
        // ========================================

        const uniqueKey =
            `${groupId}|${info.phoneId || info.lidId || userId}`;

        if (welcomedUsers.has(uniqueKey)) {

            console.log(
                "ℹ️ Welcome already sent."
            );

            return true;

        }

        // ========================================
        // BLACKLIST CHECK
        // ========================================

        const blacklistId =
            info.phoneId ||
            info.lidId ||
            userId;

        if (
            blacklistedUsers.has(userId) ||
            blacklistedUsers.has(blacklistId)
        ) {

            console.log(
                `🚫 User is blacklisted: ${info.name}`
            );

            await client.sendMessage(
                groupId,

                `🚫 @${userId.split("@")[0]} (*${info.name}*), ඔබට මෙම සමූහයට නැවත සම්බන්ධ වීමට අවසර නැත. ඔබව system එක මගින් Banned කර ඇත.`,

                {
                    mentions: [userId]
                }
            );

            await directRemoveParticipant(
                groupId,
                userId,
                "Blacklisted"
            );

            return false;

        }

        // ========================================
        // COUNTRY CHECK
        // ========================================

        if (!isSriLankan(info.actualNumber)) {

            console.log(
                `🌍 NON-SRI LANKAN NUMBER: ${info.actualNumber}`
            );

            await client.sendMessage(
                groupId,

                `🌍 @${userId.split("@")[0]} (*${info.name}*)\n\nSorry, only Sri Lankan numbers (+94) are allowed in this group.\n\nඔබව සමූහයෙන් ඉවත් කරනු ලැබේ.`,

                {
                    mentions: [userId]
                }
            );

            await directRemoveParticipant(
                groupId,
                userId,
                "Non-Sri-Lankan number"
            );

            return false;

        }

        // ========================================
        // MESSAGE ID
        // ========================================

        const dmId =
            info.phoneId ||
            info.actualId ||
            userId;

        console.log(
            `📨 Sending welcome DM to: ${dmId}`
        );

        // ========================================
        // SEND DM
        // ========================================

        const welcomeMsg =
            createWelcomeMessage(info.name);

        await client.sendMessage(
            dmId,
            welcomeMsg
        );

        // ========================================
        // SAVE
        // ========================================

        welcomedUsers.add(uniqueKey);

        saveWelcomedUsers();

        console.log(
            `✅ WELCOME DM SENT TO ${info.name}`
        );

        console.log("----------------------------------------\n");

        return true;

    } catch (error) {

        console.log(
            "\n❌ WELCOME DM ERROR"
        );

        console.log(
            "User:",
            userId
        );

        console.log(
            "Error:",
            error
        );

        console.log("----------------------------------------\n");

        return false;

    }

}

// ========================================
// INITIALIZE EXISTING MEMBERS
// ========================================

async function initializeExistingMembers() {

    console.log(
        "\n🔄 Initializing existing group members..."
    );

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

            let count = 0;

            for (
                const participant
                of chat.participants
            ) {

                const id =
                    participant.id._serialized;

                // Existing users are NOT welcomed
                // They are only registered as known
                const key =
                    `${groupId}|${id}`;

                if (!welcomedUsers.has(key)) {

                    welcomedUsers.add(key);

                }

                count++;

            }

            console.log(
                `✅ ${chat.name}: ${count} existing members loaded`
            );

        } catch (error) {

            console.log(
                `❌ Initial member load failed ${groupId}:`,
                error.message
            );

        }

    }

    saveWelcomedUsers();

    console.log(
        "✅ Existing member initialization completed.\n"
    );

}

// ========================================
// MEMBER WATCHER
// ========================================

function startMemberWatcher() {

    console.log(
        "👀 Member watcher started."
    );

    setInterval(
        async () => {

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

                    for (
                        const participant
                        of chat.participants
                    ) {

                        const userId =
                            participant.id._serialized;

                        const key =
                            `${groupId}|${userId}`;

                        // ========================================
                        // NEW USER
                        // ========================================

                        if (
                            !welcomedUsers.has(key)
                        ) {

                            console.log(
                                `🆕 New member found by watcher: ${userId}`
                            );

                            await sendWelcomeDM(
                                groupId,
                                userId,
                                "MEMBER_WATCHER"
                            );

                        }

                    }

                } catch (error) {

                    console.log(
                        `⚠️ Member watcher error ${groupId}:`,
                        error.message
                    );

                }

            }

        },
        MEMBER_CHECK_INTERVAL
    );

}

// ========================================
// GROUP JOIN EVENT
// ========================================

client.on(
    "group_join",
    async (notification) => {

        console.log(
            "\n========== GROUP JOIN EVENT =========="
        );

        console.log(
            "Chat ID:",
            notification.chatId
        );

        console.log(
            "Author:",
            notification.author
        );

        console.log(
            "Recipient IDs:",
            notification.recipientIds
        );

        try {

            if (
                !TARGET_GROUP_IDS.includes(
                    notification.chatId
                )
            ) {

                console.log(
                    "⚠️ Group is not in TARGET_GROUP_IDS."
                );

                return;

            }

            const groupId =
                notification.chatId;

            const users =
                notification.recipientIds || [];

            // ========================================
            // NORMAL GROUP JOIN USERS
            // ========================================

            if (users.length > 0) {

                for (
                    const userId
                    of users
                ) {

                    await sendWelcomeDM(
                        groupId,
                        userId,
                        "GROUP_JOIN_EVENT"
                    );

                }

            } else {

                console.log(
                    "⚠️ group_join fired but recipientIds is empty."
                );

                console.log(
                    "👀 Member watcher will detect the user."
                );

            }

        } catch (error) {

            console.log(
                "❌ GROUP JOIN ERROR:",
                error
            );

        }

        console.log(
            "======================================\n"
        );

    }
);

// ========================================
// MESSAGE HANDLER
// ========================================

client.on(
    "message",
    async (message) => {

        try {

            if (
                !message.from ||
                !message.from.endsWith("@g.us")
            ) {
                return;
            }

            if (message.fromMe) {
                return;
            }

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
                (
                    message.body || ""
                ).toLowerCase();

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
                `📱 Number   : ${info.actualNumber}`
            );

            console.log(
                `💬 Type     : ${message.type}`
            );

            console.log(
                `💬 Message  : ${
                    message.body ||
                    "[Media / Sticker / Invite]"
                }`
            );

            console.log(
                "----------------------------------------"
            );

            // ========================================
            // COUNTRY CHECK
            // ========================================

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

                        `🌍 @${message.author.split("@")[0]} (*${info.name}*) Sorry, only Sri Lankan numbers (+94) are allowed in this group.`,

                        {
                            mentions: [
                                message.author
                            ]
                        }
                    );

                }

                return;

            }

            // ========================================
            // LINK DETECTION
            // ========================================

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

                    } else if (
                        containsScamOrBusiness
                    ) {

                        shouldBlock = true;

                    } else if (
                        isWhatsAppGroupLink
                    ) {

                        shouldBlock = true;

                    } else if (
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

                                `⚠️ @${message.author.split("@")[0]} (*${info.name}*)\n\nමෙම කණ්ඩායම තුළ වෙනත් WhatsApp Group ලින්ක්, Telegram ලින්ක් හෝ ව්‍යාපාරික දේවල් Share කිරීම තහනම්!\n\nමෙය ඔබගේ *පළමු අවවාදයයි*. නැවත දැමුවහොත් ගෲප් එකෙන් ඉවත් කරනු ලැබේ. 🚫`,

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
                                    "Unauthorized Links / Group Invites"
                                );

                            if (removed) {

                                blacklistedUsers.add(
                                    message.author
                                );

                                if (
                                    info.phoneId
                                ) {

                                    blacklistedUsers.add(
                                        info.phoneId
                                    );

                                }

                                saveBlacklist();

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

                        return;

                    }

                }

            }

            // ========================================
            // BAD WORDS
            // ========================================

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

                        await message.delete(
                            true
                        );

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

                            `⚠️ @${message.author.split("@")[0]} (*${info.name}*)\n\nමෙම කණ්ඩායම තුළ අපහාසාත්මක හෝ තහනම් වචන භාවිතය තහනම්!\n\nමෙය ඔබගේ *පළමු අවවාදයයි*. නැවත එවැනි වචන භාවිත කළහොත් ගෲප් එකෙන් ඉවත් කරනු ලැබේ. 🤬`,

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

                            if (
                                info.phoneId
                            ) {

                                blacklistedUsers.add(
                                    info.phoneId
                                );

                            }

                            saveBlacklist();

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

                return;

            }

            // ========================================
            // SPAM
            // ========================================

            await checkSpam(
                message,
                message.author,
                info.name,
                groupId
            );

        } catch (error) {

            console.log(
                "❌ MESSAGE HANDLER ERROR:",
                error
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
        !spamTracker.has(
            senderId
        )
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

    console.log(
        `📊 Spam count ${name}: ${timestamps.length}/${SPAM_LIMIT}`
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

// ========================================
// DISCONNECTED
// ========================================

client.on(
    "disconnected",
    (reason) => {

        console.log(
            "❌ WhatsApp disconnected:",
            reason
        );

    }
);

// ========================================
// AUTH FAILURE
// ========================================

client.on(
    "auth_failure",
    (message) => {

        console.log(
            "❌ Authentication failure:",
            message
        );

    }
);

// ========================================
// START BOT
// ========================================

console.log("\n========================================");
console.log("🤖 WHATSAPP MODERATION BOT");
console.log("========================================");
console.log("🚀 Starting...");
console.log("========================================\n");

client.initialize();
