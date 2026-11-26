
// GITHUB_94_BAILEYS_ENFORCED
function isSriLankan(number) {
    if (!number) return false;
    return String(number).replace(/\D/g, "").startsWith("94");
}

async function resolveJoinPhoneNumber(sock, groupId, part) {
    const candidates = [];
    if (part && typeof part === "object") {
        if (part.phoneNumber) candidates.push(String(part.phoneNumber));
        if (part.pn) candidates.push(String(part.pn));
        if (part.jid) candidates.push(String(part.jid));
        if (part.id) candidates.push(String(part.id));
    } else if (typeof part === "string") {
        candidates.push(part);
    }

    for (const c of candidates) {
        if (c.includes("@s.whatsapp.net")) {
            const digits = c.split("@")[0].replace(/\D/g, "");
            if (digits.length >= 7 && digits.length <= 15) return digits;
        }
    }

    const rawId = typeof part === "string" ? part : (part?.id || part?.jid || "");
    if (rawId.endsWith("@lid") && sock?.signalRepository?.lidMapping?.getPNForLID) {
        try {
            const pn = await sock.signalRepository.lidMapping.getPNForLID(rawId);
            if (pn) {
                const digits = String(pn).split("@")[0].replace(/\D/g, "");
                if (digits.length >= 7 && digits.length <= 15) return digits;
            }
        } catch (_) {}
    }

    if (groupId && sock?.groupMetadata) {
        try {
            const meta = await sock.groupMetadata(groupId);
            const found = (meta?.participants || []).find((m) => m.id === rawId || m.lid === rawId);
            if (found?.phoneNumber) {
                const digits = String(found.phoneNumber).split("@")[0].replace(/\D/g, "");
                if (digits.length >= 7 && digits.length <= 15) return digits;
            }
            if (found?.id && found.id.endsWith("@s.whatsapp.net")) {
                const digits = found.id.split("@")[0].replace(/\D/g, "");
                if (digits.length >= 7 && digits.length <= 15) return digits;
            }
        } catch (_) {}
    }

    return null;
}

async function handleNonSriLankanOnGroupAdd(sock, groupId, participants) {
    const kickedSet = new Set();
    for (const part of participants || []) {
        const userId = typeof part === "string" ? part : (part?.id || part?.jid);
        if (!userId) continue;

        const actualNumber = await resolveJoinPhoneNumber(sock, groupId, part);
        if (actualNumber && !isSriLankan(actualNumber)) {
            const name = (typeof part === "object" && (part.notify || part.name || part.pushName)) || userId.split("@")[0];
            kickedSet.add(userId);
            try {
                await sock.sendMessage(groupId, {
                    text: `🌍 @${userId.split("@")[0]} (*${name}*) Sorry, only Sri Lankan numbers (+94) are allowed in this group. You will be removed.`,
                    mentions: [userId]
                });
            } catch (msgErr) {
                console.error("⚠️ [NON-94 MSG FAILED]:", msgErr.message);
            }
            try {
                await sock.groupParticipantsUpdate(groupId, [userId], "remove");
                console.log("🚫 [NON-94 REMOVED]:", userId, "| Number:", actualNumber, "| Group:", groupId);
            } catch (remErr) {
                console.error("⚠️ [NON-94 REMOVE FAILED]:", userId, remErr.message);
            }
        }
    }
    return kickedSet;
}

function buildWelcomeForUser(digitsOrTag) {
    const label = digitsOrTag || "student";
    const firstMsg =
        "🎓 *Welcome to IFSLS 11th INTAKE MAIN GROUP* 🎓\n\n" +
        "👋 Hello / ආයුබෝවන් @" + label + ",\n\n" +
        "Please follow these group guidelines to maintain a good learning environment.\n" +
        "කරුණාකර සමූහයේ යහපැවැත්ම උදෙසා පහත නීති මාලාව පිළිපදින්න.\n\n" +
        "*GROUP RULES / නීති මාලාව:*\n" +
        "1️⃣ Be respectful to everyone.\n(සියලුම සාමාජිකයින්ට ගෞරවයෙන් සලකන්න.)\n\n" +
        "2️⃣ 🚫 No Spamming or flooding messages.\n(අනවශ්‍ය පණිවිඩ යැවීමෙන් වළකින්න.)\n\n" +
        "3️⃣ 🚫 No unauthorized links (Other WhatsApp groups, Telegram, Scam/Business links). Only educational links are allowed.\n(වෙනත් WhatsApp Group, Telegram හෝ ව්‍යාපාරික ලින්ක් දැමීම සපුරා තහනම්. අවසරලත් අධ්‍යාපනික ලින්ක් සඳහා පමණක් අවසර ඇත.)\n\n" +
        "4️⃣ 🎓 For further questions regarding student loans, please contact the group admins. Please watch the YouTube playlist below for more information.\n(ශිෂ්‍ය ණය පිළිබඳ වැඩිදුර ප්‍රශ්න සඳහා සමූහයේ Admin වරුන් සම්බන්ධ කරගන්න. ණය පිළිබඳ සියලුම තොරතුරු දැනගැනීමට පහත YouTube Playlist එක අනිවාර්යයෙන්ම නරඹන්න.)\n" +
        "📺 *YouTube Playlist:* https://youtube.com/playlist?list=PL-ZbzAh0pKykpa-odcUrDEg94PBbTQp9M&si=F9L3Spy-pLZJq31n\n\n" +
        "⚠️ *Note:* Breaking these rules will result in an automatic permanent ban by the system.\n(මෙම නීති කඩකරන අයව පද්ධතිය මගින් ස්වයංක්‍රීයව සමූහයෙන් ඉවත් කරනු ලැබේ.)\n\n" +
        "Thank you! / ස්තූතියි!\n" +
        "🤖 _System Generated Message. Please do not reply._";

    const secondMsg =
        "🤖 *Smart Bot Commands IFSLS Group Only Don't Send Direct Message to this Number (ස්වයංක්‍රීය සහය)* 🤖\n\n" +
        "ළමයි ඔයාලට ශිෂ්‍ය ණය ගැන අවශ්‍ය මූලික තොරතුරු ක්ෂණිකව Bot හරහා දැන් ලබාගන්න පුළුවන්. ඒ සඳහා *Group එක ඇතුළට ගොස්* / type කරලා පහත Commands ටයිප් කරලා send කරන්න.\n\n" +
        "📌 */menu* - සියලුම විස්තර සහ Commands බලාගැනීමට.\n" +
        "📌 */about* - IFSLS ගැන විස්තර.\n" +
        "📌 */eligibility* - ණය ලබාගැනීමේ සුදුසුකම්.\n" +
        "📌 */stipend* - ශිෂ්‍යාධාර දීමනා පිළිබඳව.\n" +
        "📌 */conditions* - Degree හදාරන කාලය තුලදි පිලිපැදිය යුතු නීති.\n" +
        "📌 */applycenters* - Apply කීරිමේ මධ්‍යස්ථාන පිළිබඳ විස්තර.\n" +
        "📌 */applysteps* - අයදුම් කිරීමේ පියවර.\n" +
        "📌 */afterapplysteps* - අයදුම් කිරීමෙන් පසු පියවර.\n" +
        "📌 */ministrycontact* - Ministry Department එක contact කර ගැනීම සදහා\n\n" +
        "📌 */ugccancel* - UGC Registration Cancel කිරීම සදහා\n" +
        "📌 */laptopguide* - Degree එකට හරියන Laptop Buying Guide\n" +
        "📌 */jobs* - Internships සහ Jobs විස්තර\n" + +
        "📌 */boarding* - බෝඩිම් / Accommodation Web & Video\n\n" +
        "📄 *Guide Books (භාෂා 3):*\n" +
        "🇱🇰 */guidepdf-si* (සිංහල මාර්ගෝපදේශකය)\n" +
        "🌍 */guidepdf-ta* (දෙමළ මාර්ගෝපදේශකය)\n" +
        "🇬🇧 */guidepdf-en* (ඉංග්‍රීසි මාර්ගෝපදේශකය)\n\n" +
        "🏫 *කැම්පස් වල ඔයාලට දෙන Degrees වලට අදාල විස්තර බලාගන්න අවශ්‍යනම් කැම්පස් එකේ නමට කලින් / දාලා campus නම ගෲප් එකට සෙන්ඩ් කරන්න.*\n" +
        "(උදාහරණ: */sliit*, */nsbm*, */cinec*, */saegis*)\n\n" +
        "💡 *දැන්ම Group එකට ගිහින් /menu කියලා Type කරලා බලන්නකො ළමයි!* 😎";

    return { firstMsg, secondMsg };
}

async function sendWelcomeInboxToUsers(sock, list, checkBlacklistFn) {
    for (const u of list) {
        if (checkBlacklistFn && checkBlacklistFn(u.jid)) continue;
        const targetJid = u && u.jid ? String(u.jid) : (u && u.digits ? String(u.digits) + "@lid" : null);
        if (!targetJid) continue;
        const tagDigits = String((u && u.digits) || targetJid.split("@")[0] || "student").replace(/\D/g, "") || "student";
        const { firstMsg, secondMsg } = buildWelcomeForUser(tagDigits);
        let delivered = false;
        try {
            await sock.sendMessage(targetJid, { text: firstMsg });
            await new Promise((r) => setTimeout(r, 2500));
            await sock.sendMessage(targetJid, { text: secondMsg });
            console.log("📩 [WELCOME DM SENT] To:", targetJid);
            delivered = true;
        } catch (err) {
            console.error("⚠️ [WELCOME DM FAILED] To:", targetJid, ":", err.message);
        }
        if (!delivered && u && u.groupId) {
            try {
                const mentionText = "@" + tagDigits + "\n\n" + firstMsg + "\n\n" + secondMsg;
                await sock.sendMessage(u.groupId, { text: mentionText, mentions: [targetJid] });
                console.log("👋 [WELCOME GROUP FALLBACK SENT] Group:", u.groupId, "| User:", targetJid);
            } catch (gErr) {
                console.error("❌ [WELCOME FALLBACK ERROR]:", gErr.message);
            }
        }
        await new Promise((r) => setTimeout(r, 2000));
    }
}


function __safeIsUserBlacklisted(jid) {
    if (typeof isUserBlacklisted === "function" && isUserBlacklisted !== __safeIsUserBlacklisted) {
        return global.isUserBlacklisted(jid);
    }
    if (!jid || typeof blacklistedUsers !== "object" || !blacklistedUsers) return false;
    const now = Date.now();
    const digits = String(jid).split("@")[0].split(":")[0].replace(/\D/g, "");
    for (const [k, exp] of Object.entries(blacklistedUsers)) {
        if (!exp || now > exp) continue;
        const kDigits = String(k).split("@")[0].split(":")[0].replace(/\D/g, "");
        if (k === jid || (digits && kDigits === digits)) return true;
    }
    return false;
}
global.isUserBlacklisted = __safeIsUserBlacklisted;


function getParticipantJid(p) {
    if (!p) return "";
    if (typeof p === "string") return p;
    return p.jid || p.id || p.lid || "";
}
global.getParticipantJid = getParticipantJid;

if (typeof startWelcomeBatchScheduler === "function") {
    global.startWelcomeBatchScheduler = startWelcomeBatchScheduler;
}


const WELCOME_BATCH_INTERVAL_MS = 30 * 60 * 1000;
global.pendingWelcomeByGroup = global.pendingWelcomeByGroup || new Map();
const pendingWelcomeByGroup = global.pendingWelcomeByGroup;
global.__welcomeBatchTimerStarted = global.__welcomeBatchTimerStarted || false;

function __getParticipantJid(p) {
    if (!p) return "";
    if (typeof p === "string") return p;
    return p.jid || p.id || p.lid || "";
}

function __getUserDigits(jid) {
    return String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");
}

function __isUserBlacklisted(jid) {
    if (!jid || typeof blacklistedUsers !== "object") return false;
    const now = Date.now();
    const digits = __getUserDigits(jid);
    for (const [k, exp] of Object.entries(blacklistedUsers)) {
        if (!exp || now > exp) continue;
        if (k === jid || (digits && __getUserDigits(k) === digits)) return true;
    }
    return false;
}

async function flushWelcomeBatches(sock) {
    for (const [, usersMap] of pendingWelcomeByGroup.entries()) {
        const users = Array.from(usersMap.values());
        usersMap.clear();
        if (users.length === 0) continue;
        const blFn = typeof __isUserBlacklisted === "function"
            ? __isUserBlacklisted
            : (typeof global.isUserBlacklisted === "function" ? global.isUserBlacklisted : () => false);
        await sendWelcomeInboxToUsers(sock, users, blFn);
    }
}

function startWelcomeBatchScheduler(sock) {
    if (global.__welcomeBatchTimerStarted) return;
    global.__welcomeBatchTimerStarted = true;
    setInterval(() => {
        flushWelcomeBatches(sock).catch((e) => console.error("[welcome-timer]", e.message));
    }, WELCOME_BATCH_INTERVAL_MS);
}

global.flushWelcomeBatches = flushWelcomeBatches;
global.startWelcomeBatchScheduler = startWelcomeBatchScheduler;

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    getContentType
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const Groq = require("groq-sdk");

const {
    handleCalculatorCommand,
    handleCommonQuestionAutoReply,
    buildBotStatusReport
} = require("./features");
const { handleCutoffFeature } = require("./cutoffFeature");
const { moderateGroupMessage, blacklistedUsers } = require("./moderationFeature");

const groqApiKey = process.env.GROQ_API_KEY;
if (!groqApiKey) {
    console.warn("⚠️ [WARN] GROQ_API_KEY environment variable is not set!");
}
const groq = new Groq({ apiKey: groqApiKey || "" });

const pmRepliedUsers = new Map();
const pmCooldownTimestamps = new Map();
const PM_COOLDOWN_MS = 24 * 60 * 60 * 1000;

let englishGuide = "";
let sinhalaGuide = "";

function loadGuides() {
    try {
        const enPath = path.join(__dirname, "ifsls-guide-en.txt");
        if (fs.existsSync(enPath)) {
            englishGuide = fs.readFileSync(enPath, "utf8");
            console.log("✅ English Guide Text File Loaded Successfully!");
        } else {
            console.log("⚠️ English Guide Text File not found!");
        }
    } catch (e) {
        console.log("❌ Error loading English Text File:", e);
    }

    try {
        const siPath = path.join(__dirname, "ifsls-guide-si.txt");
        if (fs.existsSync(siPath)) {
            sinhalaGuide = fs.readFileSync(siPath, "utf8");
            console.log("✅ Sinhala Guide Text File Loaded Successfully!");
        } else {
            console.log("⚠️ Sinhala Guide Text File not found!");
        }
    } catch (e) {
        console.log("❌ Error loading Sinhala Text File:", e);
    }
}

const TARGET_GROUP_IDS = [
    "120363427144307038@g.us",
    "120363428845309010@g.us",
    "120363431402119738@g.us"
];

const ifslsAnswers = {
    "/faq-en": "📚 *IFSLS FREQUENTLY ASKED QUESTIONS (ENGLISH)* 📚\n\n*1️⃣ What is IFSLS?*\nIFSLS stands for the *Interest Free Student Loans Scheme*, implemented by the Ministry of Education, Higher Education and Vocational Education.\n• Main objective: Increase higher education opportunities in collaboration with Non-State Higher Education Institutes (NSHEIs), addressing the fact that state universities accommodate only ~25% of A/L qualified students.\n• The government provides an *interest-free loan* for market-oriented degree programs and bears the interest for the entire *12-year* loan period.\n\n*2️⃣ Who are eligible to submit an application to the IFSLS?*\nFor the academic year *2026/27 (11th Intake)*:\n• Passed G.C.E (A/L) in *2023, 2024, or 2025* and qualified for university entrance.\n• Minimum of simple *(S)* passes for all three subjects in one attempt (maximum 3 sittings in total).\n• Minimum of *30 marks* for the Common General Test (CGT) at any sitting (within 3 sittings), obtained at the time of interviews.\n• Minimum of a simple *(S)* pass for General English at G.C.E (A/L) OR English Language at G.C.E (O/L).\n• Age must be *25 years or below* by *September 27th, 2026*.\n\n*3️⃣ Why should I apply for IFSLS?*\n• Bridges the higher education gap with government financial support.\n• 100% interest-free loan for high-demand degree programs (government bears interest for 12 years).\n• Optional interest-free *stipend loan* up to *Rs. 300,000/-* for a 4-year program to cover living/additional expenses.\n\n*4️⃣ What are the available subject streams under IFSLS?*\n• Engineering & Technology\n• Information and Communication Technology (ICT)\n• Science\n• Management and Commerce\n• Humanities and Social Sciences\n\n*5️⃣ Does the Government/Bank pay the loan amount directly to me?*\n• *Course Fee:* No. Semester fees are paid by the bank directly to the respective NSHEI at the beginning of each semester.\n• *Stipend Loan:* Yes, if opted, it is paid directly to students quarterly at *Rs. 18,750/-* (Rs. 6,250/- per month) upon signing a bank voucher.\n\n*6️⃣ Do I have to bear the rest of the course fee on my own?*\n• No. NSHEIs have agreed to offer listed programs at the exact maximum course fee stated in the student guidebook without extra course fee charges.\n\n*7️⃣ Do I have to bear any other costs during my studies?*\nYes, in the following cases:\n• *Repeat Examinations:* Fees for repeating any failed compulsory subject.\n• *Bridging Course Fee:* Mandatory bridging course fees if applying for an ICT degree (without Physical Science stream or A/L ICT 'S' pass) or a Management degree (without Commerce stream or A/L Econ 'S' pass). Fees vary by NSHEI.\n\n*8️⃣ How do I apply for the Stipend loan?*\n• Selected students can opt for the stipend loan (added to the course fee loan) when signing the bank loan agreement.\n• Paid quarterly at *Rs. 18,750/-* (Rs. 6,250/- per month) by signing a bank slip upon Ministry recommendation.\n\n*9️⃣ What is the repayment procedure of the loan?*\n• Total loan period: *12 years*.\n• *Grace Period:* 1 year after completing the degree program before repayment starts.\n• *Repayment Duration:*\n  - 4-year degrees: *7 years* (84 equal installments).\n  - 3-year degrees: *8 years* (96 equal installments).\n\n*🔟 Do I have to pay back the interest of the loan?*\n• Generally *no*—the government bears the interest.\n• *Exception:* If you drop out/fail to complete studies midway, you must repay the outstanding capital (Semester fees + Stipend) *along with the interest* borne by the government up to settlement.\n\n*1️⃣1️⃣ What are my commitments during the study period under IFSLS?*\n• Sign agreements with both the Ministry of Education and the Bank.\n• Provide two guarantors: Mother/Father or close relative (1st guarantor) and a close relative/known person (2nd guarantor).\n• Obtain at least a *'C' pass* for every compulsory subject and maintain *80% attendance*.\n• Repeat any failed compulsory subject at your own cost and complete the degree within the 3 or 4-year timeframe.\n\n*1️⃣2️⃣ When will applications open for the 11th Intake?*\n• From *17.08.2026 to 12:00 midnight of 27.09.2026* (based on 2023, 2024, and 2025 A/L results).\n\n*1️⃣3️⃣ How do I apply?*\n• Apply online via *www.studentloans.mohe.gov.lk*.\n• Read the student handbook, register with NIC and A/L index number (password sent via email), arrange degree preferences in priority order, confirm accuracy, and click *\"Finalize\"* before the deadline.\n• Free/assisted access is also available at NODES, Provincial/Zonal ICT Centers, or Nanasala Centers (processing fee may apply).\n\n*1️⃣4️⃣ What documents are required?*\n*(Scanned originals prior to online interview; originals at physical registration)*\n• Signed printed copy of the online application.\n• Certification: Principal/authorized teacher (school candidates) OR Justice of the Peace/Commissioner for Oaths (private candidates).\n• Original NIC or Passport & Original Birth Certificate.\n• Original G.C.E (A/L) and G.C.E (O/L) certificates (plus relevant A/L certificate if CGT was passed in another year).\n• Original School Leaving Certificate & Grama Niladari Certificate.\n• Bridging course result sheet (if applicable).\n\n*1️⃣5️⃣ What happens after I submit an application?*\n• Merit-based selection using Z-score, preferences, and NSHEI capacity.\n• Online interview notifications sent via email within ~1 month after closing (list also published on the Ministry website).\n• Selected candidates receive an email with degree/NSHEI details and registration dates.\n\n*1️⃣6️⃣ When can I commence my degree under the 11th Intake?*\n• Registration takes place during *January–February 2027*, followed by enrollment according to each NSHEI's academic calendar.\n\n*1️⃣7️⃣ What makes me ineligible to apply?*\n• Sat G.C.E (A/L) on more than three (03) occasions.\n• Already selected/registered as an internal student for a state university degree (UGC), other state higher educational institute under an Act of Parliament, College of Education, full-time HND (SLIATE) / NDES (NAITA) of 3+ years, or 3-year diploma at a University College (UNIVOTEC).\n• Selected/registered for any other publicly funded degree or Ministry foreign scholarship degree.\n• Already registered for a full-time degree at an IFSLS-associated NSHEI, engaged in *full-time employment*, or already holding a Bachelor's degree/equivalent qualification.\n• Submitting *false information or forged documents* (results in immediate dismissal).",
    "/faq-si": "📚 *IFSLS නිතර අසනු ලබන ප්‍රශ්න සහ පිළිතුරු (සිංහල)* 📚\n\n*1️⃣ IFSLS යනු කුමක්ද?*\nIFSLS යනු අධ්‍යාපන, උසස් අධ්‍යාපන සහ වෘත්තීය අධ්‍යාපන අමාත්‍යාංශය මඟින් ක්‍රියාත්මක කරන *පොලී රහිත ශිෂ්‍ය ණය යෝජනා ක්‍රමයයි (Interest Free Student Loans Scheme)*.\n• අරමුණ: රජයේ විශ්වවිද්‍යාල සඳහා ඇතුළත් කරගත හැක්කේ සුදුසුකම් ලබන සිසුන්ගෙන් ~25% ක් පමණක් වන බැවින්, රාජ්‍ය නොවන උසස් අධ්‍යාපන ආයතන (NSHEIs) සමඟ එක්ව සිසුන්ට උසස් අධ්‍යාපන අවස්ථා පුළුල් කිරීම.\n• රැකියා වෙළඳපොළේ ඉහළ ඉල්ලුමක් ඇති උපාධි හැදෑරීමට *100% පොලී රහිත ණයක්* ලබා දෙන අතර, සම්පූර්ණ *වසර 12ක* ණය කාලය තුළ පොලිය රජය විසින් දරයි.\n\n*2️⃣ IFSLS සඳහා අයදුම් කිරීමට සුදුසුකම් මොනවාද?*\n*2026/27 (11th Intake)* අධ්‍යයන වර්ෂය සඳහා:\n• *2023, 2024, හෝ 2025* වර්ෂවල අ.පො.ස (උ/පෙළ) විභාගයට පෙනී සිට විශ්වවිද්‍යාල ප්‍රවේශයට සුදුසුකම් ලබා තිබීම.\n• උපරිම වාර 3ක් ඇතුළත, එක් වරකදී විෂයයන් 3ටම අවම *'S'* සාමාර්ථ ලබා තිබීම.\n• ඕනෑම වාරයකදී (වාර 3 ඇතුළත) සාමාන්‍ය පොදු පරීක්ෂණයට (CGT) අවම *ලකුණු 30ක්* ලබා තිබීම (සම්මුඛ පරීක්ෂණ වන විට ප්‍රතිඵල නිකුත් වී තිබිය යුතුය).\n• උ/පෙළ සාමාන්‍ය ඉංග්‍රීසි (General English) හෝ සා/පෙළ ඉංග්‍රීසි විෂයට අවම *'S'* සාමාර්ථයක් තිබීම.\n• *2026 සැප්තැම්බර් 27* දිනට වයස *අවුරුදු 25 හෝ ඊට අඩු* වීම.\n\n*3️⃣ IFSLS සඳහා අයදුම් කළ යුත්තේ ඇයි?*\n• රජයේ කැම්පස් නොලැබුණු හෝ පෞද්ගලික විශ්වවිද්‍යාල ගාස්තු දැරීමට අපහසු සිසුන්ට රජයේ මූල්‍ය සහය ඇතිව උපාධියක් ලබා ගැනීමට.\n• වසර 12ක සම්පූර්ණ ණය කාලය සඳහාම පොලිය රජය විසින් ගෙවීම.\n• අමතර වියදම් සඳහා වසර 4ක උපාධියකට *රු. 300,000/-* දක්වා පොලී රහිත *ශිෂ්‍යාධාර ණයක් (Stipend)* ලබා ගැනීමේ හැකියාව.\n\n*4️⃣ IFSLS යටතේ හැදෑරිය හැකි විෂය ධාරාවන් මොනවාද?*\n• ඉංජිනේරු සහ තාක්ෂණවේදය (Engineering & Technology)\n• තොරතුරු හා සන්නිවේදන තාක්ෂණය (ICT)\n• විද්‍යා (Science)\n• කළමනාකරණය සහ වාණිජ (Management and Commerce)\n• මානව ශාස්ත්‍ර හා සමාජ විද්‍යා (Humanities and Social Sciences)\n\n*5️⃣ රජය/බැංකුව ණය මුදල කෙළින්ම මගේ අතට ගෙවනවාද?*\n• *පාඨමාලා ගාස්තුව:* නැත. එක් එක් සෙමෙස්ටරය ආරම්භයේදී බැංකුව විසින් අදාළ ආයතනයට (NSHEI) කෙළින්ම ගෙවනු ලැබේ.\n• *ශිෂ්‍යාධාර දීමනාව (Stipend):* ඔබ එය ඉල්ලුම් කර ඇත්නම්, බැංකු වවුචරයකට අත්සන් කිරීමෙන් පසු ත්‍රෛමාසිකව (මාස 3කට වරක්) *රු. 18,750/-* බැගින් (මාසිකව රු. 6,250/-) කෙළින්ම ඔබට ගෙවනු ලැබේ.\n\n*6️⃣ පාඨමාලා ගාස්තුවේ ඉතිරි කොටසක් මට අතින් ගෙවන්න සිදුවෙනවාද?*\n• නැත. ශිෂ්‍ය අත්පොතේ (Guidebook) සඳහන් උපරිම පාඨමාලා ගාස්තුවටම අදාළ උපාධිය ලබා දීමට NSHEI ආයතන එකඟ වී ඇති බැවින් අමතර පාඨමාලා ගාස්තු ගෙවීමට අවශ්‍ය නොවේ.\n\n*7️⃣ අධ්‍යයන කාලය තුළ වෙනත් වියදම් දැරීමට සිදුවෙනවාද?*\nඔව්, පහත අවස්ථාවලදී ඔබ විසින් ගෙවිය යුතුය:\n• *නැවත විභාග ගාස්තු (Repeat Exams):* අනිවාර්ය විෂයයක් අසමත් වුවහොත් නැවත විභාගයට පෙනී සිටීමේ ගාස්තු.\n• *ඈඳුනු පාඨමාලා ගාස්තු (Bridging Course):* උ/පෙළ භෞතික විද්‍යා හෝ ICT ('S') නොමැතිව ICT උපාධියකට අයදුම් කරන්නේ නම් හෝ වාණිජ විෂය ධාරාව / ආර්ථික විද්‍යාව ('S') නොමැතිව Management උපාධියකට අයදුම් කරන්නේ නම් අනිවාර්ය Bridging පාඨමාලාවේ ගාස්තුව (ආයතනය අනුව ගාස්තු වෙනස් වේ).\n\n*8️⃣ ශිෂ්‍යාධාර ණය (Stipend loan) සඳහා අයදුම් කරන්නේ කෙසේද?*\n• තේරී පත් වූ සිසුන් බැංකුව සමඟ ණය ගිවිසුම අත්සන් කරන විට තම කැමැත්ත පරිදි මෙය එකතු කරගත හැක.\n• අමාත්‍යාංශ නිර්දේශය මත බැංකු පත්‍රිකාවකට අත්සන් කර මාස 3කට වරක් *රු. 18,750/-* බැගින් ලබාගත හැක.\n\n*9️⃣ ණය ආපසු ගෙවීමේ ක්‍රියාවලිය කුමක්ද?*\n• සම්පූර්ණ ණය කාලය: *වසර 12කි*.\n• *සහන කාලය (Grace Period):* උපාධිය අවසන් වූ පසු *වසර 1ක* සහන කාලයක් ලැබේ.\n• *ආපසු ගෙවන කාලය:*\n  - වසර 4 උපාධි සඳහා: *වසර 7ක්* (සමාන වාරික 84ක්).\n  - වසර 3 උපාධි සඳහා: *වසර 8ක්* (සමාන වාරික 96ක්).\n\n*🔟 ණය මුදලේ පොලිය මට ගෙවන්න සිදුවෙනවාද?*\n• සාමාන්‍යයෙන් *නැත*—පොලිය රජය විසින් දරයි.\n• *විශේෂ අවස්ථාව:* යම් හේතුවක් මත පාඨමාලාව අතරමගදී අතහැරියහොත්, ඒ වන විට ගෙවා ඇති මුළු මුදල (සෙමෙස්ටර් ගාස්තු + ශිෂ්‍යාධාර) *සහ රජය විසින් දැරූ පොලියද* බැංකුවට ගෙවිය යුතුය.\n\n*1️⃣1️⃣ අධ්‍යයන කාලය තුළ මගේ වගකීම් (Commitments) මොනවාද?*\n• අමාත්‍යාංශය සමඟ ගිවිසුමක් සහ බැංකුව සමඟ වෙනම ණය ගිවිසුමක් අත්සන් කිරීම.\n• ඇපකරුවන් දෙදෙනෙකු ඉදිරිපත් කිරීම: මව/පියා හෝ සමීප ඥාතියෙකු (පළමු ඇපකරු) සහ සමීප ඥාතියෙකු/හඳුනන අයෙකු (දෙවන ඇපකරු).\n• සෑම අනිවාර්ය විෂයයකටම අවම *'C' සාමාර්ථයක්* ලබා ගැනීම සහ *80% පැමිණීම* පවත්වා ගැනීම.\n• විෂයයක් අසමත් වුවහොත් තම වියදමින් නැවත සමත් වී නියමිත වසර 3 හෝ 4 ඇතුළත උපාධිය සම්පූර්ණ කිරීම.\n\n*1️⃣2️⃣ 11th Intake සඳහා අයදුම්පත් භාරගන්නේ කවදාද?*\n• *2026.08.17 දින සිට 2026.09.27 මධ්‍යම රාත්‍රී 12:00 දක්වා* (2023, 2024, සහ 2025 උ/පෙළ ප්‍රතිඵල මත).\n\n*1️⃣3️⃣ අයදුම් කරන්නේ කෙසේද?*\n• *www.studentloans.mohe.gov.lk* වෙබ් අඩවිය හරහා Online අයදුම් කළ යුතුය.\n• ශිෂ්‍ය අත්පොත කියවා, NIC සහ උ/පෙළ විභාග අංකයෙන් Register වී (මුරපදය Email මඟින් ලැබේ), කැමැත්තේ අනුපිළිවෙලට උපාධි තෝරා, තොරතුරු තහවුරු කර *\"Finalize\"* click කරන්න.\n• අන්තර්ජාල පහසුකම් නොමැති නම් NODES, පළාත්/කලාපීය ICT මධ්‍යස්ථාන හෝ නැණසල මධ්‍යස්ථාන හරහා අයදුම් කළ හැක (සේවා ගාස්තුවක් අය විය හැක).\n\n*1️⃣4️⃣ අවශ්‍ය ලියකියවිලි මොනවාද?*\n*(Online සම්මුඛ පරීක්ෂණයට පෙර Scan පිටපත් ද, Physical ලියාපදිංචියේදී මුල් පිටපත් ද ඉදිරිපත් කළ යුතුය)*\n• අත්සන් කළ Online අයදුම්පතේ මුද්‍රිත පිටපත.\n• පාසල් අයදුම්කරුවෙකු නම් විදුහල්පති/බලයලත් ගුරුවරයෙකු සහතික කළ සහතිකය; පෞද්ගලික අයදුම්කරුවෙකු නම් සාම විනිසුරු (JP) / දිවුරුම් කොමසාරිස් සහතිකය.\n• ජාතික හැඳුනුම්පත (NIC) හෝ විදේශ ගමන් බලපත්‍රය (මුල් පිටපත) සහ මුල් උප්පැන්න සහතිකය.\n• අ.පො.ස (උ/පෙළ) සහ (සා/පෙළ) මුල් සහතික (CGT වෙනත් වර්ෂයක සමත් වී ඇත්නම් එම වර්ෂයේ උ/පෙළ සහතිකයද).\n• මුල් පාසල් හැරයාමේ සහතිකය සහ ග්‍රාම නිලධාරී සහතිකය.\n• Bridging පාඨමාලා ප්‍රතිඵල ලේඛනය (අදාළ නම්).\n\n*1️⃣5️⃣ අයදුම්පත යොමු කළ පසු කුමක් සිදුවේද?*\n• Z-ලකුණු, කැමැත්තේ අනුපිළිවෙල සහ ආයතනවල පුරප්පාඩු මත තෝරා ගැනීම සිදු කෙරේ.\n• අයදුම්පත් භාරගැනීම අවසන් වී මාසයක් පමණ ඇතුළත Online සම්මුඛ පරීක්ෂණ සඳහා Email මඟින් කැඳවනු ලැබේ (නාමලේඛනය වෙබ් අඩවියේද පළ කෙරේ).\n• තේරී පත් වූ සිසුන්ට උපාධිය, ආයතනය සහ ලියාපදිංචි දිනයන් Email මඟින් දැනුම් දෙනු ඇත.\n\n*1️⃣6️⃣ 11th Intake උපාධි පාඨමාලා ආරම්භ වන්නේ කවදාද?*\n• *2027 ජනවාරි - පෙබරවාරි* කාලය තුළ අදාළ NSHEI ආයතනවල ලියාපදිංචි වී, එම ආයතනවල අධ්‍යයන දින දර්ශනයට අනුව අධ්‍යයන කටයුතු ආරම්භ කෙරේ.\n\n*1️⃣7️⃣ අයදුම් කිරීමට නුසුදුසු (Ineligible) වන්නේ කවුද?*\n• අ.පො.ස (උ/පෙළ) විභාගයට තුන් වතාවකට (03) වඩා පෙනී සිට ඇති අය.\n• රජයේ විශ්වවිද්‍යාලයක (UGC), වෙනත් පාර්ලිමේන්තු පනතකින් ස්ථාපිත රාජ්‍ය උසස් අධ්‍යාපන ආයතනයක, විද්‍යාපීඨයක, වසර 3+ පූර්ණ කාලීන HND (SLIATE) / NDES (NAITA), හෝ විශ්වවිද්‍යාල විද්‍යාලයක (UNIVOTEC) වසර 3 ඩිප්ලෝමාවක අභ්‍යන්තර ශිෂ්‍යයෙකු ලෙස තේරී/ලියාපදිංචි වී ඇති අය.\n• රාජ්‍ය අරමුදල් යටතේ ක්‍රියාත්මක වෙනත් උපාධියකට හෝ අමාත්‍යාංශ විදේශ ශිෂ්‍යත්ව උපාධියකට තේරී/ලියාපදිංචි වී ඇති අය.\n• IFSLS හා සම්බන්ධ NSHEI ආයතනයක පූර්ණ කාලීන උපාධියකට දැනටමත් ලියාපදිංචි වී ඇති, *පූර්ණ කාලීන රැකියාවක* නියුතු, හෝ දැනටමත් උපාධියක්/සමාන සුදුසුකමක් ලබා ඇති අය.\n• *අසත්‍ය තොරතුරු හෝ ව්‍යාජ ලේඛන* ඉදිරිපත් කරන අය (එවැනි අය IFSLS සහ ආයතනයෙන් නෙරපා හරිනු ලැබේ).",
    "/about": "🎓 *IFSLS යනු කුමක්ද?*\nමෙය ශ්‍රී ලංකා රජය මගින් රාජ්‍ය නොවන විශ්වවිද්‍යාල වල උපාධියක් හැදෑරීම සඳහා සිසුන්ට ලබාදෙන 100% ක් පොලී රහිත ශිෂ්‍ය ණය යෝජනා ක්‍රමයකි.",
    "/ministrycontact": "🏛️ *MINISTRY OF HIGHER EDUCATION - CONTACT DETAILS* 🇱🇰\n\n🏢 *Non-State Higher Education Division (Ethul Kotte Office):*\n\n• *Address:* No. 980/4A, Wickramasinghe Place, Ethul Kotte, Sri Lanka\n\n• *Director (Student Loans):* +94 11 287 9724\n\n• *Student Loans Division:* +94 11 287 9727\n\n• *Assistant Director (Student Loans):* +94 11 287 9718\n\n• *Assistant Director (Admin):* +94 11 287 9723\n\n• *Subject Officers:* +94 70 355 5971 to +94 70 355 5979\n\n• *Fax:* +94 11 287 9719\n\n• *Whatsapp Messages Only:* +94703555974\n\n• *Email:* dsls@mohe.gov.lk / adsls@mohe.gov.lk\n\n• *Official Portal:* https://studentloans.mohe.gov.lk/loan_application/\n\n🏛️ *Main Ministry Office (Colombo 07):*\n\n• *Address:* No. 18, Ward Place, Colombo 07, Sri Lanka\n\n• *General Numbers:* +94 11 269 4486 / +94 11 269 7133 / +94 11 269 7721 / +94 11 269 1378\n\n• *Government Information Center:* 1919",
    "/eligibility": "✅ *මූලික සුදුසුකම්:*\n1️⃣ A/L වර්ෂ: 2023, 2024 හෝ 2025\n2️⃣ ප්‍රතිඵල: විෂයයන් 3ම එකවර සමත් වීම (අවම 'S' 3ක්).\n3️⃣ CGT ලකුණු: අවම 30ක්.\n4️⃣ ඉංග්‍රීසි: O/L හෝ A/L ඉංග්‍රීසි විෂයට අවම 'S' සාමාර්ථයක්.\n5️⃣ වයස: 2026 සැප්තැම්බර් 27 දිනට වයස 25 ට අඩු වීම.",
    "/loan": "💰 *ණය මුදල සහ අමතර වියදම්:*\nඋපාධිය සඳහා උපරිම රු. 1,500,000 දක්වා ණය මුදලක් ගෙවනු ලැබේ. මීට අමතරව, ඔබේ දෛනික වියදම් සඳහා (Stipend) වසරකට රු. 75,000 බැගින් (වසර 4ට ලක්ෂ 3ක්) වෙනම මුදලක් ලබාගත හැක. සම්පූර්ණ පොලිය රජය විසින් දරයි.",
    "/maxloan": "💰 *උපරිම ණය මුදල (Maximum Loan Amounts):*\n\n" +
                "🎓 *වසර 4ක උපාධි සඳහා:*\n" +
                "• මානව ශාස්ත්‍ර හා සමාජ විද්‍යා - රු. 800,000\n" +
                "• කළමනාකරණය සහ වාණිජ - රු. 900,000\n" +
                "• විද්‍යා (රසායනික/ජීව/කෘෂි) - රු. 1,200,000\n" +
                "• විද්‍යා (භෞතික) - රු. 1,000,000\n" +
                "• ඉංජිනේරු - රු. 1,500,000\n" +
                "• ජෛව / ඉංජිනේරු තාක්ෂණය - රු. 1,000,000\n" +
                "• IT (පරිගණකවේදී) - රු. 800,000\n" +
                "• IT (විද්‍යාවේදී) - රු. 1,000,000\n\n" +
                "🎓 *වසර 3ක උපාධි සඳහා:*\n" +
                "• මානව ශාස්ත්‍ර / සමාජ විද්‍යා / වාණිජ - රු. 600,000\n" +
                "• ඉංජිනේරු තාක්ෂණය - රු. 800,000\n" +
                "• IT (පරිගණකවේදී) - රු. 600,000\n" +
                "• IT (විද්‍යාවේදී) - රු. 800,000",
    "/repayment": "⏳ *ණය ආපසු ගෙවීම:*\nඋපාධිය අවසන් වී වසරක (1 year) සහන කාලයක් හිමි වේ. ඉන්පසු වසර 7කින් හෝ 8කින් සමාන වාරික වශයෙන් ණය මුදල ගෙවා නිම කළ යුතුය. (සම්පූර්ණ ණය කාලය වසර 12කි).",
    "/disqualified": "❌ *අයදුම් කළ නොහැක්කේ කාටද?*\nරජයේ කැම්පස් (UGC) සඳහා තේරී පත්වී ඇති/ලියාපදිංචි වී ඇති සිසුන්, විද්‍යාපීඨ (College of Education), HND වැනි වසර 2කට වැඩි රජයේ ඩිප්ලෝමා සඳහා තේරී ඇති සිසුන්ට අයදුම් කළ නොහැක.",
    "/guarantors": "✍️ *ඇපකරුවන්:*\nපළමු ඇපකරු ලෙස මව, පියා හෝ නීත්‍යානුකූල භාරකරු අත්සන් කළ යුතු අතර, දෙවන ඇපකරු ලෙස සමීප ඥාතියෙකු අත්සන් කළ යුතුය.",
    "/bridging": "🌉 *ඈඳුනු පාඨමාලා (Bridging Courses):*\nඔබ IT හෝ Management උපාධියක් කිරීමට අපේක්ෂා කරන්නේ නම්, නමුත් A/L සඳහා ICT හෝ අදාළ විෂයයන් හදාරා නොමැති නම්, කැම්පස් එක මගින් පවත්වන කෙටි කාලීන 'ඈඳුනු පාඨමාලාවක්' සමත් වීමෙන් පසු අදාළ උපාධිය හැදෑරිය හැක.",
    "/stipend": "💳 *ශිෂ්‍යාධාර දීමනාව (Stipend Allowance):*\n\n" +
                "ඔබගේ දෛනික වියදම් පියවා ගැනීම සඳහා වසරකට රු. 75,000/= ක අමතර පොලී රහිත ණය මුදලක් (ශිෂ්‍යාධාරයක්) ඉල්ලුම් කළ හැක.\n\n" +
                "💰 *ගෙවන ආකාරය:*\n" +
                "• මාසයකට රු. 6,250/= බැගින් ගණනය කර, ත්‍රෛමාසිකව (මාස 3කට වරක්) රු. 18,750/= ක් ලෙස ශිෂ්‍යයා වෙත ගෙවනු ලැබේ (ගෙවීමේ ක්‍රමය campus එක හා degree semester එක අනුව තීරණය වේ)\n" +
                "• වසර 4 ක උපාධියක් සඳහා උපරිම රු. 300,000/= ක් ද, වසර 3 ක උපාධියක් සඳහා රු. 225,000/= ක් ද ලබාගත හැක\n" +
                "• මුදල් ලබාගැනීමට අදාළ බැංකුවෙන් නිකුත් කරන වවුචරයක් අත්සන් කළ යුතුය.",
    "/conditions": "⚠️ *උපාධිය හදාරන කාලය තුළ අනිවාර්ය නීති රීති:*\n\n" +
                   "1️⃣ *පැමිණීම සහ ප්‍රතිඵල:* සෑම අනිවාර්ය අධ්‍යයන විෂයයක් සඳහාම අවම වශයෙන් 'C' (සම්මාන) සාමාර්ථයක් ලබාගත යුතු අතර, 80% ක පැමිණීමක් අනිවාර්ය වේ.\n" +
                   "2️⃣ *විභාග අසමත් වීම:* යම් විෂයයක් අසමත් වුවහොත්, නැවත විභාග ගාස්තු ගෙවා ඊළඟ වාරයේදී එය සමත් විය යුතුය.\n" +
                   "3️⃣ *පාඨමාලාව අතහැරීම:* පෞද්ගලික හේතුවක් මත පාඨමාලාව අතහැරියහොත්, බැංකුව ගෙවූ සම්පූර්ණ මුදල සහ පොලිය එකවර ගෙවිය යුතුය.\n" +
                   "4️⃣ *CRIB එකට දැමීම:* ණය මුදල ආපසු ගෙවීම පැහැර හරින සහ පාඨමාලාව අතහැර මුදල් නොගෙවන සිසුන්ව සහ ඇපකරුවන්ව ශ්‍රී ලංකා ණය තොරතුරු කාර්යාංශයේ (CRIB) අසාදු ලේඛනයට ඇතුළත් කරනු ලැබේ.\n" +
                   "5️⃣ *විදේශගත වීම:* උපාධියෙන් පසු විදේශගත වීමට අවශ්‍ය නම්, ලබාගත් සම්පූර්ණ ණය මුදල එකවර ගෙවා නිම කළ යුතුය.",
    "/applycenters": "📍 *අන්තර්ජාල පහසුකම් නොමැති සිසුන්ට අයදුම් කළ හැකි ස්ථාන:*\n\n" +
                     "ඔබට නිවසේ සිට අයදුම් කිරීමට අපහසු නම්, පහත මධ්‍යස්ථාන වෙත ගොස් නොමිලේ අයදුම්පත සම්පූර්ණ කළ හැක.\n" +
                     "1. ශ්‍රී ලංකා විවෘත විශ්වවිද්‍යාලයේ (OUSL) NODES සහ NACS මධ්‍යස්ථාන.\n" +
                     "2. අධ්‍යාපන අමාත්‍යාංශය යටතේ ඇති පළාත් හා කලාපීය ICT මධ්‍යස්ථාන.\n" +
                     "3. තොරතුරු හා සන්නිවේදන තාක්ෂණ නියෝජිතායතනය (ICTA) යටතේ ඇති 'නැණසල' මධ්‍යස්ථාන.",
    "/bridginginfo": "🌉 *ඈඳුනු පාඨමාලා (Bridging Courses) ගාස්තු සහ නිලධාරීන්:*\n\n" +
                     "🏛 *SLIIT:* රු. 25,000/= (චාමිනී වීරක්කොඩි - 011 754 3392)\n" +
                     "🏛 *CINEC:* රු. 75,000/= (රුවනි කරුණාදාස - 076 9442866)\n" +
                     "🏛 *HORIZON:* රු. 25,000/= (සංජීව කුරුප්පු - 071 1175175)\n" +
                     "🏛 *KIU:* රු. 25,000/= (සමිත ඉෂාර - 076 7334744)\n" +
                     "🏛 *SLTC:* රු. 20,000/= (තරිඳු නිම්සර - 070 5689968 / අසිත - 071 140 5836)\n" +
                     "🏛 *SAEGIS:* රු. 25,000/= (දෙශානු කල්න - 074 3478176)\n" +
                     "🏛 *ESOFT:* රු. 20,000/= (එන්. තොපූක්ෂාන් - 077 7825038)\n" +
                     "🏛 *ICBT:* ගාස්තු නැත (විනෝත් රවීන්ද්‍රකුමාර් - 077 3427287)\n" +
                     "🏛 *BCI:* රු. 25,000/= (අශානි පෙරේරා - 074 016 5896 / ප්‍රසාද්‍යා - 070 603 5100)\n" +
                     "🏛 *NIIBS:* රු. 25,000/= (ආචාර්ය සජීව ප්‍රේමසිංහ - 0112 904 675)\n" +
                     "🏛 *SIBA:* රු. 25,000/= (ටී.ආර්.එස්.සිරිගංගොඩ - 070 7 940 940 / සාග්‍යා - 081 24 21 693)\n" +
                     "🏛 *ICASL:* රු. 20,000/= (ඉසුරි සමරවික්‍රම - 0112 807 407)",
    "/private": "👤 *Private Candidates (පෞද්ගලික අයදුම්කරුවන්):*\nපෞද්ගලිකව උසස් පෙළ පෙනී සිටි අයදුම්කරුවන්, පාසලේ අස්වීමේ සහතිකය,'ග්‍රාම නිලධාරී සහතිකය (ප්‍රාදේශීය ලේකම් අනුමත කළ,පදිංචිය ස්ථිර කරගැනිම සදහා)' හෝ 'සාම විනිසුරුවරයෙකුගෙන් (JP) ලබාගත් චරිත සහතිකයක්' සම්මුඛ පරීක්ෂණයේදී ඉදිරිපත් කළ යුතුය.",
    "/documents": "📂 *ඉන්ටවිව් එකට රැගෙන යා යුතු ලියකියවිලි (Originals):*\n1. ජාතික හැඳුනුම්පත (NIC)\n2. උප්පැන්න සහතිකය\n3. O/L සහ A/L සහතික(Z score සහිත)\n4. Online Application එකේ Print Out එක (විදුහල්පති හෝ සාමවිනිසුරු (JP) සහතික කරන ලද)\n5.පාසලේ අස්වීමේ සහතිකය\n6.Bridging Courses Results(Bridging කරලා තියනවනම්)\n7.Course Changing Letter(Courses Change කරනවනම්)",
    "/applysteps": "📝 *අයදුම් කරන ආකාරය:*\n1. https://studentloans.mohe.gov.lk/loan_application/ වෙත පිවිසෙන්න.\n2. NIC අංකයෙන් Register වෙන්න.\n3. O/L, A/L ප්‍රතිඵල සහ පෞද්ගලික විස්තර පුරවන්න (වැඩි විස්තර සදහා guide book එකේ සදහන් ලියාපදිංචි පියවරයන් අනුගමනය කරන්න)\n4. ඔබට අවශ්‍ය කැම්පස් සහ උපාධි කැමැත්තේ අනුපිළිවෙලට (Preferences) තෝරන්න.\n5. තහවුරු කර Submit කර, Application එක Print කරගන්න.",
    "/afterapplysteps": "🎓 *අයදුම් කළ පසු ඊළඟ පියවර (After Apply Steps):*\n\n" +
                        "1️⃣ *සම්මුඛ පරීක්ෂණයට කැඳවීම:* අයදුම්පත්‍ර භාරගැනීම අවසන් වී මාසයක් පමණ ඇතුළත, සුදුසුකම් ලැබූ සිසුන්ට Online Interview එක සඳහා Email එකක් මගින් දැනුම් දෙනු ලැබේ. තේරුණු සිසුන්ගේ නාමලේඛනය studentloans.mohe.gov.lk වෙබ් අඩවියේ පළ කෙරේ.\n\n" +
                        "2️⃣ *Interview එකට සූදානම් වීම:* Online Interview එකට පෙර අවශ්‍ය ලියකියවිලි වල (Application එකේ මුද්‍රිත පිටපත, NIC, උප්පැන්න, O/L සහ A/L සහතික මුල් පිටපත්, පාසලේ අස්වීමේ සහතිකය, චරිත සහතිකය ආදී) Scan කොපි අමාත්‍යාංශයෙන් දෙන Email එකට යැවිය යුතුය.\n\n" +
                        "3️⃣ *පාඨමාලාවට තේරී පත්වීම:* Interview එකෙන් පසු තේරී පත් වූ උපාධිය සහ කැම්පස් එක වෙබ් අඩවියේ පළ කරන අතර, කැම්පස් Physical ලියාපදිංචි විය යුතු දිනයන් Email  මගින් දැනුම් දෙනු ඇත.\n\n" +
                        "4️⃣ *අභියාචනා යොමු කිරීම (Appeals):* තේරීම් ප්‍රතිඵල පැමිණිමෙන් වෙනසක් කරගැනිමට (Course/Campus මාරු කරගන්න අවශ්‍යය)නම්, ප්‍රතිඵල පැමිණ මසක් තුල වෙබ් අඩවිය හරහා (https://studentloans.mohe.gov.lk) අභියාචනයක් අයදුම් කල හැක (අභියාචනා කළ නොහැකි අය: තෝරාගත් උපාධි පිරිනමන ආයතනවල දැනටමත් ලියාපදිංචි වී සිටින අයට අභියාචනා ඉදිරිපත් කළ නොහැක.   තෝරාගැනීමේ පදනම: අභියාචනා සලකා බලන්නේ පවතින පුරප්පාඩු මත වන අතර, පුරප්පාඩු වලට වඩා අභියාචනා සංඛ්‍යාව වැඩි වුවහොත් අයදුම්කරුවන්ගේ Z-අගය (Z-scores) සැලකිල්ලට ගනී.   ප්‍රතික්ෂේප වීම් හා අවසන් තීරණය: නියමිත කාලසීමාවෙන් පසු යොමු කරන අභියාචනා භාර නොගන්නා අතර, අභියාචනා සම්බන්ධයෙන් අමාත්‍යාංශ ලේකම්වරයා ගන්නා තීරණය අවසාන තීරණය ලෙස සැලකේ.)",
    "/specialnotes": `📢🎓 *IFSLS 11th INTAKE – POST-INTERVIEW IMPORTANT NOTICE* 🎓📢

IFSLS 11th Intake සඳහා සම්මුඛ පරීක්ෂණ (Interviews) වලට සහභාගී වූ සියලුම සිසුන්ගේ අවධානයටයි.
Interviews අවසන් වීමෙන් පසු ඉදිරි පියවර පහත පරිදි මතක තබාගන්න. 👇✨

━━━━━━━━━━━━━━━━━━

📊 *01. SELECTION RESULTS (තේරීම් ප්‍රතිඵල නිකුත් වීම)*

✅ සම්මුඛ පරීක්ෂණ අවසන් වීමෙන් පසු, තේරී පත් වූ උපාධිය සහ විශ්වවිද්‍යාලය (Campus) ඇතුළත් තේරීම් ප්‍රතිඵල **2026 දෙසැම්බර් මස** නිකුත් වීමට ඉඩ ඇත.
🌐 නිල වෙබ් අඩවිය හරහා ප්‍රතිඵල පරීක්ෂා කළ හැක: https://studentloans.mohe.gov.lk
📩 තේරී පත් වූ සිසුන්ට Ministry එක මඟින් Email මඟින්ද දැනුම් දෙනු ලැබේ.

━━━━━━━━━━━━━━━━━━

🏛️ *02. CAMPUS PHYSICAL REGISTRATION (ලියාපදිංචි වීම)*

📌 ප්‍රතිඵල නිකුත් වූ පසු අදාළ Campus එකේ Physical Registration සඳහා ලබා දෙන දිනයන් Email මඟින් දැනුම් දෙනු ඇත.
📂 සියලුම මුල් ලේඛන (Original Documents) සුරක්ෂිතව ළඟ තබාගන්න.

━━━━━━━━━━━━━━━━━━

📝 *03. APPEALS (අභියාචනා ඉදිරිපත් කිරීම)*

🔄 ඔබට තේරී පත් වූ Course එක හෝ Campus එක වෙනස් කරගැනීමට අවශ්‍ය නම්, ප්‍රතිඵල නිකුත් වී **මාසයක් (1 Month) ඇතුළත** නිල වෙබ් අඩවිය හරහා Online Appeal එකක් ඉදිරිපත් කළ හැක.
⚠️ *වැදගත්:* ඔබ දැනටමත් තේරී පත් වූ Campus එකේ ලියාපදිංචි (Register) වී ඇත්නම් අභියාචනා ඉදිරිපත් කළ නොහැක.

━━━━━━━━━━━━━━━━━━

⚠️📌 *IMPORTANT REMINDER*

📩 Ministry එකෙන් ලැබෙන Emails (Inbox සහ Spam/Junk folders) නිතර පරීක්ෂා කරන්න.
📊 ප්‍රතිඵල බලාගන්නා Link එක සඳහා group එකේ */results* කියලා type කරන්න.
📌 නිල නිවේදන (Official Notices) පමණක් විශ්වාස කරන්න. ✅

━━━━━━━━━━━━━━━━━━

🎓🌟 *WISH YOU ALL THE BEST FOR YOUR SELECTION RESULTS!* 🌟🎓

🎓 *IFSLS STUDENT ADMIN COMMUNITY*`,
    "/onlinecertificate": "📜 *Online A/L & O/L Exam Certificates ගෙදරටම ගෙන්වා ගන්නා ආකාරය:*\n\n" +
                          "සහතිකය Online මඟින් අයදුම් කර ගෙදරටම ගෙන්වා ගැනීමට පහත පියවර අනුගමනය කරන්න:\n" +
                          "1️⃣ Department of Examinations නිල වෙබ් අඩවියට පිවිසෙන්න: https://doenets.lk\n" +
                          "2️⃣ එහි ඇති 'Online Certificate Application' හරහා Apply කරන්න.\n" +
                          "3️⃣ ගාස්තුව Online හෝ තැපැල් කාර්යාලය හරහා ගෙවා දින කිහිපයකින් Post එකෙන් සහතිකය ගෙදරටම ගෙන්වා ගන්න.\n\n" +
                          "🎥 *වීඩියෝ මාර්ගෝපදේශය (Video Guide):*\n" +
                          "🔗 https://www.facebook.com/share/v/1JxcGvZMoQ/",
    "/coursechange": "📝 *Course Change Letter Structure:*\n\n" +
                     "ඔබට Course එකක් හෝ Campus එකක් වෙනස් කරගැනීමට අවශ්‍ය නම් අමාත්‍යාංශයට යොමු කළ යුතු Letter එකේ Format එක මෙන්න (සිංහල letter එක edit කිරිම සදහා PC එකක් භාවිතා කරන්න සියලුම letters word document format එකෙන් ලබා දී ඇත):\n\n" +
                     "🔗 English Letter Format: https://docs.google.com/document/d/10vvIaWHQY_JpzJu80Uc0UjOT0uGaeWy1/edit?usp=sharing&ouid=113936433707512643329&rtpof=true&sd=true\n\n" +
                     "🔗 Sinhala Letter Format: https://docs.google.com/document/d/1qRNlfFBMn-ICdXM4Vsv2dISdkyYYjal3/edit?usp=sharing&ouid=113936433707512643329&rtpof=true&sd=true",
    "/affidavit": "📜 *AFFIDAVIT (දිවුරුම් ප්‍රකාශය) පිළිබඳ උපදෙස් සහ Document Link* 🏛️\n\n1️⃣ **දිවුරුම් ප්‍රකාශයක් (Affidavit) ලබා ගන්නේ කෙසේද?**\n• සාමදාන විනිශ්චයකාරවරයෙකු (JP - Justice of the Peace) හෝ දිවුරුම් කොමසාරිස්වරයෙකු (Commissioner for Oaths) ලවා සහතික කරගත යුතුය.\n• ඔබගේ නිවැරදි ජාතික හැඳුනුම්පත් (NIC) විස්තර සහ අදාළ කරුණු පැහැදිලිව ඇතුළත් කළ යුතුය.\n\n2️⃣ **අවශ්‍ය වන සාමාන්‍ය අවස්ථා:**\n• නම් වල වෙනස්කම් / අක්ෂර වින්‍යාසයේ දෝෂ (Name Correction)\n• ලිපිනයන් තහවුරු කිරීම (Address Verification)\n\n📁 *Download Affidavit Form / Sample (Google Drive):*\nhttps://drive.google.com/file/d/1MvbFANFnO8mYvgszPAJidsiVA0YEkQc4/view?usp=sharing\n\n✨ *වැඩි විස්තර සදහා Admin වරයෙක් සම්බන්ධ කරගන්න!*",
    "/ugccancel": "🚫 *UGC (රජයේ කැම්පස්) ලියාපදිංචිය අවලංගු කර පාසල් අස්වීමේ සහතිකය ලබාගැනීම:*\n\n" +
                  "ඔබ රජයේ විශ්වවිද්‍යාලයකට (UGC) තේරීපත්වී, පසුව IFSLS ණය යෝජනා ක්‍රමය යටතේ වෙනත් කැම්පස් එකකට යාමට අපේක්ෂා කරන්නේ නම්, UGC ලියාපදිංචිය නිල වශයෙන් අවලංගු කර (Cancel කර) පාසල් අස්වීමේ සහතිකය (School Leaving Certificate) ලබාගත යුතුය.\n\n" +
                  "📁 *අදාළ Official Document Form එක මෙතනින් ඩවුන්ලෝඩ් කරගන්න:*\n" +
                  "🔗 https://drive.google.com/file/d/113EmLqJJeRiPHdwp4XNJKZhlBIxsb1uR/view?usp=sharing",
    "/laptopguide": "💻 *Undergraduate Laptop Buying Guide 2026*\n\n" +
                    "හැමෝම මේ දවස් වල campus apply කරන ගමන් නේ. ඉතින් ගොඩක් අයට එන ප්‍රශ්නයක් තමා කොහොමද අපි අපේ ඉස්සරහට degree එකට ගැලපෙන laptop model එකක් එහෙම නැත්නම් PC එකක් select කරගන්නේ කියල. \n\n" +
                    "ඉතින් undergraduate level එකේ ඉන්න ඔයාලට ඉස්සරහටම කියන්න ඕන studio එකක් කරන ගානට යන performance ඕන devices මේ කාලෙට අවශ්‍ය නැ කියන එක. මොකද ඔයාලා invest කරල buy කරන්නෙ නෑ නේද තාම? හැමෝම තියනවා නේ ආර්ථික පැත්තෙන් අඩුපාඩුකම්. ඉතින් normally day to day campus වැඩ ටික කරගන්න model එකක් select කරගන්න විදිහ අපි බලමු. මමත් undergraduate level එකේ ඉන්න නිසා මගේ personal experience එක, knowledge එක මම share කරගන්නවා ඔයාලත් එක්ක 😊💗\n\n" +
                    "📌 *Question 01*\n" +
                    "මම යන්න ඕන Brand new ද used condition laptop එකකටද?\n\n" +
                    "✅ *Answer:*\n" +
                    "ඒක සම්පූර්ණයෙන්ම තීරණය වෙන්නේ ඔයාගේ budget එක මත. හිතන්න ඔයාගේ අතේ මේ වෙලාවේ තියෙන්නේ රුපියල් 80,000ක් වගේ. ඉතින් එතනින් එහාට ඔයාට සල්ලි නැහැ. හැමෝම දන්නවා 80කට brand new එකකට යන්න අමාරුයි කියලා. ඉතින් 80ට ගැලපෙන හොඳම conditions තියෙන used model එකකට ඔයාට යන්න වෙනවා.\n\n" +
                    "📌 *Question 02*\n" +
                    "Used model එකක් purchase කරනකොට බලන්න ඕන දේවල් මොනවද?\n\n" +
                    "✅ *Answer:*\n" +
                    "මේක හොඳ ප්‍රශ්නයක්! ඉහේ කෙස් ගානට laptop sell කරන shops තියෙනවා දැන් ලංකාවේ. ඒ අස්සේ බාල කුණු ගොඩවල් විකුණන shops තියෙනවා customer ගොනාට විකුණලා. ඉතින් ඔයාලා purchase කරන second hand device එක ගන්න කලින් එතනින් අහලා දැනගන්න ඒ device එක Refurbished laptop එකක් ද කියලා. කොයි වෙලාවකවත් refurbished model එකකට යන්න එපා! මොකද hardware parts ගොඩක් දුරට original parts නෙවේ. ඉතින් ඔයාලා long term 4 Year + use කරන්න බලාපොරොත්තු වෙන නිසා 'A+ Grade' කියල models තියෙනවා, ඒ model එකකට යන්න.\n\n" +
                    "📌 *Question 03*\n" +
                    "හරි A+ grade එකක් තෝරගත්තා, කොහොමද අපි ඒක check කරගන්නේ හරියට shop එකේදි?\n\n" +
                    "✅ *Answer:*\n" +
                    "ඔයා කලින් Model එක select කරගෙන යනවනං shop එකෙන් ඒ model එක ඔයාට පෙන්නයි. මේ වැඩේට පැයක් 2ක් වගේ යයි. මතක ඇතුව ඔයා යනකොට pen එකකට හොඳ high quality video clip එකක් download කරගෙන දාලා අරගෙන යන්න.\n\n" +
                    "1️⃣ **Physical Condition:** laptop එක අතට දුන්නහම physical conditions check කරන්න. කොන් තැලිලා සිරිලා තියෙනවනම් purchase කරන්න එපා 👋\n" +
                    "2️⃣ **Ports Check:** pen drive එක USB ports වලට plug කර බලන්න. issue එකක් නැතුව pen එක වැඩනම් USB OK ✅ අනිත් ports ටිකත් check කරගන්න.\n" +
                    "3️⃣ **Display, Sound & Battery:** pen drive එකේ video එක play කරන්න. brightness full වැඩි කරලා, charge එකේ තියෙනවනං unplug කරන්න. speakers volume එක 75%ක් දාලා sounds check කරන්න. display එකේ burn marks එහෙම තියෙනවද බලාගන්න. විනාඩි 10ක් විතර video එක play කරන්න.\n" +
                    "4️⃣ **WiFi Connection:** shop එකෙන් wifi connect කරලා connections stable ද බලන්න.\n\n" +
                    "📌 *Question 04*\n" +
                    "Warranty Period එක කොහොමද Decide කරන්නෙ?\n\n" +
                    "✅ *Answer:*\n" +
                    "Usually warranty period එක used වලට මාස 3 - 6ක් ලැබෙනවා. සති ගණන් වල Checking warranty විතරක් කියන තැන් වලින් laptop ගන්න එපා ❌\n\n" +
                    "📌 *Question 05*\n" +
                    "ඔය ඔක්කොම හරි කියමු, performance කොහොමද select කරගන්න ඕන?\n\n" +
                    "✅ *Answer:*\n" +
                    "දැන් තමා හොඳම ප්‍රශ්නේ! Degree එක එක්ක බලමු අඩුම තියෙන්න ඕන specs ටික:\n\n" +
                    "📝 **IT Degree එකකට (Minimum Specs):**\n" +
                    "• **CPU:** Core i5 8th gen UP (eg: 8600U / 8300H - H නම් high performance, U නම් battery life එකට හොඳයි)\n" +
                    "• **RAM:** 16GB Must or Upper\n" +
                    "• **Storage:** 512GB - 2TB SSD (M.2 හෝ NVMe support වෙන්න ඕන)\n" +
                    "• **OS:** Windows 11 64-bit\n" +
                    "• **GRAPHIC CARD:** INTEL UHD ඇති සාමාන්‍ය IT Degree එකකටනම් Multimedia වගේ Special Degree එකක්නම් Minimum RTX 2050 වගේ card එකකට යන්න (Equal to GTX 1060) \n\n" +
                    "📝 **Engineering / Management / Art (IT නොවන ඕනම Degree එකකට):**\n" +
                    "• **CPU:** Core i5 8th gen UP\n" +
                    "• **RAM:** 8GB\n" +
                    "• **Storage:** 256GB - 1TB SSD (M.2 NVMe)\n\n" +
                    "📌 *Question 06*\n" +
                    "මට brand new laptop එකකට යන්න ඕන, budget එක 2Lakh වගේ තියෙනවා. මම මොකද කරන්නේ?\n\n" +
                    "✅ *Answer:*\n" +
                    "ප්‍රශ්නයක් නැහැ! ඔයා මොන degree එක කරත් brand new ඒ ගානට යනවනං minimum i5 12th gen / 13th gen වගේ performance තියෙන laptop එකකට යන්න 😊👋\n\n" +
                    "📌 *Question 07*\n" +
                    "ඔය ඔක්කොම කිව්වේ intel වලටනෙ, AMD Ryzen යනවනං කොහොමද?\n\n" +
                    "✅ *Answer:*\n" +
                    "Ryzen වගේ යනවනං Ryzen 5 5000 series එකක් වගේ බලන්න minimum brand new ගන්නකොට.\n\n" +
                    "📌 *Question 08*\n" +
                    "එතකොට MacBook එකකට යන්න එපාද?\n\n" +
                    "✅ *Answer:*\n" +
                    "සල්ලි තියෙනවනම් අවුලක් නැහැ 😂 යන්න අනේ! හැබැයි issues තියෙනවා. ඔයා IT කරන කෙනෙක් නම් ගොඩක් virtual machines වගේ run කරන්න වෙනවා. එතකොට පොඩි පොඩි issues එනවා, dual booting කරන්න අමාරුයි. තව ගොඩක් අය crack software use කරන්නේ (ලංකාවේ කවුද genuine software පාවිච්චි කරන්නේ 😂🤭). Apple වල security එකත් එක්ක crack software වල ප්‍රශ්න ඇති වෙනවා ☹️. හොඳම දේ undergraduate වශයෙන් risk එකක් නොගෙන Windows වලට යන්න 😊✅\n\n" +
                    "📌 *Question 09*\n" +
                    "අපිට used and brand new යනවනං හොඳ laptop models මොනවද?\n\n" +
                    "✅ *Answer:*\n" +
                    "Brand එක මත depend වෙන්න එපා කොයි වෙලාවකවත්. හැම brand එකකම මොක්ක හරි issue එකක් තියෙනවා.\n\n" +
                    "🔴 **Recommended Used Models :**\n" +
                    "• Dell Vostro / Latitude\n" +
                    "• Acer Aspire\n" +
                    "• HP EliteBook\n" +
                    "• Lenovo ThinkPad T Series & Yoga Series \n\n" +
                    "🔴 **Brand New Budget Friendly:**\n" +
                    "• Asus ExpertBook / VivoBook\n" +
                    "• HP Pavilion / Notebooks\n" +
                    "• Acer Aspire 5 or upper\n" +
                    "• Lenovo ThinkBook / IdeaPad\n\n" +
                    "🔴 **Gaming Series:**\n" +
                    "• HP Victus\n" +
                    "• Asus TUF\n" +
                    "• MSI Cyber\n" +
                    "• Lenovo Legion\n" +
                    "• Lenovo LOQ",
    "/boarding": "🏠 *Boarding Places & Accommodation (නවාතැන් පහසුකම් හොයාගන්නා හැටි):*\n\n" +
                 "ඔබගේ කැම්පස් එක අසලින් බෝඩිමක් / ඇනෙක්ස් එකක් හොයාගැනීමට පහත වෙබ් අඩවි සහ Video භාවිතා කරන්න:\n\n" +
                 "🎥 *බෝඩිම් සෙවීමේ උපදෙස් වීඩියෝව (Video Guide):*\n" +
                 "🔗 https://www.facebook.com/share/v/18ZG8KkSgf/\n\n" +
                 "🌐 *හොඳම Boarding Web Platforms:*\n" +
                 "• *Ikman.lk (Property Section):* https://lk.ikman.lk/en/ads/property/rooms-annexes\n" +
                 "• *Lankapropertyweb:* https://www.lankapropertyweb.com",
    "/jobs": "💼 *Internships & Job Opportunities (අධ්‍යාපනය අතරතුර රැකියා තොරතුරු):*\n\n" +
             "Degree එක කරන අතරතුර හෝ අවසානයේ Internships / Jobs හොයාගන්න පුළුවන් Groups පහතින් ලබාගත හැක:\n\n" +
             "🌐 *Top Job Portals:*\n" +
             "• LinkedIn (https://linkedin.com)\n" +
             "• TopJobs (https://topjobs.lk)\n" +
             "• Ikman Jobs (https://ikman.lk/jobs)\n\n" +
             "👥 *Community Groups:*\n" +
             "• *Jobs & Internships Group 01:* https://whatsapp.com/channel/0029Vb615LUHVvTdCZmE4B1A\n" +
             "• *Jobs & Internships Group 02:* https://whatsapp.com/channel/0029Va9Xpxx8PgsOtsAbFn45\n\n" +
             "💡 *Tip:* CV එකක් නිවැරදිව හදාගෙන LinkedIn Profile එක Update තබාගැනීමෙන් පහසුවෙන් Opportunities ලබාගත හැක.",
    "/results": "📊 *IFSLS Selection Results & Portal:*\n\n" +
                "ශිෂ්‍ය ණය (IFSLS) තේරීම් ප්‍රතිඵල (Selection Results) සහ ඔබගේ අයදුම්පතේ තත්ත්වය (Application / Appeal Status) පරීක්ෂා කිරීමට පහත නිල වෙබ් අඩවියට පිවිසෙන්න:\n\n" +
                "🌐 *Official IFSLS Portal:* https://studentloans.mohe.gov.lk/loan_application/\n" +
                "🌐 *Main Website:* https://studentloans.mohe.gov.lk\n\n" +
                "💡 *සටහන:* ප්‍රතිඵල නිකුත් වූ පසු ඔබගේ NIC / Login විස්තර මගින් Portal එකට log වී results පරීක්ෂා කරන්න. Intake 11 තේරීම් ප්‍රතිඵල (Selection Results) 2026 දෙසැම්බර් මස බලාපොරොත්තු විය හැක."
};

const campusAnswers = {
    "/sliit": "🎓 *SLIIT Campus*\n\n" +
              "📘 *Faculty of Humanities & Sciences*\n" +
              "• Bachelor of Education Honours in Social Sciences\n" +
              "  ✔️ *උ/පෙළ:* වාණිජ හෝ කලා අංශයෙන් එකවර 'S' 3ක්.\n" +
              "  ✔️ *සා/පෙළ:* සිංහල/දෙමළ, ගණිතය සහ ඉංග්‍රීසි සඳහා අවම 'S' 3ක්.\n\n" +
              "• Bachelor of Education Honours in Physical Sciences\n" +
              "  ✔️ *උ/පෙළ:* සංයුක්ත/උසස් ගණිතය, රසායන විද්‍යාව, භෞතික විද්‍යාව, ICT, සහ ගණිතය අතරින් 'S' 3ක්.\n" +
              "  ✔️ *සා/පෙළ:* සිංහල/දෙමළ, ගණිතය සහ ඉංග්‍රීසි සඳහා අවම 'S' 3ක්.\n\n" +
              "• Bachelor of Arts Honours in English\n" +
              "  ✔️ *උ/පෙළ:* ඕනෑම අංශයකින් 'S' 3ක් (ඉංග්‍රීසි ප්‍රධාන විෂය විය යුතුයි) *හෝ* ඉංග්‍රීසි මාධ්‍යයෙන් හැදෑරූ ඕනෑම අංශයකින් 'S' 3ක්.\n\n" +
              "📊 *Faculty of Business*\n" +
              "• Bachelor of Business Administration Honours\n" +
              "  ✔️ *උ/පෙළ:* වාණිජ අංශයෙන් 'S' 3ක් *හෝ* ආර්ථික විද්‍යාව ඇතුළුව ඕනෑම අංශයකින් 'S' 3ක්.\n" +
              "  ✔️ *සා/පෙළ:* ගණිතය සඳහා අවම 'S' සාමාර්ථයක්.\n" +
              "  *(සටහන: ඕනෑම අංශයකින් 'S' 3ක් ඇති අය ඈඳුනු පාඨමාලාවක් (Bridging Course) සමත් විය යුතුය).*\n\n" +
              "⚙️ *Faculty of Engineering*\n" +
              "• BSc Honours in Financial Mathematics and Applied Statistics\n" +
              "  ✔️ *උ/පෙළ:* සංයුක්ත ගණිතය සමඟ වෙනත් විෂයයන් දෙකක් සඳහා 'S' 3ක්.\n\n" +
              "• BSc Engineering Honours (Electrical & Electronic / Mechanical / Civil / Materials)\n" +
              "  ✔️ *උ/පෙළ:* භෞතික විද්‍යා අංශයෙන් (සංයුක්ත ගණිතය, භෞතික විද්‍යාව, රසායන විද්‍යාව) අවම 'C' 2ක් සහ 'S' 1ක්.\n\n" +
              "💻 *Faculty of Computing*\n" +
              "• BSc in Information Technology\n" +
              "• BSc Honours in Software Engineering\n" +
              "  ✔️ *උ/පෙළ:* භෞතික විද්‍යා හෝ ඉංජිනේරු තාක්ෂණ අංශයෙන් 'S' 3ක්.\n" +
              "  *(සටහන: ඕනෑම අංශයකින් 'S' 3ක් ඇති අය සා/පෙළ ගණිතය 'C' සාමාර්ථයක් ලබා තිබිය යුතු අතර, ඈඳුනු පාඨමාලාවක් (Bridging Course) සමත් විය යුතුය).* ",
    "/nsbm": "🎓 *NSBM Green University*\n\n" +
             "📘 *Faculty of Humanities & Social Sciences*\n" +
             "• Bachelor of Laws (Honours) - LLB\n" +
             "  ✔️ *උ/පෙළ:* ඕනෑම අංශයකින් එකවර 'C' 3ක් සහ ඉංග්‍රීසි සඳහා අවම 'S' 1ක්.\n" +
             "  ✔️ *සා/පෙළ:* ඉංග්‍රීසි සහ මව් භාෂාව සඳහා සම්මාන ඇතුළුව 'C' 3ක් සහ ගණිතය ඇතුළුව සාමාර්ථ 6ක්.\n\n" +
             "📊 *Faculty of Business*\n" +
             "• BSc in Business Management (Project Management) (Special)\n" +
             "  ✔️ *උ/පෙළ:* වාණිජ අංශයෙන් 'S' 3ක් *හෝ* ආර්ථික විද්‍යාව ඇතුළුව ඕනෑම අංශයකින් 'S' 3ක්.\n" +
             "  ✔️ *සා/පෙළ:* ඉංග්‍රීසි 'C' සහ ගණිතය 'S' සාමාර්ථයක්.\n" +
             "  *(සටහන: ඕනෑම අංශයකින් 'S' 3ක් ඇති අය ඈඳුනු පාඨමාලාවක් සමත් විය යුතුය).*\n\n" +
             "⚙️ *Faculty of Engineering & Science*\n" +
             "• Bachelor of Interior Design\n" +
             "  ✔️ *උ/පෙළ:* ඕනෑම අංශයකින් එකවර 'S' 3ක් සහ ඉංග්‍රීසි සඳහා 'S' 1ක්.\n" +
             "  ✔️ *සා/පෙළ:* ඉංග්‍රීසි 'C' සහ ගණිතය 'C' සාමාර්ථයක්.\n\n" +
             "💻 *Faculty of Computing*\n" +
             "• BSc Honours in Computer Networks\n" +
             "  ✔️ *උ/පෙළ:* භෞතික විද්‍යා හෝ ඉංජිනේරු තාක්ෂණ අංශයෙන් 'S' 3ක් සහ ඉංග්‍රීසි සඳහා 'S' 1ක්.\n" +
             "  ✔️ *සා/පෙළ:* ඉංග්‍රීසි 'C' සාමාර්ථයක්.\n" +
             "  *(සටහන: ඕනෑම අංශයකින් 'S' 3ක් ඇති අය සා/පෙළ ගණිතය 'C' සාමාර්ථයක් ලබා තිබිය යුතු අතර, ඈඳුනු පාඨමාලාවක් (Bridging Course) සමත් විය යුතුය).*\n\n" +
             "• BSc in Multimedia\n" +
             "  ✔️ *උ/පෙළ:* ඕනෑම අංශයකින් 'S' 3ක් සහ ඉංග්‍රීසි සඳහා 'S' 1ක්.\n" +
             "  ✔️ *සා/පෙළ:* ඉංග්‍රීසි 'C' සහ ගණිතය 'C' සාමාර්ථයක්.",
    "/cinec": "🎓 *CINEC Campus*\n\n" +
              "📘 *Faculty of Humanities & Education*\n" +
              "• Bachelor of Education Honours in Information Technology / Early Childhood Education / Physical Education & Sports\n" +
              "  ✔️ *උ/පෙළ:* ඕනෑම අංශයකින් එකවර 'S' 3ක්.\n" +
              "  ✔️ *සා/පෙළ:* සිංහල/දෙමළ, ගණිතය සහ ඉංග්‍රීසි ඇතුළුව අවම 'S' 3ක්.\n\n" +
              "• Bachelor of Arts Honours in English / BA in English\n" +
              "  ✔️ *උ/පෙළ:* ඕනෑම අංශයකින් 'S' 3ක් (ගෞරව උපාධිය සඳහා ඉංග්‍රීසි ප්‍රධාන විෂය විය යුතුයි).\n" +
              "  ✔️ *සා/පෙළ:* BA in English සඳහා ඉංග්‍රීසි 'C' සාමාර්ථයක්.\n\n" +
              "📊 *Faculty of Management & Social Sciences*\n" +
              "• Bachelor of Management Honours (Supply Chain / Business Administration / HRM / Banking & Finance / Accounting / Marketing)\n" +
              "  ✔️ *උ/පෙළ:* වාණිජ අංශයෙන් 'S' 3ක් *හෝ* ආර්ථික විද්‍යාව ඇතුළුව ඕනෑම අංශයකින් 'S' 3ක්.\n" +
              "  ✔️ *සා/පෙළ:* ගණිතය 'S' සාමාර්ථයක්. (Accounting & Banking සඳහා සා/පෙළ ගණිතය සහ ව්‍යාපාර අධ්‍යනය 'C' සාමාර්ථ අවශ්‍යයි).\n\n" +
              "🔬 *Faculty of Health Science / Science*\n" +
              "• BSc Honours in Cosmetic Sciences / Industrial Pharmaceutical Science\n" +
              "  ✔️ *උ/පෙළ:* රසායන විද්‍යාව හෝ විද්‍යාව සඳහා තාක්ෂණය සමඟ (ජීව විද්‍යාව, භෞතික විද්‍යාව ආදී) වෙනත් විෂයයන් දෙකක් සඳහා 'S' 3ක්.\n\n" +
              "• BSc Honours in Medical & Health Product Management\n" +
              "  ✔️ *උ/පෙළ:* ජීව විද්‍යා, භෞතික විද්‍යා හෝ තාක්ෂණ අංශයෙන් 'S' 3ක්.\n\n" +
              "• BSc Honours in Chemistry\n" +
              "  ✔️ *උ/පෙළ:* ජීව විද්‍යා හෝ භෞතික විද්‍යා අංශයෙන් 'S' 3ක්.\n\n" +
              "• BSc Honours in Biomedical Sciences\n" +
              "  ✔️ *උ/පෙළ:* ජීව විද්‍යාව, රසායන විද්‍යාව සහ භෞතික විද්‍යාව/කෘෂිකර්මය සඳහා 'C' 3ක්.\n\n" +
              "⚙️ *Faculty of Engineering Technology*\n" +
              "• BSc Engineering Honours (Automotive / Civil / Electronics & Telecommunication / Mechanical / Mechatronics)\n" +
              "  ✔️ *උ/පෙළ:* භෞතික විද්‍යා අංශයෙන් (සංයුක්ත ගණිතය, භෞතික විද්‍යාව, රසායන විද්‍යාව) අවම 'C' 2ක් සහ 'S' 1ක්.\n\n" +
              "💻 *Faculty of Computing*\n" +
              "• BSc Honours in Software Engineering / Computer Science (Network Security & Forensics)\n" +
              "  ✔️ *උ/පෙළ:* භෞතික විද්‍යා හෝ ඉංජිනේරු තාක්ෂණ අංශයෙන් 'S' 3ක්.\n" +
              "  *(සටහන: ඕනෑම අංශයකින් 'S' 3ක් ඇති අය සා/පෙළ ගණිතය 'C' සාමාර්ථයක් ලබා තිබිය යුතු අතර, ඈඳුනු පාඨමාලාවක් (Bridging Course) සමත් විය යුතුය).*",
    "/kiu": "🎓 *KIU Campus*\n\n" +
            "📘 *Faculty of Humanities & Social Sciences*\n" +
            "• BSc Honours in Psychology\n" +
            "  ✔️ *උ/පෙළ:* ඕනෑම අංශයකින් 'S' 3ක්.\n" +
            "  ✔️ *සා/පෙළ:* ඉංග්‍රීසි සඳහා අවම 'S' සාමාර්ථයක්.\n\n" +
            "• Bachelor of Laws (Honours) - LLB\n" +
            "  ✔️ *උ/පෙළ:* ඕනෑම අංශයකින් 'C' 2ක් සහ 'S' 1ක්.\n" +
            "  ✔️ *සා/පෙළ:* මව් භාෂාව සහ ඉංග්‍රීසි සඳහා 'C' සාමාර්ථයක්.\n\n" +
            "📊 *Faculty of Management*\n" +
            "• Bachelor of Management Honours (HR / Marketing / Business Analytics / Accounting)\n" +
            "  ✔️ *උ/පෙළ:* වාණිජ අංශයෙන් 'S' 3ක් *හෝ* ආර්ථික විද්‍යාව ඇතුළුව ඕනෑම අංශයකින් 'S' 3ක්.\n" +
            "  ✔️ *සා/පෙළ:* ගණිතය සඳහා 'S' සාමාර්ථයක් (Accounting සඳහා සා/පෙළ ගණිතය සහ ව්‍යාපාර අධ්‍යනය 'C' අවශ්‍යයි).\n\n" +
            "🔬 *Faculty of Health Sciences*\n" +
            "• BSc Honours in Biomedical Science / Acupuncture\n" +
            "  ✔️ *උ/පෙළ:* ජීව විද්‍යාව, රසායන විද්‍යාව සහ භෞතික විද්‍යාව/කෘෂිකර්මය සඳහා 'S' 3ක්.\n\n" +
            "💻 *Faculty of Computing*\n" +
            "• BSc Honours in Management Information Systems / Software Engineering / Computer Networks & Cyber Security / Data Science\n" +
            "  ✔️ *උ/පෙළ:* භෞතික විද්‍යා හෝ ඉංජිනේරු තාක්ෂණ අංශයෙන් 'S' 3ක්.\n" +
            "  *(සටහන: ඕනෑම අංශයකින් 'S' 3ක් ඇති අය සා/පෙළ ගණිතය 'C' සාමාර්ථයක් ලබා තිබිය යුතු අතර, ඈඳුනු පාඨමාලාවක් (Bridging Course) සමත් විය යුතුය).*",
    "/horizon": "🎓 *HORIZON Campus*\n\n" +
                "📘 *Faculty of Education*\n" +
                "• Bachelor of Education Honours in Biological Sciences / Information Technology\n" +
                "  ✔️ *උ/පෙළ:* ජීව විද්‍යාව, රසායන විද්‍යාව, භෞතික විද්‍යාව, කෘෂිකර්මය අතරින් 'S' 3ක්.\n" +
                "  ✔️ *සා/පෙළ:* සිංහල/දෙමළ, ගණිතය සහ ඉංග්‍රීසි සඳහා අවම 'S' 3ක්.\n\n" +
                "📊 *Faculty of Management*\n" +
                "• Bachelor of Management (Honours) / BSc in Management (HRM)\n" +
                "  ✔️ *උ/පෙළ:* වාණිජ අංශයෙන් 'S' 3ක් *හෝ* ආර්ථික විද්‍යාව ඇතුළුව ඕනෑම අංශයකින් 'S' 3ක්.\n" +
                "  ✔️ *සා/පෙළ:* ගණිතය සඳහා අවම 'S' සාමාර්ථයක්.\n\n" +
                "⚙️ *Faculty of Science / Technology*\n" +
                "• BSc Honours in Biotechnology / Bachelor of Biosystems Technology Honours\n" +
                "  ✔️ *උ/පෙළ:* ජීව විද්‍යා හෝ ජෛව පද්ධති තාක්ෂණ අංශයෙන් 'S' 3ක්.\n\n" +
                "💻 *Faculty of Information Technology*\n" +
                "• BSc Honours in Information Technology / Data Science / IT (Networking)\n" +
                "  ✔️ *උ/පෙළ:* භෞතික විද්‍යා හෝ ඉංජිනේරු තාක්ෂණ අංශයෙන් 'S' 3ක්.\n" +
                "  *(සටහන: ඕනෑම අංශයකින් 'S' 3ක් ඇති අය සා/පෙළ ගණිතය 'C' සාමාර්ථයක් ලබා තිබිය යුතු අතර, ඈඳුනු පාඨමාලාවක් (Bridging Course) සමත් විය යුතුය).*",
    "/sltc": "🎓 *SLTC (Sri Lanka Technological Campus)*\n\n" +
             "📊 *Faculty of Business & Management*\n" +
             "• Bachelor of Business Management Honours (Supply Chain / Operations / Marketing / Accounting) / BSc in Tourism & Hospitality\n" +
             "  ✔️ *උ/පෙළ:* වාණිජ අංශයෙන් 'S' 3ක් *හෝ* ආර්ථික විද්‍යාව ඇතුළුව ඕනෑම අංශයකින් 'S' 3ක්.\n" +
             "  ✔️ *සා/පෙළ:* ගණිතය සඳහා අවම 'S' සාමාර්ථයක්.\n\n" +
             "⚙️ *Faculty of Engineering*\n" +
             "• BSc Engineering Honours (Electronics & Telecom / Electrical Power / ICT / Civil)\n" +
             "  ✔️ *උ/පෙළ:* භෞතික විද්‍යා අංශයෙන් (සංයුක්ත ගණිතය, භෞතික විද්‍යාව, රසායන විද්‍යාව) අවම 'C' 2ක් සහ 'S' 1ක්.\n\n" +
             "• Bachelor of Technology Honours (Electronics / Agricultural Tech) / BSc Honours in Biosystems Engineering\n" +
             "  ✔️ *උ/පෙළ:* භෞතික, ජීව විද්‍යා හෝ තාක්ෂණ අංශයෙන් 'S' 3ක්.\n\n" +
             "💻 *Faculty of Computing*\n" +
             "• BSc Honours in Data Science / Software Engineering / Cyber Security / Cloud Computing\n" +
             "  ✔️ *උ/පෙළ:* භෞතික විද්‍යා හෝ ඉංජිනේරු තාක්ෂණ අංශයෙන් 'S' 3ක්.\n" +
             "  *(සටහන: ඕනෑම අංශයකින් 'S' 3ක් ඇති අය සා/පෙළ ගණිතය 'C' සාමාර්ථයක් ලබා තිබිය යුතු අතර, ඈඳුනු පාඨමාලාවක් (Bridging Course) සමත් විය යුතුය).*",
    "/saegis": "🎓 *SAEGIS Campus*\n\n" +
               "📘 *Faculty of Humanities & Social Sciences*\n" +
               "• Bachelor of Arts in English\n" +
               "  ✔️ *උ/පෙළ:* ඕනෑම අංශයකින් එකවර 'S' 3ක්.\n\n" +
               "📊 *Faculty of Business*\n" +
               "• Bachelor of Business Administration / BBM Honours (Marketing / HRM / Tourism / Logistics)\n" +
               "  ✔️ *උ/පෙළ:* වාණිජ අංශයෙන් 'S' 3ක් *හෝ* ආර්ථික විද්‍යාව ඇතුළුව ඕනෑම අංශයකින් 'S' 3ක්.\n" +
               "  ✔️ *සා/පෙළ:* ගණිතය සඳහා අවම 'S' සාමාර්ථයක්.\n\n" +
               "💻 *Faculty of Computing*\n" +
               "• BSc in Information Technology / BSc Honours in IT / Software Engineering / Computer Science\n" +
               "  ✔️ *උ/පෙළ:* භෞතික විද්‍යා හෝ ඉංජිනේරු තාක්ෂණ අංශයෙන් 'S' 3ක්.\n" +
               "  *(සටහන: ඕනෑම අංශයකින් 'S' 3ක් ඇති අය සා/පෙළ ගණිතය 'C' සාමාර්ථයක් ලබා තිබිය යුතු අතර, ඈඳුනු පාඨමාලාවක් (Bridging Course) සමත් විය යුතුය).*",
    "/icbt": "🎓 *ICBT Campus*\n\n" +
             "📊 *Faculty of Business*\n" +
             "• Bachelor of Business Management Honours\n" +
             "  ✔️ *උ/පෙළ:* වාණිජ අංශයෙන් 'S' 3ක් *හෝ* ආර්ථික විද්‍යාව ඇතුළුව ඕනෑම අංශයකින් 'S' 3ක්.\n" +
             "  ✔️ *සා/පෙළ:* ගණිතය සඳහා අවම 'S' සාමාර්ථයක්.\n\n" +
             "💻 *Faculty of Computing*\n" +
             "• BSc Honours in Software Engineering / IT (Cyber Security / Data Science / AI)\n" +
             "  ✔️ *උ/පෙළ:* භෞතික විද්‍යා හෝ ඉංජිනේරු තාක්ෂණ අංශයෙන් 'S' 3ක්.\n" +
             "  *(සටහන: ඕනෑම අංශයකින් 'S' 3ක් ඇති අය සා/පෙළ ගණිතය 'C' සාමාර්ථයක් ලබා තිබිය යුතු අතර, ඈඳුනු පාඨමාලාවක් (Bridging Course) සමත් විය යුතුය).*",
    "/bci": "🎓 *BCI Campus*\n\n" +
            "📘 *Faculty of Humanities & Social Sciences*\n" +
            "• Bachelor of Education Honours (Primary Education / Early Childhood)\n" +
            "  ✔️ *උ/පෙළ:* ඕනෑම අංශයකින් 'S' 3ක්.\n" +
            "  ✔️ *සා/පෙළ:* සිංහල/දෙමළ සහ ගණිතය සඳහා 'S' ද, ඉංග්‍රීසි සඳහා 'C' සාමාර්ථයක්ද ලබා තිබීම.\n\n" +
            "• BSc Honours in Counseling Psychology\n" +
            "  ✔️ *උ/පෙළ:* ඕනෑම අංශයකින් 'S' 3ක් සහ ඉංග්‍රීසි සඳහා 'S' 1ක්.\n\n" +
            "📊 *Faculty of Business*\n" +
            "• Bachelor of Business Management Honours\n" +
            "  ✔️ *උ/පෙළ:* වාණිජ අංශයෙන් 'S' 3ක් *හෝ* ආර්ථික විද්‍යාව ඇතුළුව ඕනෑම අංශයකින් 'S' 3ක්.\n" +
            "  ✔️ *සා/පෙළ:* ගණිතය සඳහා අවම 'S' සාමාර්ථයක්.\n\n" +
            "💻 *Faculty of Computing*\n" +
            "• BSc Honours in Information Technology / Software Engineering\n" +
            "  ✔️ *උ/පෙළ:* භෞතික විද්‍යා හෝ ඉංජිනේරු තාක්ෂණ අංශයෙන් 'S' 3ක්.\n" +
            "  *(සටහන: ඕනෑම අංශයකින් 'S' 3ක් ඇති අය සා/පෙළ ගණිතය 'C' සාමාර්ථයක් ලබා තිබිය යුතු අතර, ඈඳුනු පාඨමාලාවක් (Bridging Course) සමත් විය යුතුය).*",
    "/icasl": "🎓 *ICASL Campus*\n\n" +
              "📊 *Faculty of Business*\n" +
              "• BSc in Applied Accounting (Special / General)\n" +
              "  ✔️ *උ/පෙළ:* ගිණුම්කරණය ඇතුළුව වාණිජ අංශයෙන් 'S' 3ක් *හෝ* ඕනෑම අංශයකින් 'S' 3ක්.\n" +
              "  ✔️ *සා/පෙළ:* ගණිතය සහ ව්‍යාපාර අධ්‍යනය හා ගිණුම්කරණය සඳහා 'C' සාමාර්ථයක්.\n\n" +
              "• BBM Honours in Business Analytics\n" +
              "  ✔️ *උ/පෙළ:* වාණිජ අංශයෙන් 'S' 3ක් *හෝ* ආර්ථික විද්‍යාව ඇතුළුව ඕනෑම අංශයකින් 'S' 3ක්.\n" +
              "  ✔️ *සා/පෙළ:* ගණිතය සඳහා අවම 'S' සාමාර්ථයක්.",
    "/esoft": "🎓 *ESOFT Metro Campus*\n\n" +
              "📊 *Faculty of Business*\n" +
              "• Bachelor of Business Management Honours\n" +
              "  ✔️ *උ/පෙළ:* වාණිජ අංශයෙන් 'S' 3ක් *හෝ* ආර්ථික විද්‍යාව ඇතුළුව ඕනෑම අංශයකින් 'S' 3ක්.\n" +
              "  ✔️ *සා/පෙළ:* ගණිතය සඳහා අවම 'S' සාමාර්ථයක්.\n\n" +
              "💻 *Faculty of Computing*\n" +
              "• BSc Honours in Information Technology\n" +
              "  ✔️ *උ/පෙළ:* ඕනෑම අංශයකින් එකවර 'S' 3ක් ලබා තිබීම.",
    "/siba": "🎓 *SIBA Campus*\n\n" +
             "📊 *Faculty of Business*\n" +
             "• Bachelor of Business Management Honours\n" +
             "  ✔️ *උ/පෙළ:* වාණිජ අංශයෙන් 'S' 3ක් *හෝ* ආර්ථික විද්‍යාව ඇතුළුව ඕනෑම අංශයකින් 'S' 3ක්.\n" +
             "  ✔️ *සා/පෙළ:* ගණිතය සඳහා අවම 'S' සාමාර්ථයක්.\n\n" +
             "💻 *Faculty of Computing*\n" +
             "• BSc in Information Technology\n" +
             "  ✔️ *උ/පෙළ:* භෞතික විද්‍යා හෝ ඉංජිනේරු තාක්ෂණ අංශයෙන් 'S' 3ක්.\n" +
             "  *(සටහන: ඕනෑම අංශයකින් 'S' 3ක් ඇති අය සා/පෙළ ගණිතය 'C' සාමාර්ථයක් ලබා තිබිය යුතු අතර, ඈඳුනු පාඨමාලාවක් (Bridging Course) සමත් විය යුතුය).*",
    "/slita": "🎓 *SLITA Campus*\n\n" +
              "⚙️ *Faculty of Engineering & Technology*\n" +
              "• BSc in Textile & Apparel Technology / Textile & Apparel Studies\n" +
              "  ✔️ *උ/පෙළ:* භෞතික විද්‍යා, ජීව විද්‍යා හෝ තාක්ෂණ අංශයෙන් 'S' 3ක් (Apparel Studies සඳහා ඕනෑම අංශයකින් 'S' 3ක්).\n" +
              "  ✔️ *සා/පෙළ:* ගණිතය සහ විද්‍යාව සඳහා අවම වශයෙන් වාර දෙකක් තුළ 'C' සාමාර්ථයක්.\n\n" +
              "• Bachelor of Technology Honours in Environmental Technology\n" +
              "  ✔️ *උ/පෙළ:* ඕනෑම අංශයකින් 'S' 3ක් එකවර ලබා තිබීම.",
    "/niibs": "🎓 *NIIBS Campus*\n\n" +
              "💻 *Faculty of Computing*\n" +
              "• BSc Honours in Information Technology\n" +
              "  ✔️ *උ/පෙළ:* ඕනෑම අංශයකින් එකවර 'S' 3ක් ලබා තිබීම.",
    "/ichem": "🎓 *ICHEM Campus*\n\n" +
              "🔬 *Faculty of Science*\n" +
              "• BSc Honours in Chemical Science\n" +
              "  ✔️ *උ/පෙළ:* ජීව විද්‍යා හෝ භෞතික විද්‍යා අංශයෙන් එකවර 'S' 3ක් ලබා තිබීම.",
    "/lyc": "🎓 *LYC Campus*\n\n" +
            "📘 *Faculty of Education*\n" +
            "• Bachelor of Education Honours in Primary Education\n" +
            "  ✔️ *උ/පෙළ:* ඕනෑම අංශයකින් එකවර 'S' 3ක් ලබා තිබීම.\n" +
            "  ✔️ *සා/පෙළ:* සිංහල/දෙමළ, ගණිතය සහ ඉංග්‍රීසි සඳහා අවම 'S' 3ක් ලබා තිබීම.",
    "/bms": "🎓 *BMS*\n\n" +
            "📊 *Faculty of Business*\n" +
            "• Bachelor of Business Management Honours\n" +
            "  ✔️ *උ/පෙළ:* වාණිජ අංශයෙන් 'S' 3ක් *හෝ* ආර්ථික විද්‍යාව ඇතුළුව ඕනෑම අංශයකින් 'S' 3ක්.\n" +
            "  ✔️ *සා/පෙළ:* ගණිතය සඳහා අවම 'S' සාමාර්ථයක්."
};

const MENU_MESSAGE =
    `*🎓 IFSLS 2026/27 සම්පූර්ණ තොරතුරු මෙනුව 🎓*\n\n` +
    `*පොදු තොරතුරු සඳහා පහත කමාන්ඩ් Type කරන්න:*\n` +
    `📘 */about* - IFSLS යනු කුමක්ද?\n` +
    `✅ */eligibility* - මූලික සුදුසුකම්\n` +
    `💰 */loan* - ණය මුදල සහ දීමනාව\n` +
    `💰 */maxloan* - උපරිම ණය මුදල් සිමාව\n` +
    `⏳ */repayment* - ණය ආපසු ගෙවීම\n` +
    `❌ */disqualified* - අයදුම් කළ නොහැක්කේ කාටද?\n` +
    `✍️ */guarantors* - ඇපකරුවන්\n` +
    `🌉 */bridging* - ඈඳුනු පාඨමාලා කල යුතු අය\n` +
    `🌉 */bridginginfo* - ඈඳුනු පාඨමාලා කරන්නේ කොහොමද?\n` +
    `👤 */private* - Private අයදුම්කරුවන්\n` +
    `📂 */documents* - සම්මුඛ පරීක්ෂණ ලියකියවිලි\n` +
    `📌 */stipend* - ශිෂ්‍යාධාර දීමනා පිළිබඳව.\n` +
    `📌 */conditions* - Degree හදාරන කාලය තුලදි පිලිපැදිය යුතු නීති.\n` +
    `📌 */applycenters* - Apply කීරිමේ මධ්‍යස්ථාන පිළිබඳ විස්තර.\n` +
    `📝 */applysteps* - අයදුම් කරන පියවර\n` +
    `📝 */afterapplysteps* - අයදුම් කිරීමෙන් පසු \n` +
    `📌 */specialnotes* - Interviews වලින් පසු වැදගත් විස්තර\n` +
    `⏰ */deadline* - අවසන් දිනය\n` +
    `✅ */ministrycontact* - Ministry Department එක contact කරන ආකාරය\n\n` +
    `✅ */results* - IFSLS selection results check කරන ආකාරය \n\n` +
    `📌 */onlinecertificate* - O/L & A/L Exam Certificates Online ගෙන්න ගන්නා ආකාරය \n` +
    `📌 */coursechange* - Course Change Letter Format\n` +
    `📌 */affidavit* - දිවුරුම් ප්‍රකාශයක් ලබා ගැනීම සදහා\n` +
    `📌 */ugccancel* - UGC Registration Cancel කරන ආකාරය\n` +
    `📌 */laptopguide* - Degree එකට හරියන Laptop Buying Guide\n` +
    `📌 */jobs* - Internships සහ Jobs විස්තර \n` +
    `📌 */boarding* - බෝඩිම් සොයාගන්නා ආකාරය / Accommodation Web & Video\n\n` +
    `*📄 මාර්ගෝපදේශක PDF (භාෂා 3):*\n` +
    `🇱🇰 */guidepdf-si* - සිංහල මාර්ගෝපදේශකය\n` +
    `🌍 */guidepdf-ta* - දෙමළ මාර්ගෝපදේශකය\n` +
    `🇬🇧 */guidepdf-en* - ඉංග්‍රීසි මාර්ගෝපදේශකය\n\n` +
    `*🏫 කැම්පස් අනුව උපාධි සහ අදාළ A/L සුදුසුකම් බැලීමට පහත නම Type කරන්න:*\n` +
    `*/sliit* | */nsbm* | */cinec* | */kiu*\n` +
    `*/sltc* | */saegis* | */horizon* | */icbt*\n` +
    `*/bci* | */icasl* | */esoft* | */siba*\n` +
    `*/slita* | */niibs* | */ichem* | */lyc* | */bms*`;

function extractMessageText(msg) {
    const m = msg.message;
    if (!m) return "";
    const type = getContentType(m);
    if (type === "conversation") return m.conversation || "";
    if (type === "extendedTextMessage") return m.extendedTextMessage?.text || "";
    if (type === "imageMessage") return m.imageMessage?.caption || "";
    if (type === "videoMessage") return m.videoMessage?.caption || "";
    return "";
}

async function askGroqAssistant(query) {
    if (!groqApiKey) {
        return "⚠️ AI service එක දැනට configure කර නැත (GROQ_API_KEY missing).";
    }

    const promptQuery = query || "Hello, can you help me with student loan details?";
    const isSinhala = /[\u0D80-\u0DFF]/.test(promptQuery);
    const languageInstruction = isSinhala
        ? "Answer strictly in natural, clear, and conversational Sinhala."
        : "Answer strictly in clear and professional English.";

    try {
        const completion = await groq.chat.completions.create({
            model: "openai/gpt-oss-20b",
            messages: [
                {
                    role: "system",
                    content: `You are a friendly, supportive, and warm AI assistant (like an older student or helpful senior admin friend in group) for the IFSLS (Interest Free Student Loan Scheme) student community in Sri Lanka.

--- OFFICIAL IFSLS KNOWLEDGE BASE ---
1. What is IFSLS: 100% interest-free government student loan scheme for non-state higher education degrees in Sri Lanka.
2. Basic Eligibility:
   - A/L years: 2023, 2024, or 2025.
   - Results: Pass all 3 subjects at one sitting (Minimum 3 'S' passes).
   - Z-Score / CGT marks: Minimum 30 marks.
   - English: Minimum 'S' pass for O/L or A/L English.
   - Age: Under 25 years old as of 27 September 2026.
3. Maximum Loan Amounts:
   - 4-year degrees: Human/Social Sciences (Rs. 800,000), Management/Commerce (Rs. 900,000), Physical Science (Rs. 1,000,000), Chem/Bio/Agri Science (Rs. 1,200,000), Engineering (Rs. 1,500,000), Bio/Engineering Tech (Rs. 1,000,000), IT Computing (Rs. 800,000 to 1,000,000).
   - Stipend (Living Allowance): Additional interest-free loan of Rs. 75,000 per year (Total Rs. 300,000 for 4 years / Rs. 225,000 for 3 years), paid quarterly (Rs. 18,750 per 3 months).
4. Repayment: 1-year grace period after degree completion, then paid in equal installments over 7 to 8 years (Total 12 years).
5. Conditions: Minimum 80% attendance and 'C' pass for compulsory modules. Quitting the course requires paying back the full loan with interest immediately; defaulters will be blacklisted in CRIB.
6. Disqualified: Students already registered for UGC (State Universities), Colleges of Education, or Government Diplomas over 2 years.
7. Appeal Guidelines & How to Apply (අභියාචනා ඉදිරිපත් කිරීමේ ක්‍රමවේදය):
   - Timeline: Must apply within 1 month from the release of selection results.
   - How to apply (Apply karanne kohomada):
     1. Visit the official website: https://studentloans.mohe.gov.lk
     2. Log in using your NIC and password / application credentials.
     3. Go to the 'Appeals' (අභියාචනා) section on your dashboard.
     4. Select your preferred course or institute changes according to the instructions provided.
     5. Submit the appeal form online before the deadline.
   - Who cannot apply: Students who are already registered in the selected degree-offering institute cannot submit appeals for changes.
   - Selection Basis: Appeals are considered based on available vacancies and Z-scores. The Ministry Secretary's decision is final.
--------------------------------------

Rules:
1. ${languageInstruction}
2. Tone & Style: Be extremely lovely & friendly, warm, and supportive (like a helpful senior friend talking to junior students). Use appropriate friendly emojis (like 😊, 👍, 💙) to make students feel comfortable.
3. Reply in clean plain text. Do NOT include unnecessary markdown symbols, code blocks, or weird formatting characters.
4. Be accurate and precise based on the knowledge base above. Do not hallucinate. If the answer is not in the knowledge base find using these web site https://www.mohe.gov.lk/index.php?option=com_content&view=article&id=348%3Ainterest-free-student-loan-scheme&catid=48&Itemid=331&lang=en, politely state that you cannot find it and suggest contacting a group admin.`
                },
                { role: "user", content: promptQuery }
            ]
        });
        return completion.choices[0]?.message?.content || "⚠️ සමාවෙන්න මට මේ මොහොතේ උත්තර ලබා දීමට නොහැකි විය.";
    } catch (err) {
        console.error("Groq Error:", err?.message || err);
        return "⚠️ සමාවෙන්න මට මේ මොහොතේ උත්තර ලබා දීමට නොහැකි විය.";
    }
}

async function startBot() {
    loadGuides();
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, "auth_info"));

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        auth: state
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("📱 Scan this QR code with WhatsApp:");
            qrcode.generate(qr, { small: true });
        }

        
const WELCOME_BATCH_INTERVAL_MS = 30 * 60 * 1000;
const pendingWelcomeByGroup = new Map();
let welcomeBatchTimerStarted = false;

function getParticipantJid(p) {
    if (!p) return "";
    if (typeof p === "string") return p;
    return p.jid || p.id || p.lid || "";
}

function getUserDigits(jid) {
    return String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");
}

function isUserBlacklisted(jid) {
    if (!jid || typeof blacklistedUsers !== "object") return false;
    const now = Date.now();
    const digits = getUserDigits(jid);
    for (const [k, exp] of Object.entries(blacklistedUsers)) {
        if (!exp || now > exp) continue;
        if (k === jid || (digits && getUserDigits(k) === digits)) return true;
    }
    return false;
}

async function flushWelcomeBatches(sock) {
    for (const [, usersMap] of pendingWelcomeByGroup.entries()) {
        const users = Array.from(usersMap.values());
        usersMap.clear();
        if (users.length === 0) continue;
        const blFn = typeof __isUserBlacklisted === "function"
            ? __isUserBlacklisted
            : (typeof global.isUserBlacklisted === "function" ? global.isUserBlacklisted : () => false);
        await sendWelcomeInboxToUsers(sock, users, blFn);
    }
}

function startWelcomeBatchScheduler(sock) {
    if (welcomeBatchTimerStarted) return;
    welcomeBatchTimerStarted = true;
    setInterval(() => {
        flushWelcomeBatches(sock).catch((e) => console.error("[welcome-timer]", e.message));
    }, WELCOME_BATCH_INTERVAL_MS);
}

                if (connection === "open") {
            console.log("✅ Connected to WhatsApp via Baileys! Guides loaded:", {
                en: englishGuide.length > 0,
                si: sinhalaGuide.length > 0
            });
        }

        if (connection === "close") {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log("❌ Connection closed. Status:", statusCode, "Reconnect:", shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        }
    });

    sock.ev.on("group-participants.update", async (event) => {
        try {
            const groupId = event?.id;
            if (!groupId || !TARGET_GROUP_IDS.includes(groupId)) return;
            if (event.action !== "add") return;
                const kickedNon94 = await handleNonSriLankanOnGroupAdd(sock, groupId, event.participants || []);
                if (Array.isArray(event.participants)) {
                    event.participants = event.participants.filter((pt) => {
                        const id = typeof pt === "string" ? pt : (pt?.id || pt?.jid);
                        return !kickedNon94.has(id);
                    });
                }

            const WELCOME_MS = 30 * 60 * 1000;
            global.__ifslsWelcomeQueue = global.__ifslsWelcomeQueue || new Map();
            const qMap = global.__ifslsWelcomeQueue;

            const extractJid = (part) => {
                if (!part) return "";
                if (typeof part === "string") return part;
                return part.jid || part.id || part.lid || "";
            };

            const extractDigits = (jid) =>
                String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");

            const checkBlacklisted = (jid) => {
                try {
                    if (!jid || typeof blacklistedUsers !== "object" || !blacklistedUsers) return false;
                    const now = Date.now();
                    const d = extractDigits(jid);
                    for (const [k, exp] of Object.entries(blacklistedUsers)) {
                        if (!exp || now > exp) continue;
                        if (k === jid || (d && extractDigits(k) === d)) return true;
                    }
                } catch (_) {}
                return false;
            };

            if (!global.__ifslsWelcomeTimer) {
                global.__ifslsWelcomeTimer = setInterval(async () => {
                    const THIRTY_MIN_MS = 30 * 60 * 1000;
                    const now = Date.now();
                    for (const [, usersMap] of qMap.entries()) {
                        const readyList = [];
                        for (const [key, u] of usersMap.entries()) {
                            const queuedAt = typeof u.queuedAt === "number" ? u.queuedAt : (now - THIRTY_MIN_MS);
                            if (now - queuedAt >= THIRTY_MIN_MS) {
                                readyList.push(u);
                                usersMap.delete(key);
                            }
                        }
                        if (readyList.length === 0) continue;
                        await sendWelcomeInboxToUsers(sock, readyList, checkBlacklisted);
                    }
                }, 60 * 1000);
            }

            if (!qMap.has(groupId)) {
                qMap.set(groupId, new Map());
            }
            const groupQueue = qMap.get(groupId);

            const participants = Array.isArray(event.participants) ? event.participants : [];

            const isValidPhoneDigits = (d) => {
                const s = String(d || "").replace(/\D/g, "");
                return s.length >= 9 && s.length <= 15 && !s.startsWith("1474333");
            };
            const normalizePhoneDigits = (raw) => {
                let d = String(raw || "").split("@")[0].split(":")[0].replace(/\D/g, "");
                if (d.startsWith("0") && d.length === 10) d = "94" + d.slice(1);
                return d;
            };
            let metaParticipants = [];
            try {
                const gMeta = await sock.groupMetadata(groupId);
                if (gMeta && Array.isArray(gMeta.participants)) {
                    metaParticipants = gMeta.participants;
                }
            } catch (_) {}
            const resolveRealPhoneDigits = async (part) => {
                if (part && typeof part === "object") {
                    if (part.phoneNumber) {
                        const pd = normalizePhoneDigits(part.phoneNumber);
                        if (isValidPhoneDigits(pd)) return pd;
                    }
                    if (part.jid && String(part.jid).endsWith("@lid")) {
                        const pd = normalizePhoneDigits(part.jid);
                        if (isValidPhoneDigits(pd)) return pd;
                    }
                }
                const rawId = extractJid(part);
                if (rawId && String(rawId).endsWith("@lid")) {
                    const pd = normalizePhoneDigits(rawId);
                    if (isValidPhoneDigits(pd)) return pd;
                }
                const lidCandidate = (part && typeof part === "object" && (part.lid || part.id)) || rawId;
                if (lidCandidate) {
                    try {
                        if (sock.signalRepository && sock.signalRepository.lidMapping && typeof sock.signalRepository.lidMapping.getPNForLID === "function") {
                            const pn = await sock.signalRepository.lidMapping.getPNForLID(lidCandidate);
                            const pd = normalizePhoneDigits(pn);
                            if (isValidPhoneDigits(pd)) return pd;
                        }
                    } catch (_) {}
                    const lidStr = String(lidCandidate);
                    const lidNum = extractDigits(lidStr);
                    const match = metaParticipants.find((mp) => {
                        if (!mp || typeof mp !== "object") return false;
                        return (
                            mp.id === lidStr ||
                            mp.lid === lidStr ||
                            (lidNum && (extractDigits(mp.id) === lidNum || extractDigits(mp.lid) === lidNum))
                        );
                    });
                    if (match) {
                        const cand = match.phoneNumber || match.jid || match.id;
                        if (cand && !String(cand).endsWith("@lid")) {
                            const pd = normalizePhoneDigits(cand);
                            if (isValidPhoneDigits(pd)) return pd;
                        }
                    }
                }
                return "";
            };

            let queuedCount = 0;

            for (const p of participants) {
                const jid = extractJid(p);
                if (!jid) continue;
                if (checkBlacklisted(jid)) continue;
                const digits = extractDigits(jid);
                const key = digits || jid;
                if (!groupQueue.has(key)) {
                    groupQueue.set(key, { jid, digits, addedAt: Date.now() , queuedAt: Date.now() });
                    queuedCount++;
                }
            }

            if (queuedCount > 0) {
                console.log("🕒 [WELCOME QUEUED] Group:", groupId, "| Added:", queuedCount, "| Pending:", groupQueue.size, "| Wait: 30m");
                console.log("🕒 [WELCOME QUEUED] Group:", groupId, "| Added:", queuedCount, "| Pending:", groupQueue.size);
            }
        } catch (err) {
            console.error("❌ [GROUP JOIN ERROR]:", err && err.message ? err.message : err);
        }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;

        for (const msg of messages) {
                const __m = msg;
                const chatId = __m?.key?.remoteJid;
                if (!chatId || chatId === "status@broadcast" || __m?.key?.fromMe) continue;
                if (!chatId.endsWith("@g.us")) {
                    const __now = Date.now();
                    if (pmRepliedUsers.has(chatId) && (__now - pmRepliedUsers.get(chatId) < PM_COOLDOWN_MS)) continue;
                    const __recent = (pmCooldownTimestamps.get(chatId) || []).filter((ts) => __now - ts < 60 * 1000);
                    __recent.push(__now);
                    pmCooldownTimestamps.set(chatId, __recent);
                    if (__recent.length > 5) continue;
                    const __delay = Math.floor(Math.random() * (6000 - 3000 + 1)) + 3000;
                    try { await sock.sendPresenceUpdate("composing", chatId); } catch (_) {}
                    await new Promise((r) => setTimeout(r, __delay));
                    try { await sock.sendPresenceUpdate("paused", chatId); } catch (_) {}
                    await sock.sendMessage(chatId, { text: "ආයුබෝවන්! IFSLS Group BOT සමග සම්බන්ධ වීමට ස්තුතියි ඔයාට . 👋💙\n\n⚠️ කරුණාකර මෙම අංකයට පෞද්ගලික පණිවිඩ හා ණය පිලිබද විස්තර (Inbox/Direct Messages) එවීමෙන් වළකින්න.\n\nශිෂ්‍ය ණය (IFSLS) පිළිබඳ ඕනෑම ඔබට ඇති ඔනම ප්‍රශ්නයක් අපේ *IFSLS Main Group* එක ඇතුළට ගිහින් */menu* කියලා ටයිප් කරලා ලබා ගන්න පුළුවන් ලමයි නැත්නම් group admin කෙනෙක් හා සම්බන්ධ වෙන්න පුලුවන්! 😊\n\n📞 *Admins & Contacts:*\n\n🛠️ *BOT Programmer*\n- 076 206 8122 - Yasho (Horizon Campus)\n\n🎓 *SLIIT Campus Admins*\n\n- Chathuranga — 076 120 0261\n- Yasiru — 071 087 5268\n- Vidushi — 078 621 5746\n- Manuja — 078 532 5617\n- Rusindu — 075 113 2588\n\n🎓 *Horizon Campus Admins*\n\n- Yasho — 076 206 8122\n- Lahiru — 077 375 1413\n\n🎓 *CINEC Campus Admin*\n\n- Isuru — 076 063 0712\n\n🎓 *SLTC Admin*\n\n- Suwani      | 071 197 2394" }, { quoted: __m });
                    pmRepliedUsers.set(chatId, __now);
                    console.log("📩 [PM AUTO-REPLY SENT] To:", chatId);
                    continue;
                }
            try {
                if (!msg.message || msg.key.fromMe) continue;

                const chatId = msg.key.remoteJid;
                if (!chatId) continue;
                if (!chatId.endsWith("@g.us")) {
                    const now = Date.now();
                    if (pmRepliedUsers.has(chatId) && (now - pmRepliedUsers.get(chatId) < PM_COOLDOWN_MS)) {
                        continue;
                    }
                    const recentPms = (pmCooldownTimestamps.get(chatId) || []).filter((ts) => now - ts < 60 * 1000);
                    recentPms.push(now);
                    pmCooldownTimestamps.set(chatId, recentPms);
                    if (recentPms.length > 3) {
                        console.log(`⚠️ [PM RATE LIMIT] Throttling rapid PMs from ${chatId}`);
                        continue;
                    }
                    const typingDelay = Math.floor(Math.random() * (8000 - 4000 + 1)) + 4000;
                    try { await sock.sendPresenceUpdate("composing", chatId); } catch (_) {}
                    await new Promise((resolve) => setTimeout(resolve, typingDelay));
                    try { await sock.sendPresenceUpdate("paused", chatId); } catch (_) {}
                    await sock.sendMessage(chatId, { text: "ආයුබෝවන්! IFSLS Group BOT සමග සම්බන්ධ වීමට ස්තුතියි ඔයාට . 👋💙\n\n⚠️ කරුණාකර මෙම අංකයට පෞද්ගලික පණිවිඩ හා ණය පිලිබද විස්තර (Inbox/Direct Messages) එවීමෙන් වළකින්න.\n\nශිෂ්‍ය ණය (IFSLS) පිළිබඳ ඕනෑම ඔබට ඇති ඔනම ප්‍රශ්නයක් අපේ *IFSLS Main Group* එක ඇතුළට ගිහින් */menu* කියලා ටයිප් කරලා ලබා ගන්න පුළුවන් ලමයි නැත්නම් group admin කෙනෙක් හා සම්බන්ධ වෙන්න පුලුවන්! 😊\n\n📞 *Admins & Contacts:*\n\n🛠️ *BOT Programmer*\n- 076 206 8122 - Yasho (Horizon Campus)\n\n🎓 *SLIIT Campus Admins*\n\n- Chathuranga — 076 120 0261\n- Yasiru — 071 087 5268\n- Vidushi — 078 621 5746\n- Manuja — 078 532 5617\n- Rusindu — 075 113 2588\n\n🎓 *Horizon Campus Admins*\n\n- Yasho — 076 206 8122\n- Lahiru — 077 375 1413\n\n🎓 *CINEC Campus Admin*\n\n- Isuru — 076 063 0712\n\n🎓 *SLTC Admin*\n\n- Suwani      | 071 197 2394" }, { quoted: msg });
                    pmRepliedUsers.set(chatId, now);
                    console.log(`📩 [SAFE PM AUTO-REPLY] Sent once (24h cooldown) to ${chatId}`);
                    continue;
                }
                if (!TARGET_GROUP_IDS.includes(chatId)) continue;

                const text = extractMessageText(msg).trim();
                const replyText = async (body) => {
                    await sock.sendMessage(chatId, { text: body }, { quoted: msg });
                };

                const moderated = await moderateGroupMessage(sock, msg, chatId, text, replyText);
                if (moderated) continue;
                if (!text) continue;

                const textLower = text.toLowerCase();
                const firstWord = textLower.split(/\s+/)[0];

                if (firstWord === "/menu" || firstWord === "/help") {
                    await replyText(MENU_MESSAGE);
                    continue;
                }

                if (ifslsAnswers[firstWord]) {
                    await replyText(ifslsAnswers[firstWord]);
                    continue;
                }

                if (campusAnswers[firstWord]) {
                    await replyText(campusAnswers[firstWord]);
                    continue;
                }

                if (firstWord === "/guidepdf-si") {
                    await replyText("🇱🇰 *IFSLS 2026/27 සිංහල මාර්ගෝපදේශක PDF එක පහත ලින්ක් එකෙන් ඩවුන්ලෝඩ් කරගන්න:*\n\nhttps://drive.google.com/file/d/122Q6dk3Q8mlM0yWTlzLVDqKyIH4KjSFG/view?usp=sharing");
                    continue;
                }

                if (firstWord === "/guidepdf-ta") {
                    await replyText("🌍 *IFSLS 2026/27 தமிழ் வழிகாட்டி PDF ஐ கீழே உள்ள இணைப்பில் பதிவிறக்கம் செய்யவும்:*\n\nhttps://drive.google.com/file/d/1-AMByxSgGDfOwKE3mxTZgxvSSpBbtjOz/view?usp=sharing");
                    continue;
                }

                if (firstWord === "/guidepdf-en") {
                    await replyText("🇬🇧 *Download the IFSLS 2026/27 English Guide PDF from the link below:*\n\nhttps://drive.google.com/file/d/15eUJyKdYOcgeczEtkKXtwDucswSnJAUs/view?usp=sharing");
                    continue;
                }

                if (firstWord === "/deadline") {
                    const deadlineDate = new Date("2026-09-27T23:59:59").getTime();
                    const now = Date.now();
                    const timeLeft = deadlineDate - now;

                    if (timeLeft > 0) {
                        const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
                        const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

                        await replyText(
                            `⏳ *IFSLS 11th Intake Application Deadline*\n\n` +
                            `අයදුම්පත් භාරගන්නා අවසන් දිනයට තව:\n` +
                            `*දින ${days}යි, පැය ${hours}යි, විනාඩි ${minutes}යි, තත්පර ${seconds}යි!* 🏃‍♂️💨\n\n` +
                            `ඉක්මන් කරන්න! අවසන් මොහොත වෙනකන් ඉන්න එපා. අදම අයදුම් කරන්න. ✅`
                        );
                    } else {
                        await replyText("🚫 *IFSLS 11th Intake සඳහා අයදුම්පත් භාරගන්නා කාලය දැන් අවසන් වී ඇත!*");
                    }
                    continue;
                }

                if (await handleCutoffFeature({ body: text, reply: replyText })) {
                    continue;
                }

                if (firstWord === "/status") {
                    if (typeof buildBotStatusReport === "function") {
                        const report = buildBotStatusReport({
                            targetGroupsCount: TARGET_GROUP_IDS.length,
                            welcomeQueueLength: Array.from(pendingWelcomeByGroup.values()).reduce((acc, m) => acc + m.size, 0),
                            blacklistedUsers
                        });
                        await replyText(report);
                    } else {
                        await replyText("⚠️ Status report function not found.");
                    }
                    continue;
                }

                if (firstWord === "/ai") {
                    const query = text.replace(/^\/ai\s*/i, "").trim();
                    const aiReply = await askGroqAssistant(query);
                    await replyText(aiReply);
                    continue;
                }

                if (typeof handleCalculatorCommand === "function") {
                    const calcResult = handleCalculatorCommand(text);
                    if (calcResult) {
                        await replyText(calcResult);
                        continue;
                    }
                }

                if (typeof handleCommonQuestionAutoReply === "function") {
                    const fakeMsg = {
                        reply: async (body) => {
                            await replyText(body);
                        }
                    };
                    await handleCommonQuestionAutoReply(fakeMsg, chatId, textLower);
                }
            } catch (err) {
                console.error("❌ Error handling Baileys message:", err);
            }
        }
    });
}

startBot();
