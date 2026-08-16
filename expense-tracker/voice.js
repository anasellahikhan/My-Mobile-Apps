/* ============================================================
   VOICE INPUT  -  voice.js
   ============================================================

   The web equivalent of speech.py, and considerably simpler,
   because the phone does the hard part.

   NO MODEL TO DOWNLOAD
   --------------------
   The desktop app needed vosk plus a 40MB (or 1.8GB) model
   file, and its accuracy was the weak link. Browsers expose
   the phone's own speech engine - the same one behind the
   microphone key on your keyboard. It is Google's or Apple's,
   trained on far more data than anything we could ship, and it
   costs nothing to use.

   The tradeoff: on Android it sends audio to Google's servers,
   so it needs a connection. Everything ELSE in this app works
   offline; voice is the one part that does not.

   WHAT CARRIES OVER
   -----------------
   All the parsing rules from speech.py, ported to JavaScript:
   numbers anywhere in the sentence, spoken numbers, payment
   detection, and stripping payment words out of the
   description. That logic was the genuinely hard part and it
   was worth keeping.
   ============================================================ */

"use strict";


const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000, lakh: 100000
};

const CATEGORY_WORDS = {
  groceries: "Groceries", grocery: "Groceries",
  vegetables: "Groceries", fruit: "Groceries",
  milk: "Groceries", bread: "Groceries", eggs: "Groceries",
  meat: "Groceries", chicken: "Groceries", rice: "Groceries",

  lunch: "Food", dinner: "Food", breakfast: "Food",
  food: "Food", snacks: "Food", restaurant: "Food",
  tea: "Food", coffee: "Food", biryani: "Food",

  transport: "Transport", fuel: "Transport", petrol: "Transport",
  diesel: "Transport", taxi: "Transport", uber: "Transport",
  careem: "Transport", bus: "Transport", train: "Transport",
  parking: "Transport", toll: "Transport",

  rent: "Housing", maintenance: "Housing",

  electricity: "Utilities", utilities: "Utilities",
  internet: "Utilities", mobile: "Utilities",
  recharge: "Utilities", gas: "Utilities", water: "Utilities",
  bill: "Utilities",

  medicine: "Health", doctor: "Health", hospital: "Health",
  pharmacy: "Health",

  clothes: "Shopping", shopping: "Shopping", shoes: "Shopping",
  shirt: "Shopping", gift: "Shopping",

  entertainment: "Entertainment", movie: "Entertainment",
  ticket: "Entertainment",

  book: "Education", books: "Education", school: "Education",
  college: "Education", fees: "Education"
};

// Longest phrases first, so "credit card" beats a bare "card"
// and "easypaisa" is not swallowed by something shorter.
const PAYMENT_WORDS = [
  ["credit card", "Card"],
  ["debit card", "Card"],
  ["bank transfer", "Bank"],
  ["mobile wallet", "Wallet"],
  ["easypaisa", "Wallet"],
  ["jazzcash", "Wallet"],
  ["sadapay", "Wallet"],
  ["nayapay", "Wallet"],
  ["card", "Card"],
  ["visa", "Card"],
  ["mastercard", "Card"],
  ["bank", "Bank"],
  ["transfer", "Bank"],
  ["cheque", "Bank"],
  ["wallet", "Wallet"],
  ["online", "Bank"],
  ["cash", "Cash"]
];

const NOISE_WORDS = new Set([
  ...Object.keys(NUMBER_WORDS),
  "spent", "spend", "paid", "pay", "bought", "buy", "cost",
  "costs", "worth", "and", "the", "a", "an", "my", "some",
  "rupees", "rupee", "rs", "inr", "dollars", "dollar", "pkr",
  "i", "it", "was", "of", "on", "for", "at", "to",
  "today", "yesterday", "using", "with", "via", "by",
  "cash", "card", "credit", "debit", "bank", "transfer",
  "cheque", "wallet", "mobile", "online", "visa",
  "mastercard", "easypaisa", "jazzcash", "sadapay", "nayapay"
]);


/* ------------------------------------------------------------
   PARSING
   ------------------------------------------------------------ */

function wordsToNumber(text) {
  const tokens = String(text || "").toLowerCase()
    .split(/[\s-]+/).filter(t => t && t !== "and");

  if (!tokens.length || tokens.some(t => !(t in NUMBER_WORDS))) {
    return null;
  }

  let total = 0;
  let current = 0;

  tokens.forEach(token => {
    const value = NUMBER_WORDS[token];

    if (value >= 100) {
      current = Math.max(current, 1) * value;
      total += current;
      current = 0;
    } else {
      current += value;
    }
  });

  return total + current;
}


function extractSpokenNumber(text) {
  // Find a number ANYWHERE. Real speech has no fixed shape:
  // "car fuel two hundred" is as likely as "spent two hundred
  // on car fuel", and a template-matching version missed it.
  const tokens = String(text || "").toLowerCase().match(/[a-z]+/g) || [];

  let i = 0;

  while (i < tokens.length) {

    if (tokens[i] in NUMBER_WORDS) {
      let end = i;

      while (end < tokens.length &&
             (tokens[end] in NUMBER_WORDS || tokens[end] === "and")) {
        end++;
      }

      while (end > i && tokens[end - 1] === "and") end--;

      const value = wordsToNumber(tokens.slice(i, end).join(" "));
      if (value) return value;

      i = end;
    } else {
      i++;
    }
  }

  return null;
}


function extractPayment(text) {
  const lowered = String(text || "").toLowerCase();

  for (const [phrase, method] of PAYMENT_WORDS) {
    if (new RegExp(`\\b${phrase}\\b`).test(lowered)) return method;
  }

  return null;
}


function parseSpokenExpense(text) {
  const result = {
    amount: null, category: null, description: null, payment: null
  };

  if (!text) return result;

  const lowered = text.toLowerCase().trim();

  result.payment = extractPayment(lowered);

  // amount: digits first
  const digits = lowered.match(/(\d+(?:[.,]\d+)?)/);

  if (digits) {
    const value = parseFloat(digits[1].replace(/,/g, ""));
    if (!isNaN(value)) result.amount = value;
  }

  // amount: spoken words
  if (result.amount === null) {
    const spoken = extractSpokenNumber(lowered);
    if (spoken) result.amount = spoken;
  }

  // description: cut the payment clause off first, so
  // "dinner using my credit card" gives "dinner"
  const beforePayment = lowered.split(
    /\b(?:using|with|via|by|through)\b/
  )[0].trim() || lowered;

  const tail = beforePayment.match(/\b(?:on|for)\s+(.+)$/);

  let description = tail
    ? tail[1].trim()
    : (beforePayment.match(/[a-z]+/g) || [])
        .filter(w => !NOISE_WORDS.has(w)).join(" ");

  // Payment words never belong in the description even when
  // spoken without "using" - "rent bank transfer" is rent.
  if (result.payment) {
    PAYMENT_WORDS.forEach(([phrase]) => {
      description = description.replace(new RegExp(`\\b${phrase}\\b`, "g"), " ");
    });
  }

  description = description
    .replace(/\s+/g, " ")
    .replace(/^(the|a|an|some|my)\s+/, "")
    .replace(/[.,]+$/, "")
    .trim();

  if (description) result.description = description;

  // category from keywords
  for (const [word, category] of Object.entries(CATEGORY_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(lowered)) {
      result.category = category;
      break;
    }
  }

  if (!result.category && result.description) result.category = "Other";

  return result;
}


/* ------------------------------------------------------------
   THE RECOGNISER
   ------------------------------------------------------------ */

class VoiceInput {

  constructor(handlers) {
    this.handlers = handlers || {};
    this.listening = false;
    this.transcript = "";

    // Chrome uses the webkit- prefix; the standard name is
    // there on newer browsers. Support both.
    const Recognition = window.SpeechRecognition ||
                        window.webkitSpeechRecognition;

    this.supported = Boolean(Recognition);

    if (!this.supported) return;

    const recognition = new Recognition();

    recognition.lang = "en-US";
    recognition.continuous = false;

    // Interim results give live feedback while you speak, which
    // is what makes it feel responsive rather than frozen.
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = event => {
      let finalText = "";
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;

        if (event.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }

      if (interim && this.handlers.onPartial) {
        this.handlers.onPartial(interim);
      }

      if (finalText) {
        this.transcript = (this.transcript + " " + finalText).trim();

        if (this.handlers.onFinal) {
          this.handlers.onFinal(this.transcript,
                                parseSpokenExpense(this.transcript));
        }
      }
    };

    recognition.onerror = event => {
      const messages = {
        "no-speech": "Did not hear anything.",
        "audio-capture": "No microphone found.",
        "not-allowed": "Microphone permission was refused.",
        "network": "Speech needs a connection."
      };

      if (this.handlers.onError) {
        this.handlers.onError(messages[event.error] || event.error);
      }

      this.listening = false;
    };

    recognition.onend = () => {
      this.listening = false;
      if (this.handlers.onEnd) this.handlers.onEnd(this.transcript);
    };

    this.recognition = recognition;
  }

  start() {
    if (!this.supported || this.listening) return false;

    this.transcript = "";
    this.listening = true;

    try {
      this.recognition.start();
      return true;
    } catch (err) {
      this.listening = false;
      return false;
    }
  }

  stop() {
    if (this.supported && this.listening) this.recognition.stop();
    this.listening = false;
  }
}
