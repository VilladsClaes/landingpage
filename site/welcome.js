// Velkomst på den besøgendes eget sprog.
// Sproget læses fra browserens indstillinger (navigator.languages) – der slås ikke
// IP-adresser op, og intet sendes nogen steder hen, før den besøgende selv trykker.
// Knappen oversætter siden direkte i browseren med Chromes indbyggede oversætter,
// og ellers åbnes Google Oversæt-udgaven af siden.

const TEXTS = {
  en: { hi: "Welcome!", msg: "This site is in Danish. Your browser can translate it for you.", btn: "Translate to English", close: "Close", busy: "Translating…", done: "Translated to English" },
  de: { hi: "Willkommen!", msg: "Diese Seite ist auf Dänisch. Dein Browser kann sie für dich übersetzen.", btn: "Auf Deutsch übersetzen", close: "Schließen", busy: "Wird übersetzt …", done: "Auf Deutsch übersetzt" },
  sv: { hi: "Välkommen!", msg: "Den här sidan är på danska. Din webbläsare kan översätta den åt dig.", btn: "Översätt till svenska", close: "Stäng", busy: "Översätter …", done: "Översatt till svenska" },
  nb: { hi: "Velkommen!", msg: "Denne siden er på dansk. Nettleseren din kan oversette den for deg.", btn: "Oversett til norsk", close: "Lukk", busy: "Oversetter …", done: "Oversatt til norsk" },
  fi: { hi: "Tervetuloa!", msg: "Tämä sivu on tanskaksi. Selaimesi voi kääntää sen puolestasi.", btn: "Käännä suomeksi", close: "Sulje", busy: "Käännetään…", done: "Käännetty suomeksi" },
  is: { hi: "Velkomin!", msg: "Þessi síða er á dönsku. Vafrinn þinn getur þýtt hana fyrir þig.", btn: "Þýða á íslensku", close: "Loka", busy: "Þýði …", done: "Þýtt á íslensku" },
  nl: { hi: "Welkom!", msg: "Deze site is in het Deens. Je browser kan hem voor je vertalen.", btn: "Vertalen naar het Nederlands", close: "Sluiten", busy: "Bezig met vertalen…", done: "Vertaald naar het Nederlands" },
  fr: { hi: "Bienvenue !", msg: "Ce site est en danois. Votre navigateur peut le traduire pour vous.", btn: "Traduire en français", close: "Fermer", busy: "Traduction…", done: "Traduit en français" },
  es: { hi: "¡Bienvenido!", msg: "Este sitio está en danés. Tu navegador puede traducirlo por ti.", btn: "Traducir al español", close: "Cerrar", busy: "Traduciendo…", done: "Traducido al español" },
  ca: { hi: "Benvingut!", msg: "Aquest lloc és en danès. El teu navegador el pot traduir per tu.", btn: "Traduir al català", close: "Tancar", busy: "Traduint…", done: "Traduït al català" },
  pt: { hi: "Bem-vindo!", msg: "Este site está em dinamarquês. O seu navegador pode traduzi-lo por si.", btn: "Traduzir para português", close: "Fechar", busy: "A traduzir…", done: "Traduzido para português" },
  it: { hi: "Benvenuto!", msg: "Questo sito è in danese. Il tuo browser può tradurlo per te.", btn: "Traduci in italiano", close: "Chiudi", busy: "Traduzione in corso…", done: "Tradotto in italiano" },
  pl: { hi: "Witaj!", msg: "Ta strona jest po duńsku. Twoja przeglądarka może ją dla Ciebie przetłumaczyć.", btn: "Przetłumacz na polski", close: "Zamknij", busy: "Tłumaczenie…", done: "Przetłumaczono na polski" },
  cs: { hi: "Vítejte!", msg: "Tento web je v dánštině. Váš prohlížeč ho pro vás může přeložit.", btn: "Přeložit do češtiny", close: "Zavřít", busy: "Překládám…", done: "Přeloženo do češtiny" },
  sk: { hi: "Vitajte!", msg: "Táto stránka je v dánčine. Váš prehliadač ju za vás môže preložiť.", btn: "Preložiť do slovenčiny", close: "Zavrieť", busy: "Prekladám…", done: "Preložené do slovenčiny" },
  hu: { hi: "Üdvözöljük!", msg: "Ez az oldal dánul van. A böngészője lefordíthatja Önnek.", btn: "Fordítás magyarra", close: "Bezárás", busy: "Fordítás…", done: "Lefordítva magyarra" },
  ro: { hi: "Bine ați venit!", msg: "Acest site este în daneză. Browserul dvs. îl poate traduce pentru dvs.", btn: "Tradu în română", close: "Închide", busy: "Se traduce…", done: "Tradus în română" },
  sl: { hi: "Dobrodošli!", msg: "Ta stran je v danščini. Vaš brskalnik jo lahko prevede za vas.", btn: "Prevedi v slovenščino", close: "Zapri", busy: "Prevajanje …", done: "Prevedeno v slovenščino" },
  hr: { hi: "Dobro došli!", msg: "Ova stranica je na danskom. Vaš preglednik je može prevesti za vas.", btn: "Prevedi na hrvatski", close: "Zatvori", busy: "Prevođenje…", done: "Prevedeno na hrvatski" },
  bg: { hi: "Добре дошли!", msg: "Този сайт е на датски. Браузърът ви може да го преведе за вас.", btn: "Преведи на български", close: "Затвори", busy: "Превеждане…", done: "Преведено на български" },
  el: { hi: "Καλώς ήρθατε!", msg: "Αυτός ο ιστότοπος είναι στα δανικά. Το πρόγραμμα περιήγησής σας μπορεί να τον μεταφράσει για εσάς.", btn: "Μετάφραση στα ελληνικά", close: "Κλείσιμο", busy: "Μετάφραση…", done: "Μεταφράστηκε στα ελληνικά" },
  uk: { hi: "Ласкаво просимо!", msg: "Цей сайт данською мовою. Ваш браузер може перекласти його для вас.", btn: "Перекласти українською", close: "Закрити", busy: "Перекладаємо…", done: "Перекладено українською" },
  et: { hi: "Tere tulemast!", msg: "See leht on taani keeles. Sinu brauser saab selle sinu eest tõlkida.", btn: "Tõlgi eesti keelde", close: "Sulge", busy: "Tõlgin…", done: "Tõlgitud eesti keelde" },
  lv: { hi: "Laipni lūdzam!", msg: "Šī vietne ir dāņu valodā. Jūsu pārlūks var to iztulkot jūsu vietā.", btn: "Tulkot latviski", close: "Aizvērt", busy: "Tulko…", done: "Iztulkots latviski" },
  lt: { hi: "Sveiki atvykę!", msg: "Ši svetainė yra danų kalba. Jūsų naršyklė gali ją išversti už jus.", btn: "Versti į lietuvių kalbą", close: "Uždaryti", busy: "Verčiama…", done: "Išversta į lietuvių kalbą" },
};
const ALIAS = { no: "nb", nn: "nb", fil: null };
const STORE_KEY = "velkomst-lukket";

function visitorLanguage() {
  for (const tag of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    const base = tag?.toLowerCase().split("-")[0];
    if (!base) continue;
    if (base === "da") return null; // dansktalende behøver ingen velkomst
    const lang = base in ALIAS ? ALIAS[base] : base;
    if (lang && TEXTS[lang]) return lang;
  }
  return null;
}

const remembered = () => { try { return localStorage.getItem(STORE_KEY) === "1"; } catch { return false; } };
const remember = () => { try { localStorage.setItem(STORE_KEY, "1"); } catch { /* privat vindue */ } };

// Alle tekstnoder der må oversættes (respekterer translate="no")
function translatableTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const el = node.parentElement;
      if (!el || el.closest('[translate="no"], script, style, noscript, #welcome')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

// Chromes indbyggede oversætter (Translator API) kører lokalt i browseren.
// Den bruges kun, når sprogmodellen allerede er hentet – ellers ville den
// besøgende skulle vente på en download, og så er Google Oversæt bedre.
async function translateInPage(lang) {
  if (!("Translator" in self)) return false;
  const opts = { sourceLanguage: "da", targetLanguage: lang };
  if ((await withTimeout(Translator.availability(opts), 2500)) !== "available") return false;
  const translator = await withTimeout(Translator.create(opts), 5000);
  const nodes = translatableTextNodes(document.body);
  const cache = new Map();
  for (const node of nodes) {
    const text = node.nodeValue.trim();
    if (!cache.has(text)) cache.set(text, withTimeout(translator.translate(text), 8000));
    const translated = await cache.get(text);
    node.nodeValue = node.nodeValue.replace(text, translated);
  }
  document.documentElement.lang = lang;
  return true;
}

function googleTranslateUrl(lang) {
  const host = location.hostname.replace(/-/g, "--").replace(/\./g, "-");
  return `https://${host}.translate.goog${location.pathname}?_x_tr_sl=da&_x_tr_tl=${lang}&_x_tr_hl=${lang}`;
}

export function welcome() {
  const lang = visitorLanguage();
  if (!lang || remembered() || location.hostname.endsWith(".translate.goog")) return;
  const t = TEXTS[lang];

  const box = document.createElement("aside");
  box.id = "welcome";
  box.className = "welcome";
  box.lang = lang;
  box.setAttribute("translate", "no"); // teksten er allerede på det rigtige sprog
  box.setAttribute("aria-live", "polite");
  box.innerHTML = `
    <span class="welcome-wave" aria-hidden="true">👋</span>
    <div class="welcome-text"><strong></strong><p></p></div>
    <div class="welcome-actions">
      <button type="button" class="welcome-translate"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1m14 20-5-10-5 10m2-4h6"/></svg><span></span></button>
      <button type="button" class="welcome-close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
    </div>`;
  box.querySelector("strong").textContent = t.hi;
  box.querySelector("p").textContent = t.msg;
  const translateBtn = box.querySelector(".welcome-translate");
  const label = translateBtn.querySelector("span");
  label.textContent = t.btn;
  const closeBtn = box.querySelector(".welcome-close");
  closeBtn.setAttribute("aria-label", t.close);
  closeBtn.title = t.close;

  const close = () => {
    remember();
    box.classList.remove("show");
    setTimeout(() => box.remove(), 600);
  };
  closeBtn.addEventListener("click", close);

  translateBtn.addEventListener("click", async () => {
    translateBtn.disabled = true;
    label.textContent = t.busy;
    let ok = false;
    try {
      ok = await translateInPage(lang);
    } catch {
      ok = false;
    }
    if (ok) {
      label.textContent = t.done;
      setTimeout(close, 1800);
    } else {
      location.href = googleTranslateUrl(lang);
    }
  });

  document.body.append(box);
  setTimeout(() => box.classList.add("show"), 1600);
}
