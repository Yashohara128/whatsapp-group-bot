const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

// ========================================
// CONFIGURATION
// ========================================

const TARGET_GROUP_ID = "120363427144307038@g.us";

const CHROME_PATH =
    "/usr/bin/chromium-browser";

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

// ========================================
// CLIENT
// ========================================

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: CHROME_PATH,
        headless: true, // මේක අනිවාර්යයෙන් true වෙන්න ඕනේ
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

    console.log(
        "Target:",
        TARGET_GROUP_ID
    );

    console.log(
        "Auto Remove:",
        ENABLE_AUTO_REMOVE
            ? "ON 🚨"
            : "OFF 🧪"
    );

    console.log(
        `Spam: ${SPAM_LIMIT} messages / ${SPAM_WINDOW_MS / 1000}s`
    );

    console.log(
        "========================================\n"
    );
});

// ========================================
// CONTACT INFO
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

        const actualId =
            contact.id &&
            contact.id._serialized
                ? contact.id._serialized
                : "";

        const actualNumber =
            actualId
                ? actualId.split("@")[0]
                : "";

        const name =
            contact.pushname ||
            contact.name ||
            contact.shortName ||
            "Unknown";

        return {
            contact,
            name,
            actualId,
            actualNumber
        };

    } catch (error) {

        console.log(
            "❌ Contact lookup failed:",
            error.message || error
        );

        return null;
    }
}

// ========================================
// COUNTRY CHECK
// ========================================

function isSriLankan(number) {

    if (!number) {
        return false;
    }

    return number.startsWith("94");
}

// ========================================
// DIRECT REMOVE
// ========================================

async function directRemoveParticipant(
    participantId,
    reason
) {

    try {

        console.log("\n========================================");
        console.log("🚨 REMOVE REQUEST");
        console.log("========================================");

        console.log(
            "Participant:",
            participantId
        );

        console.log(
            "Reason:",
            reason
        );

        if (!ENABLE_AUTO_REMOVE) {

            console.log(
                "🧪 TEST MODE - NOT REMOVED"
            );

            return false;
        }

        const result =
            await client.pupPage.evaluate(
                async (
                    groupId,
                    participantId
                ) => {

                    try {

                        // --------------------------------
                        // Get required WhatsApp modules
                        // --------------------------------

                        const WWebJS =
                            window.WWebJS;

                        if (!WWebJS) {

                            return {
                                success: false,
                                error:
                                    "WWebJS unavailable"
                            };
                        }

                        // --------------------------------
                        // Refresh group metadata
                        // --------------------------------

                        try {

                            const groupWid =
                                window
                                    .require("WAWebWidFactory")
                                    .createWid(groupId);

                            await window
                                .require("WAWebGroupQueryJob")
                                .queryAndUpdateGroupMetadataById(
                                    {
                                        id: groupId
                                    }
                                );

                        } catch (metadataError) {

                            console.log(
                                "Metadata refresh failed:",
                                metadataError
                            );
                        }

                        // --------------------------------
                        // Get group chat
                        // --------------------------------

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
                                    "Group chat unavailable"
                            };
                        }

                        // --------------------------------
                        // Resolve LID / phone
                        // --------------------------------

                        const resolved =
                            await WWebJS
                                .enforceLidAndPnRetrieval(
                                    participantId
                                );

                        const lid =
                            resolved &&
                            resolved.lid
                                ? resolved.lid
                                : null;

                        const phone =
                            resolved &&
                            resolved.phone
                                ? resolved.phone
                                : null;

                        // --------------------------------
                        // Find participant
                        // --------------------------------

                        let participant = null;

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

                        // --------------------------------
                        // Fallback: original ID
                        // --------------------------------

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
                                    "Participant not found in group metadata"
                            };
                        }

                        // --------------------------------
                        // ADMIN PROTECTION
                        // --------------------------------

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

                        // --------------------------------
                        // REMOVE
                        // --------------------------------

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
                            error:
                                error &&
                                error.message
                                    ? error.message
                                    : String(error)
                        };
                    }

                },
                TARGET_GROUP_ID,
                participantId
            );

        console.log(
            "Removal result:",
            result
        );

        if (
            result &&
            result.success
        ) {

            console.log(
                "✅ USER REMOVED SUCCESSFULLY 🚨"
            );

            console.log(
                "========================================\n"
            );

            return true;
        }

        if (
            result &&
            result.error ===
            "ADMIN_PROTECTED"
        ) {

            console.log(
                "🛡️ ADMIN PROTECTED"
            );

            console.log(
                "========================================\n"
            );

            return false;
        }

        console.log(
            "❌ REMOVE FAILED:",
            result
                ? result.error
                : "Unknown error"
        );

        console.log(
            "========================================\n"
        );

        return false;

    } catch (error) {

        console.log(
            "❌ DIRECT REMOVE ERROR"
        );

        console.error(error);

        return false;
    }
}

// ========================================
// GROUP JOIN
// ========================================

client.on("group_join", async (notification) => {

    try {

        if (
            notification.chatId !==
            TARGET_GROUP_ID
        ) {
            return;
        }

        console.log("\n========================================");
        console.log("👤 NEW MEMBER");
        console.log("========================================");

        const users =
            notification.recipientIds || [];

        for (const userId of users) {

            console.log(
                "\nParticipant:",
                userId
            );

            const info =
                await getContactInfo(userId);

            if (!info) {

                console.log(
                    "❓ Cannot resolve contact"
                );

                continue;
            }

            console.log(
                "Name:",
                info.name
            );

            console.log(
                "Actual ID:",
                info.actualId
            );

            console.log(
                "Number:",
                info.actualNumber
                    ? "+" + info.actualNumber
                    : "Unknown"
            );

            // --------------------------------
            // Sri Lankan
            // --------------------------------

            if (
                isSriLankan(
                    info.actualNumber
                )
            ) {

                console.log(
                    "🇱🇰 ALLOWED"
                );

                continue;
            }

            // --------------------------------
            // Non Sri Lankan
            // --------------------------------

            console.log(
                "🚨 NON-SRI-LANKAN"
            );

            await directRemoveParticipant(
                userId,
                "Non-Sri-Lankan number"
            );
        }

    } catch (error) {

        console.log(
            "❌ Group join error"
        );

        console.error(error);
    }
});

// ========================================
// MESSAGE
// ========================================

client.on("message", async (message) => {

    try {

        // Only groups
        if (
            !message.from ||
            !message.from.endsWith("@g.us")
        ) {
            return;
        }

        // Only target group
        if (
            message.from !==
            TARGET_GROUP_ID
        ) {
            return;
        }

        if (!message.author) {

            console.log(
                "❓ Message author unavailable"
            );

            return;
        }

        console.log("\n----------------------------------------");

        console.log(
            "📩 Message:",
            message.body || "[Media]"
        );

        console.log(
            "LID:",
            message.author
        );

        const info =
            await getContactInfo(
                message.author
            );

        if (!info) {

            console.log(
                "❓ Could not resolve sender"
            );

            return;
        }

        console.log(
            "Name:",
            info.name
        );

        console.log(
            "Actual WhatsApp ID:",
            info.actualId
        );

        console.log(
            "Actual Number:",
            info.actualNumber
                ? "+" + info.actualNumber
                : "Unknown"
        );

        // ====================================
        // NON-SRI-LANKAN
        // ====================================

        if (
            info.actualNumber &&
            !isSriLankan(
                info.actualNumber
            )
        ) {

            console.log(
                "🚨 NON-SRI-LANKAN USER"
            );

            await directRemoveParticipant(
                message.author,
                "Non-Sri-Lankan number"
            );

            return;
        }

        // ====================================
        // SPAM
        // ====================================

        await checkSpam(
            message.author,
            info.name
        );

    } catch (error) {

        console.log(
            "❌ Message handler error"
        );

        console.error(error);
    }
});

// ========================================
// SPAM CHECK
// ========================================

async function checkSpam(
    senderId,
    name
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
        spamTracker.get(senderId);

    // Remove old timestamps
    timestamps =
        timestamps.filter(
            timestamp =>
                now - timestamp <
                SPAM_WINDOW_MS
        );

    // Add current message
    timestamps.push(now);

    spamTracker.set(
        senderId,
        timestamps
    );

    console.log(
        `📊 Spam count: ${timestamps.length}/${SPAM_LIMIT}`
    );

    // ====================================
    // 5/5
    // ====================================

    if (
        timestamps.length >=
        SPAM_LIMIT
    ) {

        console.log("\n========================================");
        console.log("🚨🚨 SPAM DETECTED 🚨🚨");
        console.log("========================================");

        console.log(
            "User:",
            name
        );

        console.log(
            "Messages:",
            timestamps.length
        );

        console.log(
            "Window:",
            `${SPAM_WINDOW_MS / 1000} seconds`
        );

        // Reset before removal
        spamTracker.set(
            senderId,
            []
        );

        // ====================================
        // DIRECT REMOVE
        // ====================================

        await directRemoveParticipant(
            senderId,
            "Spam - 5 messages within 10 seconds"
        );
    }
}

// ========================================
// GROUP LEAVE
// ========================================

client.on("group_leave", (notification) => {

    if (
        notification.chatId !==
        TARGET_GROUP_ID
    ) {
        return;
    }

    console.log(
        "👋 User left/was removed:",
        notification.recipientIds || []
    );
});

// ========================================
// STATE
// ========================================

client.on("change_state", (state) => {

    console.log(
        "WhatsApp State:",
        state
    );
});

// ========================================
// DISCONNECTED
// ========================================

client.on("disconnected", (reason) => {

    console.log(
        "⚠️ WhatsApp disconnected:",
        reason
    );
});

// ========================================
// START
// ========================================

console.log("\n========================================");
console.log("🤖 WHATSAPP MODERATION BOT");
console.log("========================================");
console.log("Starting...\n");

client.initialize();

