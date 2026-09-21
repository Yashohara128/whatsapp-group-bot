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

// ==========================================
// 🎓 1. IFSLS පොදු ප්‍රශ්න සහ පිළිතුරු (FAQs)
// ==========================================
const ifslsAnswers = {
    "/about": "🎓 *IFSLS යනු කුමක්ද?*\nමෙය ශ්‍රී ලංකා රජය මගින් රාජ්‍ය නොවන විශ්වවිද්‍යාල වල උපාධියක් හැදෑරීම සඳහා සිසුන්ට ලබාදෙන 100% ක් පොලී රහිත ශිෂ්‍ය ණය යෝජනා ක්‍රමයකි.",
    "/eligibility": "✅ *මූලික සුදුසුකම්:*\n1️⃣ A/L වර්ෂ: 2023, 2024 හෝ 2025\n2️⃣ ප්‍රතිඵල: විෂයයන් 3ම එකවර සමත් වීම (අවම 'S' 3ක්).\n3️⃣ CGT ලකුණු: අවම 30ක්.\n4️⃣ ඉංග්‍රීසි: O/L හෝ A/L ඉංග්‍රීසි විෂයට අවම 'S' සාමාර්ථයක්.\n5️⃣ වයස: 2026 සැප්තැම්බර් 27 දිනට වයස 25 ට අඩු වීම.",
    "/loan": "💰 *ණය මුදල සහ අමතර වියදම්:*\nඋපාධිය සඳහා උපරිම රු. 1,500,000 දක්වා ණය මුදලක් ගෙවනු ලැබේ. මීට අමතරව, ඔබේ දෛනික වියදම් සඳහා (Stipend) වසරකට රු. 75,000 බැගින් (වසර 4ට ලක්ෂ 3ක්) වෙනම මුදලක් ලබාගත හැක. සම්පූර්ණ පොලිය රජය විසින් දරයි.",
    "/repayment": "⏳ *ණය ආපසු ගෙවීම:*\nඋපාධිය අවසන් වී වසරක (1 year) සහන කාලයක් හිමි වේ. ඉන්පසු වසර 7කින් හෝ 8කින් සමාන වාරික වශයෙන් ණය මුදල ගෙවා නිම කළ යුතුය. (සම්පූර්ණ ණය කාලය වසර 12කි).",
    "/disqualified": "❌ *අයදුම් කළ නොහැක්කේ කාටද?*\nරජයේ කැම්පස් (UGC) සඳහා තේරී පත්වී ඇති/ලියාපදිංචි වී ඇති සිසුන්, විද්‍යාපීඨ (College of Education), HND වැනි වසර 2කට වැඩි රජයේ ඩිප්ලෝමා සඳහා තේරී ඇති සිසුන්ට අයදුම් කළ නොහැක.",
    "/guarantors": "✍️ *ඇපකරුවන්:*\nපළමු ඇපකරු ලෙස මව, පියා හෝ නීත්‍යානුකූල භාරකරු අත්සන් කළ යුතු අතර, දෙවන ඇපකරු ලෙස සමීප ඥාතියෙකු අත්සන් කළ යුතුය.",
    "/bridging": "🌉 *ඈඳුනු පාඨමාලා (Bridging Courses):*\nඔබ IT හෝ Management උපාධියක් කිරීමට අපේක්ෂා කරන්නේ නම්, නමුත් A/L සඳහා ICT හෝ අදාළ විෂයයන් හදාරා නොමැති නම්, කැම්පස් එක මගින් පවත්වන කෙටි කාලීන 'ඈඳුනු පාඨමාලාවක්' සමත් වීමෙන් පසු අදාළ උපාධිය හැදෑරිය හැක.",
    "/private": "👤 *Private Candidates (පෞද්ගලික අයදුම්කරුවන්):*\nපෞද්ගලිකව උසස් පෙළ පෙනී සිටි අයදුම්කරුවන්, පාසලේ අස්වීමේ සහතිකය වෙනුවට 'ග්‍රාම නිලධාරී සහතික කළ (ප්‍රාදේශීය ලේකම් අනුමත කළ) චරිත සහතිකයක්' හෝ 'සාම විනිසුරුවරයෙකුගෙන් (JP) ලබාගත් චරිත සහතිකයක්' සම්මුඛ පරීක්ෂණයේදී ඉදිරිපත් කළ යුතුය.",
    "/documents": "📂 *ඉන්ටවිව් එකට රැගෙන යා යුතු ලියකියවිලි (Originals):*\n1. ජාතික හැඳුනුම්පත (NIC)\n2. උප්පැන්න සහතිකය\n3. O/L සහ A/L සහතික\n4. Z-Score ලේඛනය (විභාග දෙපාර්තමේන්තුවෙන්)\n5. Online Application එකේ Print Out එක\n6. පාසලේ අස්වීමේ සහතිකය (හෝ Private අයගේ චරිත සහතිකය)",
    "/applysteps": "📝 *අයදුම් කරන ආකාරය:*\n1. www.studentloans.mohe.gov.lk වෙත පිවිසෙන්න.\n2. NIC අංකයෙන් Register වෙන්න.\n3. O/L, A/L ප්‍රතිඵල සහ පෞද්ගලික විස්තර පුරවන්න.\n4. ඔබට අවශ්‍ය කැම්පස් සහ උපාධි කැමැත්තේ අනුපිළිවෙලට (Preferences) තෝරන්න.\n5. තහවුරු කර Submit කර, Application එක Print කරගන්න.",
    "/deadline": "⏰ *අවසන් දිනය:*\n2026 සැප්තැම්බර් 27 දින මධ්‍යම රාත්‍රී 12.00 ට පෙර Online හරහා අයදුම්පත් යොමු කළ යුතුය."
};

// ==========================================
// 🏫 2. කැම්පස්, සියලුම උපාධි සහ අවශ්‍ය A/L සුදුසුකම්
// ==========================================
const campusAnswers = {
    "/sliit": "🎓 *SLIIT Campus*\n\n" +
              "⚙️ *Engineering* (ගණිත ධාරාවෙන් 'S' 3ක්):\n" +
              "• BSc Eng (Hons) in Electrical & Electronic\n" +
              "• BSc Eng (Hons) in Mechanical\n" +
              "• BSc Eng (Hons) in Civil\n" +
              "• BSc Eng (Hons) in Materials\n\n" +
              "🧮 *Mathematics* (ගණිත ධාරාවෙන් 'S' 3ක්):\n" +
              "• BSc (Hons) in Financial Math & Applied Stat\n\n" +
              "💻 *IT & Computing* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n" +
              "• BSc (Hons) in IT\n" +
              "• BSc (Hons) in Software Eng (CS)\n\n" +
              "📊 *Business* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n" +
              "• BBA (Hons)\n\n" +
              "📚 *Education* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n" +
              "• BEd (Hons) in Social Sciences / Physical Sciences / English",

    "/nsbm": "🎓 *NSBM Green University*\n\n" +
             "⚖️ *Law* (ඕනෑම ධාරාවකින් 'C' 3ක් සහ ඉංග්‍රීසි 'C'):\n" +
             "• LLB (Hons) Law\n\n" +
             "💻 *IT & Computing* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n" +
             "• BSc (Hons) Computer Networks\n" +
             "• BSc in Multimedia\n\n" +
             "📊 *Business* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n" +
             "• BSc in Business Mgt (Project Mgt)\n\n" +
             "🎨 *Design* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n" +
             "• Bachelor of Interior Design",

    "/cinec": "🎓 *CINEC Campus*\n\n" +
              "⚙️ *Engineering* (ගණිත ධාරාවෙන් 'S' 3ක්):\n" +
              "• BSc Eng (Hons) Automotive\n" +
              "• BSc Eng (Hons) Mechanical\n" +
              "• BSc Eng (Hons) Mechatronics\n" +
              "• BSc Eng Civil\n" +
              "• BSc (Hons) Electronics & Telecom\n\n" +
              "🔬 *Science/Health* (ජීව විද්‍යා ධාරාවෙන් 'S' 3ක්):\n" +
              "• BSc (Hons) Cosmetic Science\n" +
              "• BSc (Hons) Medical & Health Product Mgt\n" +
              "• BSc (Hons) Chemistry\n" +
              "• BSc (Hons) Industrial Pharmaceutical\n" +
              "• BSc (Hons) Biomedical\n\n" +
              "💻 *IT & Computing* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n" +
              "• BSc (Hons) Software Eng\n" +
              "• BSc (Hons) Computer Science\n\n" +
              "📊 *Business* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n" +
              "• BBM (Hons) Supply Chain / Marketing / HR / Business Admin / Banking / Accounting\n\n" +
              "📚 *Education & Arts* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n" +
              "• BEd (Hons) IT / Early Childhood / Sports\n" +
              "• BA (Hons) English / BA in English",

    "/kiu": "🎓 *KIU Campus*\n\n" +
            "🔬 *Health Science* (ජීව විද්‍යා ධාරාවෙන් 'S' 3ක්):\n" +
            "• BSc (Hons) Biomedical Science\n" +
            "• BSc (Hons) Acupuncture\n\n" +
            "⚖️ *Law* (ඕනෑම ධාරාවකින් 'C' 2ක් හා 'S' 1ක්):\n" +
            "• LLB (Hons)\n\n" +
            "💻 *IT & Computing* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n" +
            "• BSc (Hons) MIS\n" +
            "• BSc (Hons) Software Eng\n" +
            "• BSc (Hons) Computer Networks & Cyber Sec\n" +
            "• BSc (Hons) Data Science\n\n" +
            "📊 *Business & Arts* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n" +
            "• BBM (Hons) HR / Marketing / Business Analytics / Accounting\n" +
            "• BSc (Hons) Psychology",

    "/horizon": "🎓 *HORIZON Campus*\n\n" +
                "🔬 *Science & Tech* (ජීව විද්‍යා හෝ Tech ධාරාවෙන් 'S' 3ක්):\n" +
                "• BSc (Hons) Biotechnology\n" +
                "• Bachelor of Biosystems Tech (Hons)\n\n" +
                "💻 *IT & Computing* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n" +
                "• BSc (Hons) IT\n" +
                "• BSc (Hons) Data Science\n" +
                "• BSc (Hons) IT (Networking)\n\n" +
                "📊 *Business* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n" +
                "• BSc in Mgt (HR)\n" +
                "• BSc (Hons) Marketing\n" +
                "• BSc (Hons) Accounting & Finance\n\n" +
                "📚 *Education* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n" +
                "• BEd (Hons) Biological Science / IT",

    "/sltc": "🎓 *SLTC (Sri Lanka Technological Campus)*\n\n" +
             "⚙️ *Engineering* (ගණිත ධාරාවෙන් 'S' 3ක්):\n" +
             "• BSc (Hons) Electronics & Telecom\n" +
             "• BSc (Hons) Electrical Power\n" +
             "• BSc (Hons) Eng in ICT\n" +
             "• BSc (Hons) Electronics Eng Mgt\n" +
             "• BSc (Hons) Eng in Civil\n\n" +
             "🔬 *Technology & Science* (ගණිත/ජීව/Tech ධාරාවෙන් 'S' 3ක්):\n" +
             "• BTech (Hons) Electronics / Agricultural Tech\n" +
             "• BSc (Hons) Biosystems Eng\n\n" +
             "💻 *IT & Computing* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n" +
             "• BSc (Hons) Data Science / Software Eng / Cyber Security\n" +
             "• BSc in Cloud Computing\n\n" +
             "📊 *Business & Apparel* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n" +
             "• BBM (Hons) HR / Supply Chain / Operations / Marketing / Accounting\n" +
             "• BSc (Hons) E-Tourism / Logistics\n" +
             "• BSc Tourism & Hospitality Mgt\n" +
             "• BSc in Fashion Merchandise Mgt",

    "/saegis": "🎓 *SAEGIS Campus*\n\n" +
               "💻 *IT* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n• BSc (Hons) IT / Software Eng / Computer Science | BSc in IT\n\n" +
               "📊 *Business* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n• BBM (Hons) Marketing / HR / Tourism / Logistics / Accounting | BBM (Hons) | BBA\n\n" +
               "📚 *Arts* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n• BA in English",

    "/icbt": "🎓 *ICBT Campus*\n\n" +
             "💻 *IT* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n• BSc (Hons) Software Eng / IT (Cyber Security) / IT (Data Science) / IT (AI)\n\n" +
             "📊 *Business* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n• BBM (Hons)",

    "/bci": "🎓 *BCI Campus*\n\n" +
            "💻 *IT* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n• BSc (Hons) IT / Software Eng\n\n" +
            "📊 *Business* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n• BBM (Hons) / BBM (Hons) Accounting\n\n" +
            "📚 *Education* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n• BEd (Hons) Primary Edu / Early Childhood | BSc (Hons) Counseling Psychology",

    "/icasl": "🎓 *ICASL*\n\n" +
              "📊 *Accounting* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n" +
              "• BSc Applied Accounting (Special) / BBM (Hons) Business Analytics\n" +
              "• BSc Applied Accounting (General) / BBM in Business Analytics",

    "/esoft": "🎓 *ESOFT Metro Campus*\n\n" +
              "💻 *IT* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n• BSc (Hons) in IT\n\n" +
              "📊 *Business* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n• BBM (Hons) Business Mgt",

    "/siba": "🎓 *SIBA Campus*\n\n" +
             "💻 *IT* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n• BSc in ICT / BSc in IT\n\n" +
             "📊 *Business* (ඕනෑම ධාරාවකින් 'S' 3ක්):\n• BBM (Hons)",

    "/slita": "🎓 *SLITA*\n\n" +
              "👗 *Apparel* (ඕනෑම ධාරාවකින් හෝ Tech ධාරාවෙන් 'S' 3ක්):\n• BSc in Textile & Apparel Tech / Textile & Apparel Studies\n\n" +
              "🌿 *Environment* (Tech ධාරාවෙන් 'S' 3ක්):\n• BTech (Hons) Environmental Tech",

    "/niibs": "🎓 *NIIBS*\n💻 *IT* (ඕනෑම ධාරාවකින් 'S' 3ක්): BSc (Hons) in IT",
    
    "/ichem": "🎓 *ICHEM*\n🔬 *Science* (ජීව විද්‍යා / ගණිත ධාරාවෙන් 'S' 3ක්): BSc (Hons) Chemical Science",
    
    "/lyc": "🎓 *LYC*\n📚 *Education* (ඕනෑම ධාරාවකින් 'S' 3ක්): BEd (Hons) Primary Education",
    
    "/bms": "🎓 *BMS*\n📊 *Business* (ඕනෑම ධාරාවකින් 'S' 3ක්): BBM (Hons) Business Mgt"
};

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

    cron.schedule("00 23 * * *", async () => {
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

            const welcomeMsg = `🎓 *Welcome to IFSLS 11th INTAKE MAIN GROUP* 🎓\n\n👋 Hello / ආයුබෝවන් *${info.name}*,\n\nPlease follow these group guidelines to maintain a good learning environment.\nකරුණාකර සමූහයේ යහපැවැත්ම උදෙසා පහත නීති මාලාව පිළිපදින්න.\n\n*GROUP RULES / නීති මාලාව:*\n1️⃣ Be respectful to everyone.\n(සියලුම සාමාජිකයින්ට ගෞරවයෙන් සලකන්න.)\n\n2️⃣ 🚫 No Spamming or flooding messages.\n(අනවශ්‍ය පණිවිඩ යැවීමෙන් වළකින්න.)\n\n3️⃣ 🚫 No unauthorized links (Other WhatsApp groups, Telegram, Scam/Business links). Only educational links are allowed.\n(වෙනත් WhatsApp Group, Telegram හෝ ව්‍යාපාරික ලින්ක් දැමීම සපුරා තහනම්. අධ්‍යාපනික ලින්ක් සඳහා පමණක් අවසර ඇත.)\n\n4️⃣ 🎓 For further questions regarding student loans, please contact the group admins. Please watch the YouTube playlist below for more information.\n(ශිෂ්‍ය ණය පිළිබඳ වැඩිදුර ප්‍රශ්න සඳහා සමූහයේ Admin වරුන් සම්බන්ධ කරගන්න. ණය පිළිබඳ සියලුම තොරතුරු දැනගැනීමට පහත YouTube Playlist එක අනිවාර්යයෙන්ම නරඹන්න.)\n📺 *YouTube Playlist:* https://youtube.com/playlist?list=PL-ZbzAh0pKykpa-odcUrDEg94PBbTQp9M&si=F9L3Spy-pLZJq31n\n\n⚠️ *Note:* Breaking these rules will result in an automatic permanent ban by the system.\n(මෙම නීති කඩකරන අයව පද්ධතිය මගින් ස්වයංක්‍රීයව සමූහයෙන් ඉවත් කරනු ලැබේ.)\n\nThank you! / ස්තූතියි!\n🤖 _System Generated Message. Please do not reply._`;

            await client.sendMessage(userId, welcomeMsg);
            console.log(`✅ First Welcome successfully sent to: ${info.name}`);

            // ⏳ තත්පර 3ක Delay එකක් (3 Seconds Delay)
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 2 වැනි Welcome Message එක (Commands List එක ගැන දැනුවත් කිරීම)
            const secondWelcomeMsg = `🤖 *Smart Bot Commands (ස්වයංක්‍රීය සහය)* 🤖\n\n` +
                                     `ඔබට ශිෂ්‍ය ණය ගැන අවශ්‍ය තොරතුරු ක්ෂණිකව Bot හරහා දැනගැනීමට පුළුවන්. ඒ සඳහා *Group එක ඇතුළට ගොස්* පහත Commands ටයිප් කරලා send කරන්න.\n\n` +
                                     `📌 */menu* - සියලුම විස්තර සහ Commands බලාගැනීමට.\n` +
                                     `📌 */about* - IFSLS ගැන විස්තර.\n` +
                                     `📌 */eligibility* - ණය ලබාගැනීමේ සුදුසුකම්.\n` +
                                     `📌 */applysteps* - අයදුම් කරන පියවර.\n\n` +
                                     `🏫 *කැම්පස් ගැන විස්තර බලාගන්න නම් කැම්පස් එකේ නමට කලින් / දාලා ගෲප් එකට සෙන්ඩ් කරන්න.*\n` +
                                     `(උදාහරණ: */sliit*, */nsbm*, */cinec*, */saegis*)\n\n` +
                                     `💡 *දැන්ම Group එකට ගිහින් /menu කියලා Type කරලා බලන්න!* 😎`;

            await client.sendMessage(userId, secondWelcomeMsg);
            console.log(`✅ Second Welcome (Commands Info) sent to: ${info.name}`);
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

        // ==========================================
        // 💡 3. IFSLS FAQ & Campus Commands Logic
        // ==========================================
        const msgCommand = textLower.trim();

        if (msgCommand === "/menu" || msgCommand === "/help") {
            const menuMsg = `*🎓 IFSLS 2026/27 සම්පූර්ණ තොරතුරු මෙනුව 🎓*\n\n` +
                            `*පොදු තොරතුරු සඳහා පහත කමාන්ඩ් Type කරන්න:*\n` +
                            `📘 */about* - IFSLS යනු කුමක්ද?\n` +
                            `✅ */eligibility* - මූලික සුදුසුකම්\n` +
                            `💰 */loan* - ණය මුදල සහ දීමනාව\n` +
                            `⏳ */repayment* - ණය ආපසු ගෙවීම\n` +
                            `❌ */disqualified* - අයදුම් කළ නොහැක්කේ කාටද?\n` +
                            `✍️ */guarantors* - ඇපකරුවන්\n` +
                            `🌉 */bridging* - ඈඳුනු පාඨමාලා\n` +
                            `👤 */private* - Private අයදුම්කරුවන්\n` +
                            `📂 */documents* - සම්මුඛ පරීක්ෂණ ලියකියවිලි\n` +
                            `📝 */applysteps* - අයදුම් කරන පියවර\n` +
                            `⏰ */deadline* - අවසන් දිනය\n\n` +
                            `*🏫 කැම්පස් අනුව උපාධි සහ අදාළ A/L සුදුසුකම් බැලීමට පහත නම Type කරන්න:*\n` +
                            `*/sliit* | */nsbm* | */cinec* | */kiu*\n` +
                            `*/sltc* | */saegis* | */horizon* | */icbt*\n` +
                            `*/bci* | */icasl* | */esoft* | */siba*\n` +
                            `*/slita* | */niibs* | */ichem* | */lyc* | */bms*`;
            
            await message.reply(menuMsg);
        }
        else if (ifslsAnswers[msgCommand]) {
            await message.reply(ifslsAnswers[msgCommand]);
        }
        else if (campusAnswers[msgCommand]) {
            await message.reply(campusAnswers[msgCommand]);
        }
        // ==========================================

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
