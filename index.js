const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const Groq = require("groq-sdk");

const {
    handleCalculatorCommand,
    handleAdminControlCommands,
    buildBotStatusReport,
    startScheduledReminders,
    handleCommonQuestionAutoReply
} = require("./features");


const groqApiKey = process.env.GROQ_API_KEY;
if (!groqApiKey) {
    console.warn("⚠️ [WARN] GROQ_API_KEY environment variable is not set!");
}
const groq = new Groq({ apiKey: groqApiKey || "" });

const stickerWarnings = {};
const pmRepliedUsers = new Map();
const pmCooldownTimestamps = new Map();

// ==========================================
// 📌 TEXT GUIDE BOOKS LOAD CONFIGURATION
// ==========================================
let englishGuide = "";
let sinhalaGuide = "";

async function loadGuides() {
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

const EXTRA_ADMINS = [
    "94722268122",
    "94762068122",
    "94761200261",
    "94773751413",
    "94710875268",
    "94760630712",
    "94765990540",
    "94785325717",
    "94751132588",
    "94779483956",
    "94760580735",
    "94740868458",
    "94771248970",
    "94786215746",
    "94764466939",
    "185126747156564"
];

const ENABLE_AUTO_REMOVE = true;
const SPAM_WINDOW_MS = 10 * 1000;
const SPAM_LIMIT = 6;
const BAD_WORDS = ["hutto", "uba", "thopi", "pakyala", "palayan", "pnnyo"];
const BAN_DURATION_MS = 24 * 60 * 60 * 1000;

function resolveChromiumPath() {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
        return process.env.CHROME_PATH;
    }
    const candidates = [
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable"
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return undefined;
}

async function sendWithTimeout(client, chatId, content, options = {}, timeoutMs = 15000) {
    return Promise.race([
        client.sendMessage(chatId, content, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms sending to ${chatId}`)), timeoutMs)
        )
    ]);
}

// ==========================================
// 🎓 1. IFSLS පොදු ප්‍රශ්න සහ පිළිතුරු (FAQs)
// ==========================================
const ifslsAnswers = {
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

// ==========================================
// 🏫 2. කැම්පස්, සියලුම උපාධි සහ අවශ්‍ය A/L සුදුසුකම්
// ==========================================
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

const spamTracker = new Map();
const linkWarningTracker = new Map();
const badWordWarningTracker = new Map();

const BLACKLIST_FILE = "./blacklist.json";
let blacklistedUsers = {};

if (fs.existsSync(BLACKLIST_FILE)) {
    try {
        blacklistedUsers = JSON.parse(fs.readFileSync(BLACKLIST_FILE, "utf-8"));
    } catch (e) {
        blacklistedUsers = {};
    }
}

function saveBlacklist() {
    try {
        fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklistedUsers, null, 2));
    } catch (e) {}
}

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

const executablePath = resolveChromiumPath();

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        ...(executablePath ? { executablePath } : {}),
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--disable-gpu"
        ]
    }
});

client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on("loading_screen", (percent, message) => {
    console.log("⏳ LOADING SCREEN:", percent, message);
});

client.on("authenticated", () => {
    console.log("✅ WhatsApp authenticated");

    startScheduledReminders(client, TARGET_GROUP_IDS, sendWithTimeout);
    
});

client.on("auth_failure", (msg) => {
    console.error("❌ AUTH FAILURE:", msg);
});

client.on("ready", async () => {
    console.log("\n========================================");
    console.log("🤖 BOT READY - SAFE QUEUE & ANTI-SPAM SYSTEM");
    console.log("========================================");
    console.log(`Working on ${TARGET_GROUP_IDS.length} Groups!`);

    let isReadyTriggered = true;

client.on("authenticated", () => {
    setTimeout(async () => {
        if (isReadyTriggered) return;
        try {
            const page = client.pupPage;
            if (!page) return;
            const state = await page.evaluate(() => ({
                hasWWebJS: Boolean(window.WWebJS),
                href: window.location.href || ""
            }));
            if (state.hasWWebJS || state.href.includes("web.whatsapp.com")) {
                isReadyTriggered = true;
                console.log("⚡ [AUTO-READY] Bypassing Store hang -> Bot active!");
                startScheduledReminders(client, TARGET_GROUP_IDS, sendWithTimeout);
            }
        } catch (_) {}
    }, 15000);
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
            } catch (error) {
                return { success: false };
            }
        }, groupId, participantId);
        return result && result.success;
    } catch (error) {
        return false;
    }
}

// ==========================================
// ⏳ SAFE INBOX WELCOME QUEUE SYSTEM
// ==========================================
const welcomeQueue = [];
const queuedWelcomeUsers = new Set();
let isProcessingWelcomeQueue = false;

function buildWelcomeMessages(actualNumber) {
    const firstMsg =
        `🎓 *Welcome to IFSLS 11th INTAKE MAIN GROUP* 🎓\n\n` +
        `👋 Hello / ආයුබෝවන් @${actualNumber},\n\n` +
        `Please follow these group guidelines to maintain a good learning environment.\n` +
        `කරුණාකර සමූහයේ යහපැවැත්ම උදෙසා පහත නීති මාලාව පිළිපදින්න.\n\n` +
        `*GROUP RULES / නීති මාලාව:*\n` +
        `1️⃣ Be respectful to everyone.\n(සියලුම සාමාජිකයින්ට ගෞරවයෙන් සලකන්න.)\n\n` +
        `2️⃣ 🚫 No Spamming or flooding messages.\n(අනවශ්‍ය පණිවිඩ යැවීමෙන් වළකින්න.)\n\n` +
        `3️⃣ 🚫 No unauthorized links (Other WhatsApp groups, Telegram, Scam/Business links). Only educational links are allowed.\n(වෙනත් WhatsApp Group, Telegram හෝ ව්‍යාපාරික ලින්ක් දැමීම සපුරා තහනම්. අවසරලත් අධ්‍යාපනික ලින්ක් සඳහා පමණක් අවසර ඇත.)\n\n` +
        `4️⃣ 🎓 For further questions regarding student loans, please contact the group admins. Please watch the YouTube playlist below for more information.\n(ශිෂ්‍ය ණය පිළිබඳ වැඩිදුර ප්‍රශ්න සඳහා සමූහයේ Admin වරුන් සම්බන්ධ කරගන්න. ණය පිළිබඳ සියලුම තොරතුරු දැනගැනීමට පහත YouTube Playlist එක අනිවාර්යයෙන්ම නරඹන්න.)\n` +
        `📺 *YouTube Playlist:* https://youtube.com/playlist?list=PL-ZbzAh0pKykpa-odcUrDEg94PBbTQp9M&si=F9L3Spy-pLZJq31n\n\n` +
        `⚠️ *Note:* Breaking these rules will result in an automatic permanent ban by the system.\n(මෙම නීති කඩකරන අයව පද්ධතිය මගින් ස්වයංක්‍රීයව සමූහයෙන් ඉවත් කරනු ලැබේ.)\n\n` +
        `Thank you! / ස්තූතියි!\n` +
        `🤖 _System Generated Message. Please do not reply._`;

    const secondMsg =
        `🤖 *Smart Bot Commands IFSLS Group Only Don't Send Direct Message to this Number (ස්වයංක්‍රීය සහය)* 🤖\n\n` +
        `ළමයි ඔයාලට ශිෂ්‍ය ණය ගැන අවශ්‍ය මූලික තොරතුරු ක්ෂණිකව Bot හරහා දැන් ලබාගන්න පුළුවන්. ඒ සඳහා *Group එක ඇතුළට ගොස්* / type කරලා පහත Commands ටයිප් කරලා send කරන්න.\n\n` +
        `📌 */menu* - සියලුම විස්තර සහ Commands බලාගැනීමට.\n` +
        `📌 */about* - IFSLS ගැන විස්තර.\n` +
        `📌 */eligibility* - ණය ලබාගැනීමේ සුදුසුකම්.\n` +
        `📌 */stipend* - ශිෂ්‍යාධාර දීමනා පිළිබඳව.\n` +
        `📌 */conditions* - Degree හදාරන කාලය තුලදි පිලිපැදිය යුතු නීති.\n` +
        `📌 */applycenters* - Apply කීරිමේ මධ්‍යස්ථාන පිළිබඳ විස්තර.\n` +
        `📌 */applysteps* - අයදුම් කිරීමේ පියවර.\n` +
        `📌 */afterapplysteps* - අයදුම් කිරීමෙන් පසු පියවර.\n` +
        `📌 */ministrycontact* - Ministry Department එක contact කර ගැනීම සදහා\n\n` +
        `✅ */results* - IFSLS selection results check කරන ආකාරය \n\n` +
        `📌 */onlinecertificate* - O/L & A/L Exam Certificates Online ගෙන්වා ගැනීම සදහා\n` +
        `📌 */coursechange* - Course Change Letter Format\n` +
        `📌 */affidavit* - දිවුරුම් ප්‍රකාශයක් ලබා ගැනීම සදහා\n` +
        `📌 */ugccancel* - UGC Registration Cancel කිරීම සදහා\n` +
        `📌 */laptopguide* - Degree එකට හරියන Laptop Buying Guide\n` +
        `📌 */jobs* - Internships සහ Jobs විස්තර\n` +
        `📌 */boarding* - බෝඩිම් / Accommodation Web & Video\n\n` +
        `📄 *Guide Books (භාෂා 3):*\n` +
        `🇱🇰 */guidepdf-si* (සිංහල මාර්ගෝපදේශකය)\n` +
        `🌍 */guidepdf-ta* (දෙමළ මාර්ගෝපදේශකය)\n` +
        `🇬🇧 */guidepdf-en* (ඉංග්‍රීසි මාර්ගෝපදේශකය)\n\n` +
        `🏫 *කැම්පස් වල ඔයාලට දෙන Degrees වලට අදාල විස්තර බලාගන්න අවශ්‍යනම් කැම්පස් එකේ නමට කලින් / දාලා campus නම ගෲප් එකට සෙන්ඩ් කරන්න.*\n` +
        `(උදාහරණ: */sliit*, */nsbm*, */cinec*, */saegis*)\n\n` +
        `💡 *දැන්ම Group එකට ගිහින් /menu කියලා Type කරලා බලන්නකො ළමයි!* 😎`;

    return { firstMsg, secondMsg };
}

function enqueueWelcomeUser(userId, actualNumber, name) {
    if (!userId || queuedWelcomeUsers.has(userId)) return;

    const initialDelayMs = Math.floor(Math.random() * (60 - 30 + 1) + 30) * 60 * 1000;
    const sendAfter = Date.now() + initialDelayMs;

    queuedWelcomeUsers.add(userId);
    welcomeQueue.push({
        userId,
        actualNumber,
        name,
        sendAfter
    });

    console.log(`⏳ [WELCOME QUEUE] ${name} (${actualNumber}) queued. Will start in ~${Math.round(initialDelayMs / 60000)} mins.`);
    processWelcomeQueue();
}

async function processWelcomeQueue() {
    if (isProcessingWelcomeQueue) return;
    isProcessingWelcomeQueue = true;

    try {
        while (welcomeQueue.length > 0) {
            const task = welcomeQueue[0];
            const now = Date.now();

            if (now < task.sendAfter) {
                await new Promise(resolve => setTimeout(resolve, 30000));
                continue;
            }

            try {
                const chat = await client.getChatById(task.userId);
                const { firstMsg, secondMsg } = buildWelcomeMessages(task.actualNumber);

                if (chat && typeof chat.sendStateTyping === "function") {
                    try { await chat.sendStateTyping(); } catch (e) {}
                }
                await new Promise(resolve => setTimeout(resolve, 6000));
                await sendWithTimeout(client, task.userId, firstMsg, { mentions: [task.userId] }, 15000);
                console.log(`✅ First Welcome sent to: ${task.name} (${task.actualNumber})`);

                await new Promise(resolve => setTimeout(resolve, 5000));
                if (chat && typeof chat.sendStateTyping === "function") {
                    try { await chat.sendStateTyping(); } catch (e) {}
                }
                await new Promise(resolve => setTimeout(resolve, 6000));
                await sendWithTimeout(client, task.userId, secondMsg, {}, 15000);
                console.log(`✅ Second Welcome sent to: ${task.name} (${task.actualNumber})`);
            } catch (err) {
                console.log(`⚠️ Failed to send welcome to ${task.userId}:`, err.message || err);
            }

            welcomeQueue.shift();
            queuedWelcomeUsers.delete(task.userId);

            if (welcomeQueue.length > 0) {
                const nextGapMs = Math.floor(Math.random() * (12 - 5 + 1) + 5) * 60 * 1000;
                console.log(`💤 [WELCOME QUEUE] Waiting ~${Math.round(nextGapMs / 60000)} mins before next welcome...`);
                await new Promise(resolve => setTimeout(resolve, nextGapMs));
            }
        }
    } finally {
        isProcessingWelcomeQueue = false;
    }
}

client.on("group_join", async (notification) => {
    try {
        cleanExpiredBans();

        const groupId = typeof notification.chatId === "object" ? notification.chatId._serialized : String(notification.chatId);
        if (!TARGET_GROUP_IDS.includes(groupId)) return;

        console.log(`\n📥 [GROUP JOIN DETECTED]`);
        console.log(`📍 Group: ${groupId}`);

        const users = notification.recipientIds || [];
        for (const userId of users) {
            if (client.info && client.info.wid && userId === client.info.wid._serialized) continue;

            const info = await getContactInfo(userId);
            if (!info) continue;

            console.log(`👤 New Member: ${info.name} (${info.actualNumber})`);

            let isBanned = false;
            const now = Date.now();

            for (let bannedId in blacklistedUsers) {
                if ((bannedId === userId || bannedId.includes(info.actualNumber)) && now < blacklistedUsers[bannedId]) {
                    isBanned = true;
                    break;
                }
            }

            if (isBanned) {
                await client.sendMessage(groupId, `🚫 @${userId.split("@")[0]} (*${info.name}*), ඔබට තවමත් මෙම සමූහයට සම්බන්ධ වීමට කාලය පැමිණ නැත (ඔබගේ Ban කාලය තවම අවසන් වී නැත).`, { mentions: [userId] });
                await directRemoveParticipant(groupId, userId);
                continue;
            }

            if (!isSriLankan(info.actualNumber)) {
                await client.sendMessage(groupId, `🌍 @${userId.split("@")[0]} (*${info.name}*) Sorry, only Sri Lankan numbers (+94) are allowed in this group. You will be removed.`, { mentions: [userId] });
                await directRemoveParticipant(groupId, userId);
                continue;
            }

            enqueueWelcomeUser(userId, info.actualNumber, info.name);
        }
    } catch (error) {
        console.log("⚠️ Error in group_join event:", error);
    }
});

async function checkIsAdmin(message, senderId, actualNumber) {
    try {
        const authorId = message.author || message.from || senderId || "";
        const pureNumber = authorId.replace(/\D/g, "");

        const isExtra = EXTRA_ADMINS.some(adminNum =>
            pureNumber.includes(adminNum) ||
            adminNum.includes(pureNumber) ||
            (actualNumber && actualNumber.includes(adminNum))
        );
        if (isExtra) return true;

        const chat = await message.getChat();
        if (chat && chat.participants) {
            const participant = chat.participants.find(p => {
                const pSerialized = p.id._serialized || "";
                const pUser = p.id.user || "";
                return pSerialized.includes(pureNumber) || pureNumber.includes(pUser) || (actualNumber && pSerialized.includes(actualNumber));
            });
            if (participant && (participant.isAdmin || participant.isSuperAdmin)) return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

client.on("message", async (message) => {
    try {
        if (!message || message.fromMe || message.from === "status@broadcast") return;

        const msgText = message.body ? message.body.trim() : "";
        const textLower = msgText.toLowerCase();

        let chat = null;
        let isGroupChat = typeof message.from === "string" && message.from.endsWith("@g.us");
        try {
            chat = await message.getChat();
            if (chat && typeof chat.isGroup === "boolean") {
                isGroupChat = chat.isGroup;
            }
        } catch (chatErr) {
            isGroupChat = typeof message.from === "string" && message.from.endsWith("@g.us");
        }

        // ==========================================
        // 📩 SAFE PM / INBOX AUTO-REPLY (24h Cooldown)
        // ==========================================
        if (!isGroupChat && !(typeof message.from === "string" && message.from.endsWith("@g.us"))) {
            const senderId = message.from;
            const now = Date.now();
            const pmCooldownMs = 24 * 60 * 60 * 1000;

            if (pmRepliedUsers.has(senderId) && (now - pmRepliedUsers.get(senderId) < pmCooldownMs)) {
                return;
            }

            const recentPms = (pmCooldownTimestamps.get(senderId) || []).filter(ts => now - ts < 60 * 1000);
            recentPms.push(now);
            pmCooldownTimestamps.set(senderId, recentPms);
            if (recentPms.length > 3) {
                console.log(`⚠️ [PM RATE LIMIT] Throttling rapid PMs from ${senderId}`);
                return;
            }

            const typingDelay = Math.floor(Math.random() * (8000 - 4000 + 1)) + 4000;
            if (chat && typeof chat.sendStateTyping === "function") {
                try { await chat.sendStateTyping(); } catch (e) {}
            }
            await new Promise(resolve => setTimeout(resolve, typingDelay));

            const pmReplyText =
                `ආයුබෝවන්! IFSLS Group එක සමග සම්බන්ධ වීමට ස්තුතියි ඔයාට . 👋💙\n\n` +
                `⚠️ කරුණාකර මෙම අංකයට පෞද්ගලික පණිවිඩ හා ණය පිලිබද විස්තර (Inbox/Direct Messages) එවීමෙන් වළකින්න.\n\n` +
                `ශිෂ්‍ය ණය (IFSLS) පිළිබඳ ඕනෑම ඔබට ඇති ඔනම ප්‍රශ්නයක් අපේ *IFSLS Main Group* එක ඇතුළට ගිහින් */menu* කියලා ටයිප් කරලා ලබා ගන්න පුළුවන් ලමයි නැත්නම් group admin කෙනෙක් හා සම්බන්ධ වෙන්න පුලුවන්! 😊`;

            await message.reply(pmReplyText);
            pmRepliedUsers.set(senderId, now);
            console.log(`📩 [SAFE PM AUTO-REPLY] Sent once (24h cooldown) to ${senderId}`);
            return;
        }

        // ==========================================
        // 🤖 AI ASSISTANT (/ai or @mention)
        // ==========================================
        const isMentioned = message.mentionedIds && client.info?.wid && message.mentionedIds.includes(client.info.wid._serialized);
        if (textLower.startsWith("/ai") || isMentioned) {
            if (!groqApiKey) {
                await message.reply("⚠️ AI service එක දැනට configure කර නැත (GROQ_API_KEY missing).");
                return;
            }

            let query = msgText.replace(/^\/ai\s*/i, "").replace(/@\d+/g, "").trim();
            if (!query) query = "Hello, can you help me with student loan details?";

            const isSinhala = /[\u0D80-\u0DFF]/.test(query);
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
                        { role: "user", content: query }
                    ]
                });
                const replyText = completion.choices[0]?.message?.content || "⚠️ සමාවෙන්න මට මේ මොහොතේ උත්තර ලබා දීමට නොහැකි විය.";
                await message.reply(replyText);
            } catch (err) {
                console.error("Groq Error:", err?.message || err);
                await message.reply("⚠️ සමාවෙන්න මට මේ මොහොතේ උත්තර ලබා දීමට නොහැකි විය.");
            }
        }
    } catch (err) {
        console.error("Message handler error:", err);
    }
});

client.on("message_create", async (message) => {
    try {
        const msgText = message.body ? message.body.trim() : "";
        const textLower = msgText.toLowerCase();

        if (textLower.startsWith("/broadcast") || textLower.startsWith("/boradcast")) {
            const rawSender = message.author || message.from || "";
            const senderDigits = rawSender.replace(/\D/g, "");

            let contactDigits = "";
            try {
                const contact = await message.getContact();
                contactDigits = (contact.number || contact.id.user || "").replace(/\D/g, "");
            } catch (err) {}

            console.log(`[BROADCAST ATTEMPT] SenderDigits: ${senderDigits} | ContactDigits: ${contactDigits}`);

            const HARDCODED_ADMIN_LIDS = ["168182413316185"];

            const isAdmin = HARDCODED_ADMIN_LIDS.includes(senderDigits) ||
                            HARDCODED_ADMIN_LIDS.includes(contactDigits) ||
                            EXTRA_ADMINS.some(admin => {
                                const adminClean = admin.replace(/\D/g, "");
                                return adminClean === senderDigits || adminClean === contactDigits;
                            });

            if (!isAdmin) {
                console.log("❌ [BROADCAST DENIED] Not authorized.");
                return;
            }

            console.log("✅ [BROADCAST AUTHORIZED] Sending update to groups...");

            const textToSend = `📢🎓 *IFSLS 11th INTAKE – BOT & IMPORTANT UPDATES* 🎓📢

ළමයි, Interviews අවසන් වීමත් සමඟ අපේ Smart Bot එකට අලුත් features සහ වැදගත් updates කිහිපයක් එකතු කරලා තියෙනවා! 🎉

✨ *අලුත් Updates මොනවද?*
📊 */results* – Selection Results Portal link එක සහ Intake 11 ප්‍රතිඵල (2026 දෙසැම්බර් මස බලාපොරොත්තු වන) පිළිබඳ විස්තර.
📌 */specialnotes* – Interviews වලින් පසු Selection Results, Physical Registration සහ Appeals (අභියාචනා) ගැන වැදගත් උපදෙස්.
🤖 */ai* (හෝ @mention) – ශිෂ්‍ය ණය (IFSLS) ගැන ඔයාලගේ ප්‍රශ්න වලට AI assistant හරහා පිළිතුරු ලබාගැනීමේ පහසුකම.
🛡️ *Safe System & Anti-Spam* – Group එකේ  ආරක්ෂාව වෙනුවෙන් anti-spam සහ safe messaging rules තවදුරටත් වැඩිදියුණු කර ඇත.

💬 *කොහොමද පාවිච්චි කරන්නේ?*
• Group එක ඇතුළේ /menu කියලා type කරලා සියලුම commands බලාගන්න පුලුවන්.
• ප්‍රශ්නයක් අහන්න ඕන නම් /ai [ඔයාගේ ප්‍රශ්නය] ලෙස type කරන්න (Ai limitations ඇති නිසා අනවශ්‍ය ලෙස එක දිගට messages යැවීමෙන් වළකින්න ⚠️).

📩 Ministry එකෙන් එන Emails (Inbox + Spam) නිතර check කරන්න, නිල නිවේදන පමණක් විශ්වාස කරන්න! ✅
📩 final results ලැබෙන තුරු තමාගේ personal details campus එක හරහා direct හුවමාරු කර ගැනීමෙන් වලකින්න!

🎓 *IFSLS STUDENT ADMIN COMMUNITY*`;

            let count = 0;
            for (const groupId of TARGET_GROUP_IDS) {
                try {
                    console.log(`📤 [BROADCAST] Sending to ${groupId}...`);
                    await sendWithTimeout(client, groupId, textToSend, { sendSeen: false }, 15000);
                    count++;
                    console.log(`✅ [BROADCAST] Sent to ${groupId} (Total: ${count})`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                } catch (err) {
                    console.error(`❌ [BROADCAST ERROR] Group: ${groupId}`, err);
                }
            }

            await message.reply(`✅ *Broadcast Complete!* Message sent to ${count}/${TARGET_GROUP_IDS.length} groups.`);
            return;
        }

        const groupId = message.fromMe ? message.to : message.from;
        if (!groupId || !groupId.endsWith("@g.us")) return;
        if (!TARGET_GROUP_IDS.includes(groupId)) return;
        if (message.fromMe) return;

        const senderId = message.author || message.from;
        const info = await getContactInfo(senderId);
        if (!info) return;

        const isAdmin = await checkIsAdmin(message, senderId, info.actualNumber);

        console.log("\n----------------------------------------");
        console.log(`📩 Group ID : ${groupId}`);
        console.log(`👤 Name     : ${info.name} (${info.actualNumber})`);
        console.log(`👑 Is Admin : ${isAdmin}`);
        console.log(`💬 Type     : ${message.type}`);
        console.log(`💬 Message  : ${message.body || "[Media / Sticker / Invite]"}`);
        console.log("----------------------------------------");

        const isSticker = message.type === "sticker";
        const isGif = message.isGif || (message.type === "video" && message._data && message._data.isGif);

        if (isSticker || isGif) {
            if (isAdmin) {
                console.log("👑 Admin sent a Sticker/GIF. Allowed.");
                return;
            }

            const warningKey = `${groupId}_${senderId}`;

            if (!stickerWarnings[warningKey]) {
                stickerWarnings[warningKey] = 1;

                const warningMsg = `⚠️ @${senderId.split("@")[0]}, මෙම සමූහය තුළ සාමාජිකයන් සදහා කරදරකාරී වන Stickers හෝ GIFs භාවිතය සිමා කර ඇත!\n\n` +
                                   `📌 මෙය ඔබගේ **පළමු සහ අවසන් අනතුරු ඇඟවීමයි**. නැවත වතාවක් යොමු කලහොත් ඔබව සමූහයෙන් Automatically ඉවත් වෙනු ලැබේ.`;

                await client.sendMessage(groupId, warningMsg, { mentions: [senderId] });
            } else {
                const removeMsg = `🚫 @${senderId.split("@")[0]} අනතුරු ඇඟවීම නොතකා නැවත Stickers/GIFs දැමූ නිසා සමූහයෙන් ඉවත් කර පැය 24 කට තහනම් කරන ලදී.`;
                await client.sendMessage(groupId, removeMsg, { mentions: [senderId] });

                await directRemoveParticipant(groupId, senderId);

                const BAN_DURATION_24H = 24 * 60 * 60 * 1000;
                blacklistedUsers[senderId] = Date.now() + BAN_DURATION_24H;
                if (typeof saveBlacklist === "function") saveBlacklist();

                delete stickerWarnings[warningKey];
            }
            return;
        }

        if (info.actualNumber && !isSriLankan(info.actualNumber)) {
            const removed = await directRemoveParticipant(groupId, senderId);
            if (removed) {
                blacklistedUsers[senderId] = Date.now() + BAN_DURATION_MS;
                if (info.actualId) blacklistedUsers[info.actualId] = Date.now() + BAN_DURATION_MS;
                saveBlacklist();
                await client.sendMessage(groupId, `🌍 @${senderId.split("@")[0]} (*${info.name}*) Sorry, only Sri Lankan numbers (+94) are allowed in this group. You will be removed.`, { mentions: [senderId] });
            }
            return;
        }

        const isNativeGroupInvite = message.type === "group_invite";
        const strictLinkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|lk|org|net|gov|edu|io|me|info|co|biz|xyz|app|dev)(\/[^\s]*)?|chat\.whatsapp\.com\/[^\s]+)/i;
        const hasLinkIndicator = isNativeGroupInvite || strictLinkRegex.test(message.body || "");

        if (hasLinkIndicator) {
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
                const isAllowedMinistry = textLower.includes("studentloans.mohe.gov.lk") || textLower.includes("mohe.gov.lk");
                const isAllowedFB = textLower.includes("facebook.com") || textLower.includes("fb.watch") || textLower.includes("fb.me");

                const isAllowedEducationalLink = isAllowedYT || isAllowedDrive || isAllowedZoom || isAllowedTeams || isAllowedDocs || isAllowedForms || isAllowedClassroom || isAllowedMinistry || isAllowedFB;

                const scamOrBusinessKeywords = ["earn money", "crypto", "forex", "business", "job opportunity", "free cash", "marketing", "signals", "trading", "invest", "lottery", "win cash", "fast money", "income"];
                const containsScamOrBusiness = scamOrBusinessKeywords.some(keyword => textLower.includes(keyword));

                let shouldBlock = false;
                if (isTelegramLink) shouldBlock = true;
                else if (containsScamOrBusiness) shouldBlock = true;
                else if (isWhatsAppGroupLink) shouldBlock = true;
                else if (!isAllowedEducationalLink) shouldBlock = true;

                if (shouldBlock) {
                    try { await message.delete(true); } catch (e) {}

                    let warnings = linkWarningTracker.get(senderId) || 0;
                    warnings++;
                    linkWarningTracker.set(senderId, warnings);

                    if (warnings === 1) {
                        const warningMsg = `⚠️ @${senderId.split("@")[0]} (*${info.name}*)\n` +
                                           `මෙම කණ්ඩායම තුළ වෙනත් WhatsApp Group ලින්ක්, ටෙලිග්‍රෑම් ලින්ක් හෝ ව්‍යාපාරික දේවල් Share කිරීම තහනම්! ඔයාට group link share කරගන්න අවශ්‍යනම් group admin කෙනෙක් හරහා යොමු කරන්න 🤠.\n\n` +
                                           `මෙය ඔබගේ *පළමු අවවාදයයි*. නැවත දැමුවහොත් ගෲප් එකෙන් ඉවත් කරනු ලැබේ කරුණාකර link එක group එකෙන් ඉවත් කරගන්න. 🚫\n\n` +
                                           `ඔබට මෙම සමූහය සඳහා අවසර ඇති links වනුයේ පහත සඳහන් links පමණී:\n` +
                                           `• studentloans.mohe.gov.lk\n` +
                                           `• youtube.com\n` +
                                           `• drive.google.com\n` +
                                           `• zoom.us\n` +
                                           `• teams.microsoft.com\n` +
                                           `• docs.google.com\n` +
                                           `• forms.gle\n` +
                                           `• classroom.google.com\n` +
                                           `• facebook.com`;

                        await client.sendMessage(groupId, warningMsg, { mentions: [senderId] });
                    } else {
                        const removed = await directRemoveParticipant(groupId, senderId);
                        if (removed) {
                            blacklistedUsers[senderId] = Date.now() + BAN_DURATION_MS;
                            if (info.actualId) blacklistedUsers[info.actualId] = Date.now() + BAN_DURATION_MS;
                            saveBlacklist();
                            if (ENABLE_AUTO_REMOVE) {
                                await client.sendMessage(groupId, `🚫 @${senderId.split("@")[0]} (*${info.name}*) අවවාද නොතකා නැවත තහනම් ලින්ක් දැමූ නිසා පැය 24කට ගෲප් එකෙන් ඉවත් කරන ලදී.`, { mentions: [senderId] });
                            }
                        }
                    }
                    return;
                }
            }
        }

        const containsBadWord = BAD_WORDS.some(word => textLower.includes(word.toLowerCase()));
        if (containsBadWord) {
            if (!isAdmin) {
                try { await message.delete(true); } catch (e) {}
                let warnings = badWordWarningTracker.get(senderId) || 0;
                warnings++;
                badWordWarningTracker.set(senderId, warnings);

                if (warnings === 1) {
                    await client.sendMessage(groupId, `⚠️ @${senderId.split("@")[0]} (*${info.name}*)\nමෙම කණ්ඩායම තුළ අපහාසාත්මක හෝ තහනම් වචන භාවිතය තහනම්! මෙය ඔබගේ *පළමු අවවාදයයි*. නැවත එවැනි වචන භාවිත කළහොත් ගෲප් එකෙන් ඉවත් කරනු ලැබේ. 🤬`, { mentions: [senderId] });
                } else {
                    const removed = await directRemoveParticipant(groupId, senderId);
                    if (removed) {
                        blacklistedUsers[senderId] = Date.now() + BAN_DURATION_MS;
                        if (info.actualId) blacklistedUsers[info.actualId] = Date.now() + BAN_DURATION_MS;
                        saveBlacklist();
                        if (ENABLE_AUTO_REMOVE) {
                            await client.sendMessage(groupId, `🚫 @${senderId.split("@")[0]} (*${info.name}*) අවවාද නොතකා නැවත අපහාසාත්මක වචන භාවිත කළ නිසා පැය 24කට ගෲප් එකෙන් ඉවත් කරන ලදී.`, { mentions: [senderId] });
                        }
                    }
                }
            }
            return;
        }

        const isStatusMention = textLower.includes("mentioned this group") ||
                                textLower.includes("in a status") ||
                                textLower.includes("තත්වයක් තුළ මෙම සමූහය");

        if (isStatusMention) {
            if (!isAdmin) {
                try { await message.delete(true); } catch (e) {}

                const removed = await directRemoveParticipant(groupId, senderId);
                if (removed) {
                    blacklistedUsers[senderId] = Date.now() + BAN_DURATION_MS;
                    if (info.actualId) blacklistedUsers[info.actualId] = Date.now() + BAN_DURATION_MS;
                    saveBlacklist();
                    if (ENABLE_AUTO_REMOVE) {
                        await client.sendMessage(groupId, `🚫 @${senderId.split("@")[0]} (*${info.name}*)\nGroup එක Status වල Mention කිරීම තහනම් බැවින් පැය 24කට ඔබව ඉවත් කරන ලදී.`, { mentions: [senderId] });
                    }
                }
                return;
            }
        }

        const msgCommand = textLower.trim();

        if (msgCommand === "/menu" || msgCommand === "/help") {
            const menuMsg = `*🎓 IFSLS 2026/27 සම්පූර්ණ තොරතුරු මෙනුව 🎓*\n\n` +
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

            await message.reply(menuMsg);
        }
        else if (ifslsAnswers[msgCommand]) {
            await message.reply(ifslsAnswers[msgCommand]);
        }
        else if (campusAnswers[msgCommand]) {
            await message.reply(campusAnswers[msgCommand]);
        }
        else if (msgCommand === "/guidepdf-si") {
            await client.sendMessage(groupId, "🇱🇰 *IFSLS 2026/27 සිංහල මාර්ගෝපදේශක PDF එක පහත ලින්ක් එකෙන් ඩවුන්ලෝඩ් කරගන්න:*\n\nhttps://drive.google.com/file/d/122Q6dk3Q8mlM0yWTlzLVDqKyIH4KjSFG/view?usp=sharing");
        }
        else if (msgCommand === "/guidepdf-ta") {
            await client.sendMessage(groupId, "🌍 *IFSLS 2026/27 தமிழ் வழிகாட்டி PDF ஐ கீழே உள்ள இணைப்பில் பதிவிறக்கம் செய்யவும்:*\n\nhttps://drive.google.com/file/d/1-AMByxSgGDfOwKE3mxTZgxvSSpBbtjOz/view?usp=sharing");
        }
        else if (msgCommand === "/guidepdf-en") {
            await client.sendMessage(groupId, "🇬🇧 *Download the IFSLS 2026/27 English Guide PDF from the link below:*\n\nhttps://drive.google.com/file/d/15eUJyKdYOcgeczEtkKXtwDucswSnJAUs/view?usp=sharing");
        }
        else if (msgCommand === "/deadline") {
            const deadlineDate = new Date("2026-09-27T23:59:59").getTime();
            const now = new Date().getTime();
            const timeLeft = deadlineDate - now;

            if (timeLeft > 0) {
                const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
                const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

                const countdownMsg = `⏳ *IFSLS 11th Intake Application Deadline*\n\n` +
                                     `අයදුම්පත් භාරගන්නා අවසන් දිනයට තව:\n` +
                                     `*දින ${days}යි, පැය ${hours}යි, විනාඩි ${minutes}යි, තත්පර ${seconds}යි!* 🏃‍♂️💨\n\n` +
                                     `ඉක්මන් කරන්න! අවසන් මොහොත වෙනකන් ඉන්න එපා. අදම අයදුම් කරන්න. ✅`;

                await message.reply(countdownMsg);
            } else {
                await message.reply("🚫 *IFSLS 11th Intake සඳහා අයදුම්පත් භාරගන්නා කාලය දැන් අවසන් වී ඇත!*");
            }
        }

        await checkSpam(message, senderId, info.name, groupId);

    } catch (error) {
        console.error("message_create error:", error);
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
        const removed = await directRemoveParticipant(groupId, senderId);
        if (removed) {
            blacklistedUsers[senderId] = Date.now() + BAN_DURATION_MS;
            const info = await getContactInfo(senderId);
            if (info && info.actualId) blacklistedUsers[info.actualId] = Date.now() + BAN_DURATION_MS;
            saveBlacklist();
            if (ENABLE_AUTO_REMOVE) {
                await client.sendMessage(groupId, `🚨 @${senderId.split("@")[0]} (*${name}*) has been temporarily removed for Detected SPAMMING for rejoining please contact group admins after 24hours (24h ban).`, { mentions: [senderId] });
            }
        }
    }
}

// ==========================================
// 📌 LOAD GUIDES & INITIALIZE BOT
// ==========================================
loadGuides().then(async () => {
    await client.initialize();
    console.log("ℹ️ client.initialize() promise resolved");
});
