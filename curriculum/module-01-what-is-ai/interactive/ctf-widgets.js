/* ==========================================================================
   Code the Future — Interactive Widget Engine (Module 1, Pass 2)
   Vanilla JS, no dependencies. Hydrates any element with [data-ctf-widget]
   using a child <script type="application/json"> config block.

   Embed pattern (drop into any page that also loads ctf-widgets.css):

     <div class="ctf"><div data-ctf-widget="choice" data-ctf-id="kids-m3">
       <script type="application/json">{ ...config... }</script>
     </div></div>
     <script src="ctf-widgets.js"></script>

   Widget types: poll · sort · choice · nextword · attention · quiz
   Progress + answers persist to localStorage under the "ctf:" namespace.
   ========================================================================== */
(function () {
  'use strict';

  // ---- storage helpers ----------------------------------------------------
  var NS = 'ctf:';
  function save(key, val) { try { localStorage.setItem(NS + key, JSON.stringify(val)); } catch (e) {} }
  function load(key) { try { var v = localStorage.getItem(NS + key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }

  // ---- tiny DOM helpers ---------------------------------------------------
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function header(cfg) {
    var h = '';
    if (cfg.eyebrow) h += '<p class="ctf-eyebrow">' + esc(cfg.eyebrow) + '</p>';
    if (cfg.title) h += '<h3 class="ctf-title">' + esc(cfg.title) + '</h3>';
    if (cfg.prompt) h += '<p class="ctf-prompt">' + cfg.prompt + '</p>';
    return h;
  }
  function completionCard(cfg) {
    if (!cfg.complete) return null;
    var c = cfg.complete, card = el('div', 'ctf-complete');
    card.innerHTML =
      '<div class="badge">' + (c.icon ? '<span>' + esc(c.icon) + '</span>' : '') + esc(c.badge || 'Complete!') + '</div>' +
      (c.sub ? '<div class="sub">' + esc(c.sub) + '</div>' : '') +
      (c.progress ? '<div class="ctf-progress"><i style="width:0"></i></div>' : '');
    return card;
  }
  function reveal(card, pct) {
    if (!card) return;
    card.classList.add('show');
    var bar = card.querySelector('.ctf-progress > i');
    if (bar) setTimeout(function () { bar.style.width = (pct || 100) + '%'; }, 60);
  }
  function markDone(id) {
    if (!id) return;
    save(id + ':done', true);
    var ans = load(id + ':answer'), score = load(id + ':score');
    var resp = {}; if (ans) resp.answer = ans; if (score != null) resp.score = score;
    if (window.CTFDB && window.CTFDB.enabled) window.CTFDB.saveWidgetResponse(id, { response: resp, isComplete: true });
  }

  // =========================================================================
  // POLL — pick an option (and/or free text). Saves the answer; can revisit.
  // =========================================================================
  function renderPoll(root, cfg, id) {
    root.innerHTML = header(cfg);
    var prior = id ? load(id + ':answer') : null;
    var opts = el('div', 'ctf-options' + (cfg.columns === 2 ? ' cols-2' : ''));
    var chosen = prior && prior.choice;

    (cfg.options || []).forEach(function (o) {
      var label = typeof o === 'string' ? o : o.label, emoji = typeof o === 'object' ? o.emoji : null;
      var b = el('button', 'ctf-opt', (emoji ? '<span class="emoji">' + esc(emoji) + '</span>' : '') + '<span>' + esc(label) + '</span>');
      if (chosen === label) b.classList.add('is-selected');
      b.addEventListener('click', function () {
        opts.querySelectorAll('.ctf-opt').forEach(function (x) { x.classList.remove('is-selected'); });
        b.classList.add('is-selected');
        persist(label);
      });
      opts.appendChild(b);
    });
    root.appendChild(opts);

    var input;
    if (cfg.freeText) {
      input = el('input', 'ctf-input');
      input.type = 'text';
      input.placeholder = cfg.placeholder || 'Type your answer…';
      input.style.marginTop = '12px';
      if (prior && prior.text) input.value = prior.text;
      input.addEventListener('input', function () { persist(undefined, input.value); });
      root.appendChild(input);
    }

    var fb = el('div', 'ctf-feedback good');
    fb.textContent = cfg.thanks || 'Saved! We\'ll come back to this later.';
    root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);
    if (prior) { fb.classList.add('show'); reveal(done, (cfg.complete && cfg.complete.progress) || 100); }

    function persist(choice, text) {
      var cur = load(id + ':answer') || {};
      if (choice !== undefined) cur.choice = choice;
      if (text !== undefined) cur.text = text;
      if (id) save(id + ':answer', cur);
      fb.classList.add('show');
      reveal(done, (cfg.complete && cfg.complete.progress) || 100);
      markDone(id);
    }
  }

  // =========================================================================
  // SORT — tap each item into the correct bucket. Completes when all correct.
  // =========================================================================
  function renderSort(root, cfg, id) {
    root.innerHTML = header(cfg);
    var buckets = cfg.buckets || ['A', 'B'];
    var items = (cfg.items || []).slice();
    var solved = 0;
    var list = el('div');
    items.forEach(function (it) {
      var row = el('div', 'ctf-sort-item');
      row.innerHTML = '<span class="label">' + (it.emoji ? '<span class="emoji">' + esc(it.emoji) + '</span>' : '') + esc(it.label) + '</span>' +
        '<span class="solved-tag">✓ ' + esc(buckets[it.bucket]) + '</span>';
      var bz = el('span', 'buckets');
      buckets.forEach(function (bname, bi) {
        var chip = el('button', 'ctf-chip', esc(bname));
        chip.addEventListener('click', function () {
          if (bi === it.bucket) {
            row.classList.add('solved'); solved++;
            if (solved === items.length) finish();
          } else {
            chip.classList.add('shake');
            setTimeout(function () { chip.classList.remove('shake'); }, 450);
          }
        });
        bz.appendChild(chip);
      });
      row.appendChild(bz); list.appendChild(row);
    });
    root.appendChild(list);
    var fb = el('div', 'ctf-feedback good'); fb.textContent = cfg.thanks || 'You sorted them all!'; root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);
    function finish() { fb.classList.add('show'); reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id); }
  }

  // =========================================================================
  // CHOICE — one multiple-choice question with feedback + explanation.
  //          (used for "spot the pattern", trust/verify, comparison, etc.)
  // =========================================================================
  function renderChoice(root, cfg, id) {
    root.innerHTML = header(cfg);
    var answered = false;
    var opts = el('div', 'ctf-options' + (cfg.columns === 2 ? ' cols-2' : ''));
    (cfg.options || []).forEach(function (o, i) {
      var label = typeof o === 'string' ? o : o.label, emoji = typeof o === 'object' ? o.emoji : null;
      var b = el('button', 'ctf-opt', (emoji ? '<span class="emoji">' + esc(emoji) + '</span>' : '') + '<span>' + esc(label) + '</span><span class="mark"></span>');
      b.addEventListener('click', function () {
        if (answered) return; answered = true;
        var correct = i === cfg.answer;
        opts.querySelectorAll('.ctf-opt').forEach(function (x, xi) {
          x.disabled = true;
          if (xi === cfg.answer) { x.classList.add('is-correct'); x.querySelector('.mark').textContent = '✓'; }
        });
        if (!correct) { b.classList.add('is-wrong'); b.querySelector('.mark').textContent = '✕'; }
        fb.className = 'ctf-feedback show ' + (correct ? 'good' : 'info');
        fb.innerHTML = (correct ? '<b>' + esc(cfg.correctText || 'That\'s it!') + '</b> ' : '<b>' + esc(cfg.wrongText || 'Not quite.') + '</b> ') + (cfg.explain || '');
        reveal(done, (cfg.complete && cfg.complete.progress) || 100);
        markDone(id);
      });
      opts.appendChild(b);
    });
    root.appendChild(opts);
    var fb = el('div', 'ctf-feedback'); root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);
  }

  // =========================================================================
  // NEXTWORD — learner predicts the next word, then reveals common answers.
  // Supports cfg.rounds = [{stem, common, explain}] for multiple challenges.
  // =========================================================================
  function renderNextWord(root, cfg, id) {
    root.innerHTML = header(cfg);
    var rounds = cfg.rounds || [{ stem: cfg.stem, common: cfg.common, explain: cfg.explain }];
    var idx = 0;
    var area = el('div'); root.appendChild(area);
    var done = completionCard(cfg); if (done) root.appendChild(done);

    function renderRound() {
      var r = rounds[idx];
      area.innerHTML = (rounds.length > 1 ? '<p class="ctf-roundlbl">Round ' + (idx + 1) + ' of ' + rounds.length + '</p>' : '');
      var stem = el('div', 'ctf-stem', esc(r.stem) + ' <span class="blank">?</span>');
      area.appendChild(stem);
      var input = el('input', 'ctf-input'); input.type = 'text'; input.placeholder = cfg.placeholder || 'Your guess…';
      area.appendChild(input);
      var actions = el('div', 'ctf-actions');
      var btn = el('button', 'ctf-btn', 'Reveal');
      actions.appendChild(btn); area.appendChild(actions);
      var fb = el('div', 'ctf-feedback info'); area.appendChild(fb);

      function go() {
        var guess = (input.value || '').trim();
        var common = (r.common || []).map(function (w) { return w.toLowerCase(); });
        var hit = guess && common.indexOf(guess.toLowerCase()) > -1;
        stem.querySelector('.blank').textContent = r.common && r.common[0] ? r.common[0] : (guess || '…');
        fb.className = 'ctf-feedback show ' + (hit ? 'good' : 'info');
        fb.innerHTML =
          (guess ? 'You guessed <b>' + esc(guess) + '</b>. ' : '') +
          (hit ? 'Nice — that\'s one of the most common answers! ' : '') +
          (r.common ? 'People (and AI) usually say: <b>' + r.common.map(esc).join('</b>, <b>') + '</b>. ' : '') +
          (r.explain || '');
        btn.style.display = 'none';
        if (idx < rounds.length - 1) {
          var next = el('button', 'ctf-btn', 'Next round →');
          next.addEventListener('click', function () { idx++; renderRound(); });
          actions.appendChild(next);
        } else {
          reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
        }
      }
      btn.addEventListener('click', go);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && btn.style.display !== 'none') go(); });
    }
    renderRound();
  }

  // =========================================================================
  // ATTENTION — click which earlier word the highlighted word refers to.
  // Supports cfg.rounds = [{tokens, hint, explain}] for multiple sentences.
  // =========================================================================
  function renderAttention(root, cfg, id) {
    root.innerHTML = header(cfg);
    var rounds = cfg.rounds || [{ tokens: cfg.tokens, hint: cfg.hint, explain: cfg.explain }];
    var idx = 0;
    var area = el('div'); root.appendChild(area);
    var done = completionCard(cfg); if (done) root.appendChild(done);

    function renderRound() {
      var r = rounds[idx];
      var answered = false;
      area.innerHTML = (rounds.length > 1 ? '<p class="ctf-roundlbl">Sentence ' + (idx + 1) + ' of ' + rounds.length + '</p>' : '');
      var s = el('p', 'ctf-sentence');
      var fb = el('div', 'ctf-feedback');
      var actions = el('div', 'ctf-actions');
      (r.tokens || []).forEach(function (t) {
        if (typeof t === 'string') { s.appendChild(document.createTextNode(t)); return; }
        var w = el('span', 'ctf-word' + (t.target ? ' target' : ' pick'), esc(t.w));
        if (!t.target) {
          w.addEventListener('click', function () {
            if (answered) return; answered = true;
            var correct = t.ref === true;
            w.classList.add(correct ? 'is-correct' : 'is-wrong');
            fb.className = 'ctf-feedback show ' + (correct ? 'good' : 'info');
            fb.innerHTML = (correct ? '<b>Yes!</b> ' : '<b>Look again — </b>') + (r.explain || '');
            if (idx < rounds.length - 1) {
              var next = el('button', 'ctf-btn', 'Next sentence →');
              next.addEventListener('click', function () { idx++; renderRound(); });
              actions.appendChild(next);
            } else {
              reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
            }
          });
        }
        s.appendChild(w);
      });
      area.appendChild(s);
      if (r.hint) area.appendChild(el('p', 'ctf-muted', esc(r.hint)));
      area.appendChild(fb);
      area.appendChild(actions);
    }
    renderRound();
  }

  // =========================================================================
  // QUIZ — several MC questions, scored, with optional "revisit" of a poll.
  // =========================================================================
  function renderQuiz(root, cfg, id) {
    root.innerHTML = header(cfg);
    if (cfg.revisit) {
      var prior = load(cfg.revisit + ':answer');
      if (prior && (prior.choice || prior.text)) {
        var note = el('div', 'ctf-revisit');
        note.innerHTML = (cfg.revisitText || 'When you started, you said:') + ' <b>' + esc(prior.choice || prior.text) + '</b>';
        root.appendChild(note);
      }
    }
    var score = 0, answered = 0, qs = cfg.questions || [];
    qs.forEach(function (q, qi) {
      var box = el('div', 'ctf-quiz-q');
      box.innerHTML = '<div class="qnum">Question ' + (qi + 1) + ' of ' + qs.length + '</div>' +
        '<h4 class="ctf-title" style="font-size:1.1rem;margin:4px 0 10px">' + esc(q.q) + '</h4>';
      var opts = el('div', 'ctf-options'); var locked = false;
      q.options.forEach(function (label, i) {
        var b = el('button', 'ctf-opt', '<span>' + esc(label) + '</span><span class="mark"></span>');
        b.addEventListener('click', function () {
          if (locked) return; locked = true; answered++;
          var ok = i === q.answer; if (ok) score++;
          opts.querySelectorAll('.ctf-opt').forEach(function (x, xi) {
            x.disabled = true; if (xi === q.answer) { x.classList.add('is-correct'); x.querySelector('.mark').textContent = '✓'; }
          });
          if (!ok) { b.classList.add('is-wrong'); b.querySelector('.mark').textContent = '✕'; }
          if (answered === qs.length) finish();
        });
        opts.appendChild(b);
      });
      box.appendChild(opts); root.appendChild(box);
    });
    var result = el('div', 'ctf-feedback good'); root.appendChild(result);
    var done = completionCard(cfg); if (done) root.appendChild(done);
    function finish() {
      result.classList.add('show');
      result.innerHTML = '<span class="ctf-score">' + score + ' / ' + qs.length + '</span> — ' +
        (score === qs.length ? (cfg.perfect || 'Perfect! You\'ve got this.') : (cfg.passText || 'Great work — look back at any you missed.'));
      reveal(done, (cfg.complete && cfg.complete.progress) || 100);
      if (id) save(id + ':score', score); markDone(id);
    }
  }

  // =========================================================================
  // TIMELINE — tap each milestone to reveal its detail. Done when all opened.
  // =========================================================================
  function renderTimeline(root, cfg, id) {
    root.innerHTML = header(cfg);
    var steps = cfg.steps || [], opened = 0;
    var wrap = el('div', 'ctf-timeline');
    steps.forEach(function (s) {
      var item = el('div', 'ctf-tl-item');
      item.innerHTML =
        '<span class="ctf-tl-dot"></span>' +
        '<button class="ctf-tl-head"><span class="ctf-tl-when">' + esc(s.when || '') + '</span>' +
        '<span class="ctf-tl-title">' + esc(s.title || '') + '</span><span class="ctf-tl-caret">+</span></button>' +
        '<div class="ctf-tl-body">' + (s.body || '') + '</div>';
      var head = item.querySelector('.ctf-tl-head');
      head.addEventListener('click', function () {
        var isOpen = item.classList.toggle('open');
        head.querySelector('.ctf-tl-caret').textContent = isOpen ? '–' : '+';
        if (isOpen && !item.getAttribute('data-seen')) { item.setAttribute('data-seen', '1'); opened++; if (opened === steps.length) finish(); }
      });
      wrap.appendChild(item);
    });
    root.appendChild(wrap);
    var fb = el('div', 'ctf-feedback good'); fb.textContent = cfg.thanks || 'You explored the whole story!'; root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);
    function finish() { fb.classList.add('show'); reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id); }
  }

  // =========================================================================
  // REVEAL — progressively un-blur an image/emoji; optional guess (choice).
  // =========================================================================
  function renderReveal(root, cfg, id) {
    root.innerHTML = header(cfg);
    var levels = cfg.levels || [22, 14, 8, 3, 0], idx = 0;
    var stage = el('div', 'ctf-reveal-stage');
    var inner = cfg.src ? el('img', 'ctf-reveal-img') : el('div', 'ctf-reveal-emoji', esc(cfg.emoji || '🐱'));
    if (cfg.src) { inner.src = cfg.src; inner.alt = ''; }
    inner.style.filter = 'blur(' + levels[0] + 'px)';
    stage.appendChild(inner); root.appendChild(stage);
    var actions = el('div', 'ctf-actions');
    var btn = el('button', 'ctf-btn', 'Reveal more'); actions.appendChild(btn); root.appendChild(actions);
    var answered = false, opts = null;
    if (cfg.options) {
      opts = el('div', 'ctf-options cols-2');
      cfg.options.forEach(function (o, i) {
        var b = el('button', 'ctf-opt', '<span>' + esc(o) + '</span><span class="mark"></span>');
        b.addEventListener('click', function () {
          if (answered) return; answered = true;
          var correct = i === cfg.answer;
          opts.querySelectorAll('.ctf-opt').forEach(function (x, xi) { x.disabled = true; if (xi === cfg.answer) { x.classList.add('is-correct'); x.querySelector('.mark').textContent = '✓'; } });
          if (!correct) { b.classList.add('is-wrong'); b.querySelector('.mark').textContent = '✕'; }
          inner.style.filter = 'blur(0px)';
          fb.className = 'ctf-feedback show ' + (correct ? 'good' : 'info');
          fb.innerHTML = (correct ? '<b>Yes!</b> ' : '<b>It was a ' + esc(cfg.options[cfg.answer]) + '!</b> ') + (cfg.explain || '');
          reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
        });
        opts.appendChild(b);
      });
      root.appendChild(opts);
    }
    var fb = el('div', 'ctf-feedback'); root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);
    btn.addEventListener('click', function () {
      if (idx < levels.length - 1) { idx++; inner.style.filter = 'blur(' + levels[idx] + 'px)'; }
      if (idx >= levels.length - 1) {
        btn.disabled = true; btn.textContent = 'Fully revealed';
        if (!cfg.options) { fb.className = 'ctf-feedback show good'; fb.innerHTML = cfg.explain || 'The clearer it gets, the more pattern there is to read.'; reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id); }
      }
    });
  }

  // =========================================================================
  // SLIDER — drag a value and watch the output change (weights, confidence).
  // =========================================================================
  function renderSlider(root, cfg, id) {
    root.innerHTML = header(cfg);
    var min = cfg.min != null ? cfg.min : 0, max = cfg.max != null ? cfg.max : 100;
    var input = el('input', 'ctf-range'); input.type = 'range'; input.min = min; input.max = max; input.step = cfg.step || 1;
    input.value = cfg.value != null ? cfg.value : Math.round((min + max) / 2);
    var row = el('div', 'ctf-slider-row'); row.appendChild(input); root.appendChild(row);
    var readout = el('div', 'ctf-slider-out'); root.appendChild(readout);
    var moved = false;
    var done = completionCard(cfg);
    function band(v) { if (!cfg.bands) return ''; for (var i = 0; i < cfg.bands.length; i++) { if (v <= cfg.bands[i].max) return cfg.bands[i].text; } return cfg.bands[cfg.bands.length - 1].text; }
    function update() {
      var v = Number(input.value), pct = (v - min) / (max - min) * 100;
      input.style.setProperty('--ctf-pct', pct + '%');
      readout.innerHTML = '<span class="ctf-slider-val">' + esc(v + (cfg.unit || '')) + '</span>' +
        (cfg.label ? ' <span class="ctf-muted">' + esc(cfg.label) + '</span>' : '') +
        (band(v) ? '<div class="ctf-slider-band">' + band(v) + '</div>' : '');
    }
    input.addEventListener('input', function () { update(); if (!moved) { moved = true; reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id); } });
    update();
    if (done) root.appendChild(done);
  }

  // =========================================================================
  // TRAINER — teach a mini-AI by labeling examples, then watch it guess new
  // ones. The AI copies YOUR teaching (mislabel = it learns the mistake) —
  // a hands-on lesson in training data quality.
  // =========================================================================
  function renderTrainer(root, cfg, id) {
    root.innerHTML = header(cfg);
    var classes = cfg.classes || [];
    var train = cfg.train || [];
    var test = cfg.test || [];
    var labels = {};   // train index -> chosen class key
    var labeled = 0;

    var phase1 = el('div');
    phase1.innerHTML = '<p class="ctf-trainer-phase">🎓 Step 1 — Teach your AI! Label each picture:</p>';
    var list = el('div');
    train.forEach(function (it, i) {
      var row = el('div', 'ctf-sort-item');
      row.innerHTML = '<span class="label"><span class="emoji" style="font-size:1.8rem">' + esc(it.emoji) + '</span></span>' +
        '<span class="solved-tag" id="' + id + '-t' + i + '"></span>';
      var bz = el('span', 'buckets');
      classes.forEach(function (c) {
        var chip = el('button', 'ctf-chip', esc(c.label));
        chip.addEventListener('click', function () {
          if (labels[i] == null) labeled++;
          labels[i] = c.key;
          row.classList.add('solved');
          row.querySelector('.solved-tag').textContent = 'You said: ' + c.label;
          row.classList.remove('solved'); row.classList.add('solved'); // keep style
          if (labeled === train.length) startTest();
        });
        bz.appendChild(chip);
      });
      row.appendChild(bz); list.appendChild(row);
    });
    phase1.appendChild(list);
    root.appendChild(phase1);

    var phase2 = el('div'); phase2.style.display = 'none'; root.appendChild(phase2);
    var fb = el('div', 'ctf-feedback'); root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);

    function startTest() {
      phase2.style.display = '';
      phase2.innerHTML = '<p class="ctf-trainer-phase" style="margin-top:14px">🤖 Step 2 — Your AI tries brand-new pictures it has never seen…</p>';
      var right = 0;
      test.forEach(function (t, i) {
        var srcIdx = (typeof t.like === 'number') ? t.like : i % train.length;
        var guessKey = labels[srcIdx];
        var guess = classes.filter(function (c) { return c.key === guessKey; })[0] || classes[0];
        var ok = guessKey === t.cls;
        if (ok) right++;
        var row = el('div', 'ctf-sort-item ' + (ok ? 'solved' : ''));
        if (!ok) row.style.borderColor = 'var(--coral-500)';
        row.innerHTML = '<span class="label"><span class="emoji" style="font-size:1.8rem">' + esc(t.emoji) + '</span></span>' +
          '<span style="margin-left:auto;font-weight:700;color:' + (ok ? 'var(--teal-600)' : 'var(--coral-600)') + '">AI says: ' + esc(guess.label) + ' ' + (ok ? '✓' : '✕') + '</span>';
        setTimeout(function () { phase2.appendChild(row); }, 600 * (i + 1));
      });
      setTimeout(function () {
        fb.className = 'ctf-feedback show ' + (right === test.length ? 'good' : 'info');
        fb.innerHTML = right === test.length
          ? '<b>Your AI got ' + right + '/' + test.length + '!</b> ' + (cfg.winText || 'Great teaching = a smart AI. That\'s exactly how training works!')
          : '<b>Your AI got ' + right + '/' + test.length + '.</b> ' + (cfg.loseText || 'The AI learned exactly what YOU taught it — including the oops! That\'s why good examples matter so much.');
        reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
      }, 600 * (test.length + 1));
    }
  }

  // =========================================================================
  // MATCH — tap a card on the left, then its partner on the right.
  // =========================================================================
  function renderMatch(root, cfg, id) {
    root.innerHTML = header(cfg);
    var pairs = cfg.pairs || [];
    var grid = el('div', 'ctf-match');
    var leftCol = el('div', 'ctf-match-col'), rightCol = el('div', 'ctf-match-col');
    grid.appendChild(leftCol); grid.appendChild(rightCol);
    root.appendChild(grid);
    var fb = el('div', 'ctf-feedback good'); fb.textContent = cfg.thanks || 'All matched — nice!'; root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);

    var selected = null, solved = 0;
    // right column shuffled deterministically (rotate by 2) so it's never aligned
    var order = pairs.map(function (_, i) { return (i + 2) % pairs.length; });

    pairs.forEach(function (p, i) {
      var lb = el('button', 'ctf-opt ctf-match-card', '<span>' + esc(p.l) + '</span>');
      lb.setAttribute('data-i', i);
      lb.addEventListener('click', function () {
        if (lb.classList.contains('is-correct')) return;
        grid.querySelectorAll('.ctf-match-card.is-selected').forEach(function (x) { x.classList.remove('is-selected'); });
        lb.classList.add('is-selected'); selected = i;
      });
      leftCol.appendChild(lb);
    });
    order.forEach(function (i) {
      var p = pairs[i];
      var rb = el('button', 'ctf-opt ctf-match-card', '<span>' + esc(p.r) + '</span>');
      rb.addEventListener('click', function () {
        if (rb.classList.contains('is-correct') || selected == null) return;
        var lb = leftCol.querySelector('[data-i="' + selected + '"]');
        if (selected === i) {
          lb.classList.remove('is-selected'); lb.classList.add('is-correct'); rb.classList.add('is-correct');
          lb.disabled = true; rb.disabled = true; selected = null; solved++;
          if (solved === pairs.length) { fb.classList.add('show'); reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id); }
        } else {
          rb.classList.add('shake'); setTimeout(function () { rb.classList.remove('shake'); }, 450);
        }
      });
      rightCol.appendChild(rb);
    });
  }

  // ---- registry + boot ----------------------------------------------------
  var RENDERERS = { poll: renderPoll, sort: renderSort, choice: renderChoice, nextword: renderNextWord, attention: renderAttention, quiz: renderQuiz, timeline: renderTimeline, reveal: renderReveal, slider: renderSlider, trainer: renderTrainer, match: renderMatch };

  function hydrate(node) {
    if (node.getAttribute('data-ctf-ready')) return;
    var type = node.getAttribute('data-ctf-widget');
    var id = node.getAttribute('data-ctf-id') || '';
    var cfgEl = node.querySelector('script[type="application/json"]');
    var cfg = {};
    if (cfgEl) { try { cfg = JSON.parse(cfgEl.textContent); } catch (e) { node.innerHTML = '<p class="ctf-muted">Widget config error.</p>'; return; } }
    if (!node.classList.contains('ctf-widget')) node.classList.add('ctf-widget');
    if (!node.closest('.ctf')) { var wrap = el('div', 'ctf'); node.parentNode.insertBefore(wrap, node); wrap.appendChild(node); }
    var fn = RENDERERS[type];
    if (!fn) { node.innerHTML = '<p class="ctf-muted">Unknown widget type: ' + esc(type) + '</p>'; return; }
    fn(node, cfg, id);
    node.setAttribute('data-ctf-ready', '1');
  }

  function init(scope) { (scope || document).querySelectorAll('[data-ctf-widget]').forEach(hydrate); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();

  window.CTFWidgets = { init: init, hydrate: hydrate, reset: function () { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(NS) === 0) localStorage.removeItem(k); }); } };
})();
