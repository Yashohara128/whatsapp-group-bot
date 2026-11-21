const cron = require("node-cron");
const os = require("os");
const { execSync } = require("child_process");

const keywordCooldowns = new Map();
const KEYWORD_COOLDOWN_MS = 10 * 60 * 1000;

function handleCalculatorCommand(msgText) {
    const parts = msgText.trim().split(/\s+/);
    const amountRaw = parts[1] ? parts[1].replace(/,/g, "") : "";
    const yearsRaw = parts[2] ? parseInt(parts[2], 10) : 4;

    const loanAmount = parseFloat(amountRaw);
    const degreeYears = (yearsRaw === 3 || yearsRaw === 4) ? yearsRaw : 4;

    if (isNaN(loanAmount) || loanAmount < 100000 || loanAmount > 1500000) {
        return (
            `🧮 *IFSLS ණය වාරික සහ Stipend ගණකය (/calc)*\n\n` +
            `භාවිතා කරන ආකාරය:\n` +
            `• \`/calc 1000000\` (වසර 4 උපාධියක් සඳහා)\n` +
            `• \`/calc 800000 3\` (වසර 3 උපාධියක් සඳහා)\n\n` +
            `💡 *සටහන:* උපරිම ණය සීමාව රු. 1,500,000/= කි (0% පොලී).`
        );
    }

    const totalStipend = degreeYears * 75000;
    const quarterlyStipend = 18750;
    const grandTotalLoan = loanAmount + totalStipend;

    const repaymentYears = 12 - degreeYears - 1;
    const totalMonths = repaymentYears * 12;
    const monthlyInstallmentTuitionOnly = Math.ceil(loanAmount / totalMonths);
    const monthlyInstallmentWithStipend = Math.ceil(grandTotalLoan / totalMonths);

    return (
        `🧮 *IFSLS LOAN & REPAYMENT ESTIMATE* 🧮\n\n` +
        `🎓 *උපාධි කාලය:* වසර ${degreeYears}\n` +
        `💰 *පාඨමාලා ණය මුදල:* රු. ${loanAmount.toLocaleString()}\n` +
        `💳 *Stipend දීමනාව (වසර ${degreeYears}ට):* රු. ${totalStipend.toLocaleString()} *(මාස 3කට වරක් රු. ${quarterlyStipend.toLocaleString()})*\n` +
        `📊 *මුළු ණය එකතුව (Stipend සමඟ):* රු. ${grandTotalLoan.toLocaleString()}\n` +
        `✨ *පොලී අනුපාතය:* 0% (සම්පූර්ණ පොලිය රජය දරයි)\n\n` +
        `⏳ *ආපසු ගෙවීමේ කාලසටහන:*\n` +
        `• උපාධිය අවසන් වී *වසර 1ක සහන කාලයක් (Grace Period)* හිමිවේ.\n` +
        `• ඉන්පසු *වසර ${repaymentYears}ක් (මාස ${totalMonths})* පුරා ගෙවිය යුතු මාසික වාරිකය:\n` +
        `   🔹 *Course Fee පමණක් ගත්තොත්:* ~රු. ${monthlyInstallmentTuitionOnly.toLocaleString()} / මාසයකට\n` +
        `   🔹 *Stipend සමඟම ගත්තොත්:* ~රු. ${monthlyInstallmentWithStipend.toLocaleString()} / මාසයකට`
    );
}

async function handleAdminControlCommands({
    message,
    msgCommand,
    msgText,
    groupId,
    isAdmin,
    blacklistedUsers,
    saveBlacklist,
    directRemoveParticipant,
    BAN_DURATION_MS
}) {
    if (!isAdmin) return false;

    if (msgCommand.startsWith("/unban")) {
        const targetRaw = msgText.split(/\s+/)[1] || "";
        const digits = targetRaw.replace(/\D/g, "");
        if (!digits) {
            await message.reply("⚠️ භාවිතය: `/unban 94771234567`");
            return true;
        }
        let removedCount = 0;
        for (const key of Object.keys(blacklistedUsers)) {
            if (key.includes(digits)) {
                delete blacklistedUsers[key];
                removedCount++;
            }
        }
        if (removedCount > 0) {
            saveBlacklist();
            await message.reply(`✅ *Unbanned:* \`${digits}\` සඳහා තිබූ Ban එක ඉවත් කරන ලදී.`);
        } else {
            await message.reply(`ℹ️ \`${digits}\` දැනට Blacklist එකේ නොමැත.`);
        }
        return true;
    }

    if (msgCommand === "/ban") {
        if (!message.hasQuotedMsg) {
            await message.reply("⚠️ Ban කිරීමට අවශ්‍ය සාමාජිකයාගේ message එකකට *Reply* කර `/ban` ලෙස යවන්න.");
            return true;
        }
        const quoted = await message.getQuotedMessage();
        const targetId = quoted.author || quoted.from;
        if (!targetId) return true;

        blacklistedUsers[targetId] = Date.now() + BAN_DURATION_MS;
        saveBlacklist();
        const removed = await directRemoveParticipant(groupId, targetId);
        if (removed) {
            await message.reply(`🚫 @${targetId.split("@")[0]} Admin විසින් පැය 24කට සමූහයෙන් ඉවත් කර Blacklist කරන ලදී.`, undefined, { mentions: [targetId] });
        } else {
            await message.reply(`⚠️ Blacklist එකට එකතු කළා, නමුත් group එකෙන් remove කිරීමට නොහැකි විය (Admin කෙනෙක් විය හැක).`);
        }
        return true;
    }

    if (msgCommand === "/warn") {
        if (!message.hasQuotedMsg) {
            await message.reply("⚠️ Warning දීමට අවශ්‍ය message එකකට *Reply* කර `/warn` ලෙස යවන්න.");
            return true;
        }
        const quoted = await message.getQuotedMessage();
        const targetId = quoted.author || quoted.from;
        if (!targetId) return true;

        await message.reply(
            `⚠️ *OFFICIAL ADMIN WARNING* ⚠️\n\n` +
            `@${targetId.split("@")[0]}, කරුණාකර සමූහයේ නීති රීති වලට ගරු කරමින් හැසිරෙන්න. නැවත නීති කඩ කළහොත් සමූහයෙන් ස්වයංක්‍රීයව ඉවත් කරනු ලැබේ!`,
            undefined,
            { mentions: [targetId] }
        );
        return true;
    }

    return false;
}

function getCpuUsagePercent() {
    try {
        const cpus = os.cpus();
        if (!cpus || cpus.length === 0) return "N/A";
        let idle = 0;
        let total = 0;
        for (const cpu of cpus) {
            for (const type in cpu.times) {
                total += cpu.times[type];
            }
            idle += cpu.times.idle;
        }
        const usage = ((1 - idle / total) * 100).toFixed(1);
        return `${usage}%`;
    } catch (e) {
        return "N/A";
    }
}

function getStorageSummary() {
    try {
        const out = execSync("df -BG /", { encoding: "utf8" }).trim().split("\n");
        if (out.length < 2) return "N/A";
        const cols = out[1].trim().split(/\s+/);
        return `${cols[2] || "?"} / ${cols[1] || "?"} (${cols[3] || "?"} free, ${cols[4] || "?"})`;
    } catch (e) {
        return "N/A";
    }
}

function buildBotStatusReport({ targetGroupsCount, welcomeQueueLength, blacklistedUsers }) {
    const uptimeSec = Math.floor(process.uptime());
    const hrs = Math.floor(uptimeSec / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);

    const botRamGb = (process.memoryUsage().rss / (1024 ** 3)).toFixed(2);
    const totalSysRamGb = (os.totalmem() / (1024 ** 3)).toFixed(2);
    const freeSysRamGb = (os.freemem() / (1024 ** 3)).toFixed(2);
    const cpuUsage = getCpuUsagePercent();
    const storageInfo = getStorageSummary();
    const activeBans = Object.values(blacklistedUsers).filter(exp => exp > Date.now()).length;

    return (
        `📊 *IFSLS SMART BOT – SYSTEM STATUS* 📊\n\n` +
        `🟢 *Status:* Online & Active\n` +
        `⏱️ *Uptime:* පැය ${hrs}යි, විනාඩි ${mins}යි\n` +
        `👥 *Active Groups:* ${targetGroupsCount}\n` +
        `⏳ *Welcome Inbox Queue:* ${welcomeQueueLength} users pending\n` +
        `🚫 *Active 24h Bans:* ${activeBans}\n` +
        `🧠 *Bot Server Total RAM:* ${botRamGb} GB *(VPS Free: ${freeSysRamGb} GB / Total: ${totalSysRamGb} GB)*\n` +
        `⚡ *BOT CPU Usage:* ${cpuUsage}\n` +
        `💾 *BOT Storage (/):* ${storageInfo}\n` +
    );
}

function startScheduledReminders(client, targetGroupIds, sendWithTimeout) {
    cron.schedule(
        "0 9 * * 1,4",
        async () => {
            const reminderText =
                `📢 *IFSLS 11th INTAKE – WEEKLY REMINDER* 🎓\n\n` +
                `ළමයි, මේ දේවල් අනිවාර්යයෙන්ම මතක තියාගන්න:\n\n` +
                `1️⃣ *Emails Check කරන්න:* Ministry එකෙන් එන දැනුම්දීම් සඳහා ඔයාලගේ Email *Inbox* එක වගේම *Spam / Junk* folder එකත් නිතර check කරන්න.\n` +
                `2️⃣ *Official Notices පමණක් විශ්වාස කරන්න:* Selection Results ගැන නිල තොරතුරු https://studentloans.mohe.gov.lk වෙබ් අඩවියෙන් පමණක් බලන්න.\n` +
                `3️⃣ *Scam Links වලින් පරිස්සම් වෙන්න:* නොදන්නා WhatsApp groups හෝ personal details ඉල්ලන links වලට තොරතුරු දෙන්න එපා.\n\n` +
                `💡 ඕනෑම ප්‍රශ්නයක් තියෙනවා නම් group එකේ */menu* හෝ */ai* පාවිච්චි කරන්න! 😊`;

            for (const groupId of targetGroupIds) {
                try {
                    await sendWithTimeout(client, groupId, reminderText, { sendSeen: false }, 15000);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                } catch (err) {
                    console.error(`❌ [CRON REMINDER ERROR] ${groupId}:`, err.message || err);
                }
            }
        },
        { timezone: "Asia/Colombo" }
    );
    console.log("⏰ Scheduled reminders initialized (Mon & Thu 09:00 AM Asia/Colombo).");
}

async function handleCommonQuestionAutoReply(message, groupId, textLower) {
    if (!textLower || textLower.startsWith("/")) return false;

    const triggers = [
        {
            key: "results",
            patterns: ["results kawadda", "result kawadda", "results enne kawadda", "selection results", "ප්‍රතිඵල කවද්ද"],
            reply: "📊 *IFSLS Selection Results* ගැන විස්තර සහ නිල Portal link එක බලාගන්න group එකේ */results* කියලා type කරන්න! 😊"
        },
        {
            key: "stipend",
            patterns: ["stipend kiyada", "stipend ekata", "මසකට කීයක්", "ශිෂ්‍යාධාර"],
            reply: "💳 *Stipend (ශිෂ්‍යාධාර දීමනාව)* ගෙවන විදිහ සහ ගණන් බලාගන්න */stipend* හෝ */calc* කියලා type කරන්න! 😊"
        },
        {
            key: "appeal",
            patterns: ["appeal karanne kohomada", "appeal danna", "අභියාචනා", "course maru"],
            reply: "📝 *Appeals (අභියාචනා)* සහ Course/Campus මාරු කරන විදිහ ගැන විස්තර සඳහා */specialnotes* හෝ */coursechange* කියලා type කරන්න! 😊"
        },
        {
            key: "bridging",
            patterns: ["bridging fee", "bridging course", "ඈඳුනු පාඨමාලා"],
            reply: "🌉 *Bridging Courses (ඈඳුනු පාඨමාලා)* ගාස්තු සහ සම්බන්ධ කරගත යුතු නිලධාරීන්ගේ විස්තර සඳහා */bridginginfo* කියලා type කරන්න! 😊"
        }
    ];

    const now = Date.now();
    for (const item of triggers) {
        if (item.patterns.some(p => textLower.includes(p))) {
            const cooldownKey = `${groupId}_${item.key}`;
            const lastSent = keywordCooldowns.get(cooldownKey) || 0;
            if (now - lastSent < KEYWORD_COOLDOWN_MS) return false;

            keywordCooldowns.set(cooldownKey, now);
            await message.reply(item.reply);
            return true;
        }
    }
    return false;
}

module.exports = {
    handleCalculatorCommand,
    handleAdminControlCommands,
    buildBotStatusReport,
    startScheduledReminders,
    handleCommonQuestionAutoReply
};
