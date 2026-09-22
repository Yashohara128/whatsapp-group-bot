const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const cron = require("node-cron"); 
const fs = require("fs"); 
const path = require("path");

const TARGET_GROUP_IDS = [
    "120363427144307038@g.us",
    "120363428845309010@g.us",
    "120363431402119738@g.us"
];

const CHROME_PATH = "/usr/bin/chromium-browser";
const ENABLE_AUTO_REMOVE = true;
const SPAM_WINDOW_MS = 10 * 1000;
const SPAM_LIMIT = 6;
const BAD_WORDS = ["hutto", "uba", "thopi", "pakyala","palayan","pnnyo"]; 

// ⏳ බෑන් වන කෙනෙකුට නැවත ජොයින් වීමට ගත විය යුතු කාලය (පැය 24ක් ලෙස සකසා ඇත)
const BAN_DURATION_MS = 24 * 60 * 60 * 1000; 

// ==========================================
// 🎓 1. IFSLS පොදු ප්‍රශ්න සහ පිළිතුරු (FAQs)
// ==========================================
const ifslsAnswers = {
    "/about": "🎓 *IFSLS යනු කුමක්ද?*\nමෙය ශ්‍රී ලංකා රජය මගින් රාජ්‍ය නොවන විශ්වවිද්‍යාල වල උපාධියක් හැදෑරීම සඳහා සිසුන්ට ලබාදෙන 100% ක් පොලී රහිත ශිෂ්‍ය ණය යෝජනා ක්‍රමයකි.",
    "/ministrycontact": "✅ *ඔයාට ministry department එක සම්බන්ධ කරගන්න අවශ්‍යනම් පහත දුරකථන අංක භාවිතා කරන්න පුලුවන්*\n011 2879727\n070 3555970\n070 3555971\n070 3555972\n070 3555973\n070 3555974\n070 3555975\n070 3555976\n070 3555977\n070 3555978\n070 3555979",
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
    
    "/private": "👤 *Private Candidates (පෞද්ගලික අයදුම්කරුවන්):*\nපෞද්ගලිකව උසස් පෙළ පෙනී සිටි අයදුම්කරුවන්, පාසලේ අස්වීමේ සහතිකය වෙනුවට 'ග්‍රාම නිලධාරී සහතික කළ (ප්‍රාදේශීය ලේකම් අනුමත කළ) චරිත සහතිකයක්' හෝ 'සාම විනිසුරුවරයෙකුගෙන් (JP) ලබාගත් චරිත සහතිකයක්' සම්මුඛ පරීක්ෂණයේදී ඉදිරිපත් කළ යුතුය.",
    "/documents": "📂 *ඉන්ටවිව් එකට රැගෙන යා යුතු ලියකියවිලි (Originals):*\n1. ජාතික හැඳුනුම්පත (NIC)\n2. උප්පැන්න සහතිකය\n3. O/L සහ A/L සහතික(Z score සහිත)\n4. Online Application එකේ Print Out එක (විදුහල්පති සහතික කරන ලද)\n5.පාසලේ අස්වීමේ සහතිකය (හෝ Private අයගේ චරිත සහතිකය) \n6.Bridging Courses Results(Bridging කරලා තියනවනම්)\n7.Course Changing Letter(Courses Change කරනවනම්)",
    "/applysteps": "📝 *අයදුම් කරන ආකාරය:*\n1. https://studentloans.mohe.gov.lk/loan_application/ වෙත පිවිසෙන්න.\n2. NIC අංකයෙන් Register වෙන්න.\n3. O/L, A/L ප්‍රතිඵල සහ පෞද්ගලික විස්තර පුරවන්න.\n4. ඔබට අවශ්‍ය කැම්පස් සහ උපාධි කැමැත්තේ අනුපිළිවෙලට (Preferences) තෝරන්න.\n5. තහවුරු කර Submit කර, Application එක Print කරගන්න.",
    "/afterapplysteps": "🎓 *අයදුම් කළ පසු ඊළඟ පියවර (After Apply Steps):*\n\n" +
                        "1️⃣ *සම්මුඛ පරීක්ෂණයට කැඳවීම:* අයදුම්පත්‍ර භාරගැනීම අවසන් වී මාසයක් ඇතුළත, සුදුසුකම් ලැබූ සිසුන්ට Online Interview එක සඳහා Email එකක් මගින් දැනුම් දෙනු ලැබේ. තේරුණු සිසුන්ගේ නාමලේඛනය studentloans.mohe.gov.lk වෙබ් අඩවියේ පළ කෙරේ.\n\n" +
                        "2️⃣ *Interview එකට සූදානම් වීම:* Online Interview එකට පෙර අවශ්‍ය ලියකියවිලි වල (Application එකේ මුද්‍රිත පිටපත, NIC, උප්පැන්න, O/L සහ A/L සහතික මුල් පිටපත්, පාසලේ අස්වීමේ සහතිකය, ග්‍රාම නිලධාරී සහතිකය ආදී) Scan කොපි අමාත්‍යාංශයෙන් දෙන Email එකට යැවිය යුතුය.\n\n" +
                        "3️⃣ *පාඨමාලාවට තේරී පත්වීම:* Interview එකෙන් පසු තේරී පත් වූ උපාධිය සහ කැම්පස් එක වෙබ් අඩවියේ පළ කරන අතර, කැම්පස් එකේ Physical ලියාපදිංචි වන දිනය Email එකක් මගින් දැනුම් දෙනු ඇත.\n\n" +
                        "4️⃣ *අභියාචනා (Appeals):* තේරීම් ප්‍රතිඵල ආවට පස්සේ මොකක් හරි වෙනසක් කරගන්න (Course/Campus මාරු කරගන්න) ඕන නම්, ප්‍රතිඵල ඇවිත් මාසයක් ඇතුළත වෙබ් අඩවිය හරහා අභියාචනයක් දාන්න පුළුවන්.",

    "/specialnotes": "📢🎓 *IFSLS 11th INTAKE – INTERVIEW IMPORTANT NOTICE* 🎓📢\n\n" +
                     "IFSLS 11th Intake සඳහා අයදුම් කර ඇති සියලුම සිසුන්ගේ අවධානයටයි.\n" +
                     "Interview එක සම්බන්ධයෙන් පහත පියවර පිළිවෙලට මතක තබාගන්න. 👇✨\n\n" +
                     "━━━━━━━━━━━━━━━━━━\n\n" +
                     "📩 *FIRST – CONFIRMATION EMAIL*\n\n" +
                     "මුලින්ම Ministry එකෙන් Interview Confirmation Email එකක් ලැබෙනවා. 📬\n\n" +
                     "👉 Email එක හොඳින් කියවන්න.\n" +
                     "👉 ලබා දී ඇති instructions අනිවාර්යයෙන් follow කරන්න. ✅\n" +
                     "👉 Online / Physical Interview සඳහා option එකක් ලබා දී තිබේ නම්, තමන්ට අවශ්‍ය option එක select කර confirm කරන්න.\n" +
                     "👉 ⏰ Email එකේ සඳහන් DEADLINE එකට පෙර confirmation එක අනිවාර්යයෙන් complete කරන්න.\n\n" +
                     "🚨 ⚠️ DEADLINE එක miss කරන්න එපා! ⚠️\n" +
                     "📌 Confirmation එක complete කළ බව නැවතත් check කරගන්න. ✅\n\n" +
                     "━━━━━━━━━━━━━━━━━━\n\n" +
                     "📩 *SECOND – DATE & TIME EMAIL*\n\n" +
                     "Confirmation එක complete කළාට පසුව, Interview එකට අදාළ Date, Time සහ අනෙකුත් instructions ඇතුළත් දෙවන Email එක ලැබෙනවා. 📅⏰\n\n" +
                     "💻 Online Interview නම්:\n" +
                     "🔗 Email එකේ ලබා දී ඇති platform / link එක හරහා interview එකට join වෙන්න.\n\n" +
                     "🏢 Physical Interview නම්:\n" +
                     "📍 Email එකේ ලබා දී ඇති Ministry location, Date සහ Time අනුව physically attend වෙන්න.\n\n" +
                     "📌 Date, Time සහ Online Link / Physical Location එක save කරගන්න. 💾\n\n" +
                     "━━━━━━━━━━━━━━━━━━\n\n" +
                     "📑 *DOCUMENTS – කලින්ම සූදානම් කරගන්න*\n\n" +
                     "📋 පහත documents කලින්ම සූදානම් කරගෙන සිටීම වැදගත්:\n\n" +
                     "🪪 NIC / Passport\n" +
                     "📜 Original Birth Certificate\n" +
                     "📜 Original G.C.E. A/L Certificate\n" +
                     "📜 Original G.C.E. O/L Certificate\n" +
                     "🏫 School Leaving Certificate\n" +
                     "📄 Grama Niladhari (GN) Certificate\n" +
                     "📝 Printed Application Copy + Principal’s Certificate\n" +
                     "📊 Bridging Course Result – applicable නම්\n" +
                     "📄 Course Changing Letter – applicable නම්\n\n" +
                     "💻 Online Interview නම්:\n" +
                     "Required documents වල scanned copies, Ministry එකෙන් ලබා දෙන official instructions අනුව සඳහන් කර ඇති email address එකට submit කරන්න. 📧\n\n" +
                     "🏢 Physical Interview නම්:\n" +
                     "Email එකේ සඳහන් කර ඇති required original documents සමඟ interview එකට සහභාගී වන්න. 📑\n\n" +
                     "━━━━━━━━━━━━━━━━━━\n\n" +
                     "⚠️📌 *IMPORTANT REMINDER*\n\n" +
                     "📩 Ministry එකෙන් ලැබෙන emails නිතර check කරන්න.\n" +
                     "📂 Inbox + Spam/Junk folders ද පරීක්ෂා කරන්න.\n" +
                     "⏰ Confirmation Deadline එක අනිවාර්යයෙන් මතක තබාගන්න.\n" +
                     "📌 Ministry එකෙන් ලබා දෙන latest official instructions පමණක් follow කරන්න. ✅\n\n" +
                     "━━━━━━━━━━━━━━━━━━\n\n" +
                     "🎓🌟 *ALL THE VERY BEST FOR YOUR IFSLS INTERVIEW!* 🌟🎓\n\n" +
                     "ඔබ සියලු දෙනාටම සාර්ථක Interview එකක් සහ සුභ අනාගතයක් ප්‍රාර්ථනා කරනවා! ❤️✨\n\n" +
                     "GOOD LUCK & ALL THE BEST! 🍀🎓❤️\n\n" +
                     "IFSLS STUDENT COMMUNITY",
    
    "/deadline": "⏰ *අවසන් දිනය:*\n2026 සැප්තැම්බර් 27 දින මධ්‍යම රාත්‍රී 12.00 ට පෙර Online හරහා අයදුම්පත් යොමු කළ යුතුය."
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
              "  *(සටහන: ඕනෑම අංශයකින් 'S' 3ක් ඇති අය සා/පෙළ ගණිතය 'C' සාමාර්ථයක් ලබා තිබිය යුතු අතර, ඈඳුනු පාඨමාලාවක් (Bridging Course) සමත් විය යුතුය).*",
    
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

    "/saegis":"🎓 *SAEGIS Campus*\n\n" +
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
               "  *(සටහන: ඕනෑම අංශයකින් 'S' 3ක් ඇති අය සා/පෙළ ගණිතය 'C' සාමාර්ථයක් ලබා තිබිය යුතු අතර, ඈඳුනු පාඨමාලාවක් සමත් විය යුතුය).*",

    "/icbt": "🎓 *ICBT Campus*\n\n" +
             "📊 *Faculty of Business*\n" +
             "• Bachelor of Business Management Honours\n" +
             "  ✔️ *උ/පෙළ:* වාණිජ අංශයෙන් 'S' 3ක් *හෝ* ආර්ථික විද්‍යාව ඇතුළුව ඕනෑම අංශයකින් 'S' 3ක්.\n" +
             "  ✔️ *සා/පෙළ:* ගණිතය සඳහා අවම 'S' සාමාර්ථයක්.\n\n" +
             "💻 *Faculty of Computing*\n" +
             "• BSc Honours in Software Engineering / IT (Cyber Security / Data Science / AI)\n" +
             "  ✔️ *උ/පෙළ:* භෞතික විද්‍යා හෝ ඉංජිනේරු තාක්ෂණ අංශයෙන් 'S' 3ක්.\n" +
             "  *(සටහන: ඕනෑම අංශයකින් 'S' 3ක් ඇති අය සා/පෙළ ගණිතය 'C' සාමාර්ථයක් ලබා තිබිය යුතු අතර, ඈඳුනු පාඨමාලාවක් සමත් විය යුතුය).*",
    
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
            "  *(සටහන: ඕනෑම අංශයකින් 'S' 3ක් ඇති අය සා/පෙළ ගණිතය 'C' සාමාර්ථයක් ලබා තිබිය යුතු අතර, ඈඳුනු පාඨමාලාවක් සමත් විය යුතුය).*",
    
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
             "  *(සටහන: ඕනෑම අංශයකින් 'S' 3ක් ඇති අය සා/පෙළ ගණිතය 'C' සාමාර්ථයක් ලබා තිබිය යුතු අතර, ඈඳුනු පාඨමාලාවක් සමත් විය යුතුය).*",

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
    } catch(e) { blacklistedUsers = {}; }
}

function saveBlacklist() {
    try {
        fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklistedUsers, null, 2));
    } catch(e) { }
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
        cleanExpiredBans(); 

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

            await new Promise(resolve => setTimeout(resolve, 3000));

            const secondWelcomeMsg = `🤖 *Smart Bot Commands (ස්වයංක්‍රීය සහය)* 🤖\n\n` +
                                     `ළමයි ඔයාලට ශිෂ්‍ය ණය ගැන අවශ්‍ය මූලික තොරතුරු ක්ෂණිකව Bot හරහා දැන් ලබාගන්න පුළුවන්. ඒ සඳහා *Group එක ඇතුළට ගොස්* / type කරලා පහත Commands ටයිප් කරලා send කරන්න.\n\n` +
                                     `📌 */menu* - සියලුම විස්තර සහ Commands බලාගැනීමට.\n` +
                                     `📌 */about* - IFSLS ගැන විස්තර.\n` +
                                     `📌 */eligibility* - ණය ලබාගැනීමේ සුදුසුකම්.\n` +
                                     `📌 */stipend* - ශිෂ්‍යාධාර දීමනා පිළිබඳව.\n` +
                                     `📌 */conditions* - Degree හදාරන කාලය තුලදි පිලිපැදිය යුතු නීති.\n` +
                                     `📌*/applycenters* - Apply කීරිමේ මධ්‍යස්ථාන පිලිබඳ විස්තර.\n` +
                                     `📌 */applysteps* - අයදුම් කිරීමේ පියවර.\n` +
                                     `📌 */afterapply* - අයදුම් කිරීමෙන් පසු.\n` +
                                     `📌 */ministrycontact* - Ministry Department එක contact කරන විදිහ\n\n` +
                                     `📄 *Guide Books (භාෂා 3න්ම):*\n` +
                                     `🇱🇰 */guidepdf-si* (සිංහල මාර්ගෝපදේශකය)\n` +
                                     `🌍 */guidepdf-ta* (දෙමළ මාර්ගෝපදේශකය)\n` +
                                     `🇬🇧 */guidepdf-en* (ඉංග්‍රීසි මාර්ගෝපදේශකය)\n\n` +
                                     `🏫 *කැම්පස් වල ඔයාලට දෙන Degrees වලට අදාල විස්තර බලාගන්න අවශ්‍යනම් කැම්පස් එකේ නමට කලින් / දාලා campus නම ගෲප් එකට සෙන්ඩ් කරන්න.*\n` +
                                     `(උදාහරණ: */sliit*, */nsbm*, */cinec*, */saegis*)\n\n` +
                                     `💡 *දැන්ම Group එකට ගිහින් /menu කියලා Type කරලා බලන්නකො ළමයි!* 😎`;

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
                const isAllowedMinistry = textLower.includes("studentloans.mohe.gov.lk") || textLower.includes("mohe.gov.lk") || textLower.includes("https://studentloans.mohe.gov.lk/loan_application/");
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
                            `📌*/applycenters* - Apply කීරිමේ මධ්‍යස්ථාන පිලිබඳ විස්තර.\n` +
                            `📝 */applysteps* - අයදුම් කරන පියවර\n` +
                            `📝 */afterapplysteps* - අයදුම් කිරීමෙන් පසු \n` +
                            `📌 */specialnotes* - interview සදහා වැදගත් වන විස්තර\n` +
                            `⏰ */deadline* - අවසන් දිනය\n` +
                            `✅ */ministrycontact* - Ministry Department එක contact කරන විදිහ\n\n` +
                            `*📄 මාර්ගෝපදේශක PDF (භාෂා 3න්ම):*\n` +
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
        // 📄 සිංහල Guide PDF (Google Drive Link)
        else if (msgCommand === "/guidepdf-si") {
            await client.sendMessage(groupId, "🇱🇰 *IFSLS 2026/27 සිංහල මාර්ගෝපදේශක PDF එක පහත ලින්ක් එකෙන් ඩවුන්ලෝඩ් කරගන්න:*\n\nhttps://drive.google.com/file/d/122Q6dk3Q8mlM0yWTlzLVDqKyIH4KjSFG/view?usp=sharing");
        }
        // 📄 දෙමළ Guide PDF (Google Drive Link)
        else if (msgCommand === "/guidepdf-ta") {
            await client.sendMessage(groupId, "🌍 *IFSLS 2026/27 தமிழ் வழிகாட்டி PDF ஐ கீழே உள்ள இணைப்பில் பதிவிறக்கம் செய்யவும்:*\n\nhttps://drive.google.com/file/d/1-AMByxSgGDfOwKE3mxTZgxvSSpBbtjOz/view?usp=sharing");
        }
        // 📄 ඉංග්‍රීසි Guide PDF (Google Drive Link)
        else if (msgCommand === "/guidepdf-en") {
            await client.sendMessage(groupId, "🇬🇧 *Download the IFSLS 2026/27 English Guide PDF from the link below:*\n\nhttps://drive.google.com/file/d/15eUJyKdYOcgeczEtkKXtwDucswSnJAUs/view?usp=sharing");
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
