/* ==========================================================================
   Code the Future — client-side kindness filter (window.CTFFilter)
   Mirrors the database trigger (supabase/migrations/…_profanity_filter.sql)
   so kids get instant, friendly feedback. The database trigger is the real
   enforcement — this is just the fast front line.
   ========================================================================== */
(function () {
  var LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "s", "@": "a", "$": "s", "!": "i" };

  var WORDS = ("fuck fucking fucker shit shitty bullshit ass asses asshole bitch bitches bastard damn goddamn " +
    "crap piss pissed dick dicks cock pussy cunt whore slut fag faggot nigger nigga retard retarded spic chink " +
    "kike wetback tranny douche douchebag jackass dumbass prick wanker twat bollocks tits boobs penis vagina " +
    "porn porno sexy nude nudes kys stfu gtfo wtf hoe hoes").split(" ");
  var PHRASES = ["kill yourself"];
  var COLLAPSED = ["fuck", "nigger", "nigga", "faggot", "cunt", "bitch", "asshole", "killyourself"];

  var WORD_RE = new RegExp("\\b(" + WORDS.join("|") + ")\\b");
  var COLLAPSED_RE = new RegExp("(" + COLLAPSED.join("|") + ")");

  function normalize(t) {
    return String(t || "").toLowerCase().replace(/[01345780@$!]/g, function (c) { return LEET[c] || c; });
  }

  function isClean(text) {
    var norm = normalize(text);
    if (WORD_RE.test(norm)) return false;
    for (var i = 0; i < PHRASES.length; i++) if (norm.indexOf(PHRASES[i]) >= 0) return false;
    var collapsed = norm.replace(/[^a-z]/g, "");
    if (COLLAPSED_RE.test(collapsed)) return false;
    return true;
  }

  var MESSAGES = [
    "Whoa! Let's keep it kind 💙 Try different words.",
    "Hmm, that's not Code the Future language. Give it another go! 💙",
    "Our robots only deliver kind words! Try saying it a different way. 🤖💙"
  ];
  function message() { return MESSAGES[Math.floor(Math.random() * MESSAGES.length)]; }

  // server trigger raises PROFANITY_BLOCKED — translate it kindly too
  function isProfanityError(err) { return /PROFANITY_BLOCKED/i.test(String(err || "")); }

  window.CTFFilter = { isClean: isClean, message: message, isProfanityError: isProfanityError };
})();
