/* ==========================================================================
   Code the Future — Module 1 Capstone client (the "create & use AI" sandbox)
   Vanilla JS. Hydrates <div data-ctf-ai="kids|adults"> and talks to the
   server-side proxy (default /api/ai) so the OpenAI key never touches the page.

   Embed:
     <link rel="stylesheet" href="ctf-ai.css">
     <div class="ctf"><div data-ctf-ai="kids" data-endpoint="/api/ai"></div></div>
     <script src="ctf-ai.js"></script>
   ========================================================================== */
(function () {
  'use strict';

  var MODES = {
    kids: {
      eyebrow: '🚀 The Big Mission',
      title: 'Your turn — talk to a real AI',
      intro: 'You learned how AI finds patterns and guesses the next word. Now <b>you</b> get to use one! Type something, or tap an idea below.',
      placeholder: 'Ask the AI anything fun to learn…',
      button: 'Ask the AI ✨',
      presets: [
        'Tell me a surprising fact about space',
        'Make up a silly new animal and name it',
        'Explain rainbows like I am 8',
        'Write a tiny story about a robot who loves art'
      ],
      showTemp: false
    },
    adults: {
      eyebrow: 'Capstone · create & use AI',
      title: 'Run a real model — and turn the dial',
      intro: 'Put Module 1 into practice. Write a prompt and watch next-token prediction happen. Then move <b>temperature</b> (from Section 8) and run the same prompt again to feel the difference.',
      placeholder: 'e.g. Explain what a transformer is, in two sentences…',
      button: 'Run',
      presets: [
        'Explain attention in one short paragraph',
        'Write a haiku about a loop in code',
        'Give me 3 plain-English analogies for a neural network',
        'Summarize "trust, but verify" for using AI at work'
      ],
      showTemp: true
    }
  };

  function el(t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function build(node) {
    if (node.getAttribute('data-ctf-ready')) return;
    var mode = node.getAttribute('data-ctf-ai') === 'adults' ? 'adults' : 'kids';
    var endpoint = node.getAttribute('data-endpoint') || '/api/ai';
    var cfg = MODES[mode];
    if (!node.classList.contains('ctf-ai')) node.classList.add('ctf-ai');
    if (!node.closest('.ctf')) { var wrap = el('div', 'ctf'); node.parentNode.insertBefore(wrap, node); wrap.appendChild(node); }

    node.innerHTML =
      '<p class="ctf-eyebrow">' + esc(cfg.eyebrow) + '</p>' +
      '<h3 class="ctf-title">' + esc(cfg.title) + '</h3>' +
      '<p class="ctf-prompt">' + cfg.intro + '</p>' +
      '<div class="ctf-ai-presets"></div>' +
      '<textarea class="ctf-input ctf-ai-text" rows="3" placeholder="' + esc(cfg.placeholder) + '"></textarea>' +
      (cfg.showTemp ? tempBlock() : '') +
      '<div class="ctf-actions"><button class="ctf-btn ctf-ai-run">' + esc(cfg.button) + '</button>' +
        '<span class="ctf-ai-status ctf-muted"></span></div>' +
      '<div class="ctf-ai-out" hidden></div>' +
      '<div class="ctf-feedback info ctf-ai-err"></div>';

    var ta = node.querySelector('.ctf-ai-text');
    var runBtn = node.querySelector('.ctf-ai-run');
    var out = node.querySelector('.ctf-ai-out');
    var status = node.querySelector('.ctf-ai-status');
    var err = node.querySelector('.ctf-ai-err');
    var tempEl = node.querySelector('.ctf-ai-temp');
    var tempVal = node.querySelector('.ctf-ai-tempval');

    if (tempEl) {
      var sync = function () {
        var v = Number(tempEl.value);
        tempEl.style.setProperty('--ctf-pct', (v / 1.2 * 100) + '%');
        tempVal.textContent = v.toFixed(1) + ' — ' + (v <= 0.3 ? 'focused & predictable' : v <= 0.8 ? 'balanced' : 'adventurous & surprising');
      };
      tempEl.addEventListener('input', sync); sync();
    }

    cfg.presets.forEach(function (p) {
      var chip = el('button', 'ctf-chip', esc(p));
      chip.addEventListener('click', function () { ta.value = p; ta.focus(); });
      node.querySelector('.ctf-ai-presets').appendChild(chip);
    });

    function run() {
      var prompt = (ta.value || '').trim();
      err.classList.remove('show');
      if (!prompt) { ta.focus(); return; }
      runBtn.disabled = true;
      status.textContent = mode === 'kids' ? 'Thinking…' : 'Generating…';
      out.hidden = false; out.innerHTML = '<span class="ctf-ai-dots"><i></i><i></i><i></i></span>';

      var payload = { mode: mode, prompt: prompt };
      if (tempEl) payload.temperature = Number(tempEl.value);

      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          runBtn.disabled = false; status.textContent = '';
          if (!res.ok || res.d.error) { out.hidden = true; showError(res.d && res.d.error); return; }
          typewriter(out, res.d.text || '');
          if (mode === 'adults' && res.d.model) status.textContent = res.d.model + ' · temp ' + res.d.temperature;
        })
        .catch(function () { runBtn.disabled = false; status.textContent = ''; out.hidden = true; showError(); });
    }

    function showError(msg) {
      err.classList.add('show');
      err.innerHTML = '<b>' + esc(msg || 'Could not reach the AI.') + '</b> ' +
        'If you are the developer: make sure the proxy is running and <code>OPENAI_API_KEY</code> is set ' +
        '(see <code>capstone/README.md</code>). The key stays on the server — never in this page.';
    }

    node.setAttribute('data-ctf-ready', '1');
    runBtn.addEventListener('click', run);
    ta.addEventListener('keydown', function (e) { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(); });
  }

  function tempBlock() {
    return '<div class="ctf-ai-temprow">' +
      '<label class="ctf-ai-templabel">Temperature <span class="ctf-ai-tempval"></span></label>' +
      '<input class="ctf-range ctf-ai-temp" type="range" min="0" max="1.2" step="0.1" value="0.7">' +
      '</div>';
  }

  // Reveal text word-by-word — visually echoes "one token at a time."
  function typewriter(node, text) {
    node.hidden = false; node.innerHTML = '';
    var words = text.split(/(\s+)/), i = 0;
    (function step() {
      if (i >= words.length) return;
      node.insertAdjacentText('beforeend', words[i++]);
      setTimeout(step, 18);
    })();
  }

  function init(scope) { (scope || document).querySelectorAll('[data-ctf-ai]').forEach(build); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();
  window.CTFCapstone = { init: init };
})();
