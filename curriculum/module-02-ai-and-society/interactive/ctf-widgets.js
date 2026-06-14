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

  // =========================================================================
  // DRAW — kid draws on a canvas, then the REAL AI (vision) guesses it.
  // The whole computer-vision lesson, in their own hands.
  // =========================================================================
  function renderDraw(root, cfg, id) {
    root.innerHTML = header(cfg);
    var wrap = el('div', 'ctf-draw');
    wrap.innerHTML =
      '<canvas class="ctf-draw-canvas" width="480" height="340"></canvas>' +
      '<div class="ctf-draw-tools">' +
        ['#0C1322', '#2A5FF0', '#12B2BC', '#FF5A38', '#FFB320', '#2FBF71', '#7C5CFF'].map(function (c, i) {
          return '<button class="ctf-draw-color' + (i === 0 ? ' sel' : '') + '" data-c="' + c + '" style="background:' + c + '"></button>';
        }).join('') +
        '<button class="ctf-draw-tool" data-size="big">●</button>' +
        '<button class="ctf-draw-tool" data-erase="1">🧽</button>' +
        '<button class="ctf-draw-tool" data-clear="1">🗑️</button>' +
      '</div>';
    root.appendChild(wrap);
    var actions = el('div', 'ctf-actions');
    var guessBtn = el('button', 'ctf-btn', cfg.button || '🤖 Ask the AI to guess!');
    actions.appendChild(guessBtn); root.appendChild(actions);
    var fb = el('div', 'ctf-feedback'); root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);

    var canvas = wrap.querySelector('canvas'), g = canvas.getContext('2d');
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.lineCap = 'round'; g.lineJoin = 'round';
    var color = '#0C1322', size = 6, erasing = false, drawing = false, last = null, strokes = 0;

    function pos(e) {
      var r = canvas.getBoundingClientRect();
      var t = e.touches ? e.touches[0] : e;
      return { x: (t.clientX - r.left) * (canvas.width / r.width), y: (t.clientY - r.top) * (canvas.height / r.height) };
    }
    function down(e) { drawing = true; last = pos(e); strokes++; e.preventDefault(); }
    function move(e) {
      if (!drawing) return;
      var p = pos(e);
      g.strokeStyle = erasing ? '#FFFFFF' : color;
      g.lineWidth = erasing ? 26 : size;
      g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke();
      last = p; e.preventDefault();
    }
    function up() { drawing = false; }
    canvas.addEventListener('mousedown', down); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    canvas.addEventListener('touchstart', down, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', up);

    wrap.querySelectorAll('.ctf-draw-color').forEach(function (b) {
      b.addEventListener('click', function () {
        erasing = false; color = b.getAttribute('data-c');
        wrap.querySelectorAll('.ctf-draw-color').forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel');
      });
    });
    wrap.querySelector('[data-size]').addEventListener('click', function () { size = size === 6 ? 14 : 6; this.textContent = size === 6 ? '●' : '⬤'; });
    wrap.querySelector('[data-erase]').addEventListener('click', function () { erasing = true; });
    wrap.querySelector('[data-clear]').addEventListener('click', function () { g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, canvas.width, canvas.height); strokes = 0; });

    var guesses = 0;
    guessBtn.addEventListener('click', function () {
      if (strokes < 1) { fb.className = 'ctf-feedback show info'; fb.innerHTML = 'Draw something first! 🎨'; return; }
      guessBtn.disabled = true; guessBtn.textContent = '🤖 Looking at your art…';
      var image = canvas.toDataURL('image/jpeg', 0.7);
      fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'kids', image: image,
          prompt: cfg.aiPrompt || "We are playing a drawing guessing game! Look at this child's drawing and guess what it shows. Answer in ONE short, excited sentence like \"Is it a ... ?\" then say one nice thing about the drawing." }) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          guessBtn.disabled = false; guessBtn.textContent = '🤖 Guess again!';
          guesses++;
          fb.className = 'ctf-feedback show good';
          fb.innerHTML = (res.ok && res.d.text) ? '<b>🤖 AI says:</b> ' + esc(res.d.text) +
            '<br><span class="ctf-muted">The AI never saw YOUR drawing before — it found the patterns in your pixels, just like you learned!</span>'
            : '🙈 ' + esc((res.d && res.d.error) || 'The AI got shy — try again!');
          if (res.ok) { reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id); }
        })
        .catch(function () { guessBtn.disabled = false; guessBtn.textContent = cfg.button || '🤖 Ask the AI to guess!'; fb.className = 'ctf-feedback show info'; fb.innerHTML = '🙈 Couldn\'t reach the AI — is the internet ok?'; });
    });
  }

  // =========================================================================
  // WORDCHAIN — build a sentence one word at a time, seeing how LIKELY each
  // choice is. Exactly how a language model writes.
  // =========================================================================
  function renderWordChain(root, cfg, id) {
    root.innerHTML = header(cfg);
    var sentenceEl = el('div', 'ctf-stem ctf-chain-sentence');
    root.appendChild(sentenceEl);
    var stepLbl = el('p', 'ctf-roundlbl'); root.appendChild(stepLbl);
    var optsEl = el('div', 'ctf-options'); root.appendChild(optsEl);
    var fb = el('div', 'ctf-feedback'); root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);

    var words = [cfg.start || 'The robot'];
    var stepIdx = 0;
    var likelinessSum = 0;

    function renderStep() {
      sentenceEl.innerHTML = esc(words.join(' ')) + ' <span class="blank">?</span>';
      var st = cfg.steps[stepIdx];
      stepLbl.textContent = 'Pick word ' + (stepIdx + 1) + ' of ' + cfg.steps.length;
      optsEl.innerHTML = '';
      st.options.forEach(function (o) {
        var b = el('button', 'ctf-opt ctf-chain-opt',
          '<span>' + esc(o.w) + '</span><span class="ctf-chain-bar"><i style="width:' + o.p + '%"></i></span><span class="ctf-chain-pct">' + o.p + '%</span>');
        b.addEventListener('click', function () {
          words.push(o.w); likelinessSum += o.p;
          stepIdx++;
          if (stepIdx < cfg.steps.length) renderStep();
          else finish();
        });
        optsEl.appendChild(b);
      });
    }
    function finish() {
      sentenceEl.innerHTML = '“' + esc(words.join(' ')) + '”';
      stepLbl.textContent = '';
      optsEl.innerHTML = '';
      var avg = Math.round(likelinessSum / cfg.steps.length);
      fb.className = 'ctf-feedback show good';
      fb.innerHTML = '<b>You wrote a sentence the AI way — one word at a time!</b><br>' +
        (avg >= 60
          ? 'You mostly picked the <b>most likely</b> words (' + avg + '%) — that\'s exactly what an AI does on its careful setting.'
          : 'You picked <b>surprising</b> words (' + avg + '% likely) — that\'s what an AI does when its creativity dial is turned UP!') +
        (cfg.explain ? '<br>' + cfg.explain : '');
      reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
    }
    renderStep();
  }

  // =========================================================================
  // ORDER — tap the steps in the right order. Wrong picks shake and reset.
  // =========================================================================
  function renderOrder(root, cfg, id) {
    root.innerHTML = header(cfg);
    var items = cfg.items || [];
    // display order: rotate so it's never pre-solved
    var disp = items.map(function (t, i) { return { t: t, i: i }; });
    disp = disp.slice(2).concat(disp.slice(0, 2));
    var seq = el('div', 'ctf-order-seq'); root.appendChild(seq);
    var pool = el('div', 'ctf-options'); root.appendChild(pool);
    var fb = el('div', 'ctf-feedback'); root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);
    var nextExpected = 0;

    function renderSeq() {
      seq.innerHTML = items.slice(0, nextExpected).map(function (t, i) {
        return '<span class="ctf-order-chip">' + (i + 1) + '. ' + esc(t) + '</span>';
      }).join('') || '<span class="ctf-muted">Tap the FIRST step…</span>';
    }
    disp.forEach(function (d) {
      var b = el('button', 'ctf-opt', '<span>' + esc(d.t) + '</span><span class="mark"></span>');
      b.addEventListener('click', function () {
        if (b.disabled) return;
        if (d.i === nextExpected) {
          nextExpected++; b.disabled = true; b.classList.add('is-correct'); b.querySelector('.mark').textContent = nextExpected;
          renderSeq();
          if (nextExpected === items.length) {
            fb.className = 'ctf-feedback show good';
            fb.innerHTML = '<b>Perfect order!</b> ' + (cfg.explain || '');
            reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
          }
        } else {
          b.classList.add('is-wrong'); setTimeout(function () { b.classList.remove('is-wrong'); }, 450);
        }
      });
      pool.appendChild(b);
    });
    renderSeq();
  }

  // =========================================================================
  // NEURON — strengthen connections (weights!) to light the output. You only
  // have a few strength points — spend them on the connections that matter.
  // =========================================================================
  function renderNeuron(root, cfg, id) {
    root.innerHTML = header(cfg);
    var points = cfg.points || 4;
    // fixed tiny net: 2 inputs → 2 hidden → 1 output; 6 edges
    var nodes = { a: [70, 70], b: [70, 210], h1: [240, 70], h2: [240, 210], out: [410, 140] };
    var edges = [["a", "h1"], ["a", "h2"], ["b", "h1"], ["b", "h2"], ["h1", "out"], ["h2", "out"]];
    var strength = edges.map(function () { return 0; });

    var box = el('div', 'ctf-neuron');
    box.innerHTML = '<svg viewBox="0 0 480 280" class="ctf-neuron-svg"></svg>' +
      '<div class="ctf-neuron-hud"><span class="ctf-neuron-pts"></span><button class="ctf-btn ctf-neuron-send">⚡ Send the signal!</button></div>';
    root.appendChild(box);
    var fb = el('div', 'ctf-feedback'); root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);
    var svg = box.querySelector('svg'), ptsEl = box.querySelector('.ctf-neuron-pts');

    function used() { return strength.reduce(function (a, b) { return a + b; }, 0); }
    function draw(lit) {
      lit = lit || {};
      svg.innerHTML =
        edges.map(function (e, i) {
          var p1 = nodes[e[0]], p2 = nodes[e[1]];
          return '<line data-e="' + i + '" x1="' + p1[0] + '" y1="' + p1[1] + '" x2="' + p2[0] + '" y2="' + p2[1] + '"' +
            ' stroke="' + (lit['e' + i] ? '#FFB320' : (strength[i] ? '#2A5FF0' : '#DDE2EC')) + '"' +
            ' stroke-width="' + (3 + strength[i] * 5) + '" stroke-linecap="round" style="cursor:pointer"/>';
        }).join('') +
        Object.keys(nodes).map(function (k) {
          var p = nodes[k], isOut = k === 'out', isIn = k === 'a' || k === 'b';
          return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (isOut ? 30 : 22) + '" fill="' +
            (lit[k] ? '#FFB320' : isIn ? '#12B2BC' : isOut ? '#0F1B3A' : '#2A5FF0') + '"' +
            (isOut && lit[k] ? ' style="filter:drop-shadow(0 0 14px #FFB320)"' : '') + '/>' +
            (isOut ? '<text x="' + p[0] + '" y="' + (p[1] + 5) + '" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">' + (lit[k] ? '💡' : 'OUT') + '</text>' : '');
        }).join('');
      ptsEl.textContent = 'Strength points left: ' + (points - used());
      svg.querySelectorAll('line').forEach(function (ln) {
        ln.addEventListener('click', function () {
          var i = +ln.getAttribute('data-e');
          if (strength[i] < 2 && used() < points) strength[i]++;
          else strength[i] = 0;
          draw();
        });
      });
    }
    box.querySelector('.ctf-neuron-send').addEventListener('click', function () {
      // a path lights if every edge on it has strength >= 1
      var s = {}; edges.forEach(function (e, i) { s[e[0] + ">" + e[1]] = strength[i]; });
      var lit = { a: 1, b: 1 };
      var litEdges = {};
      ["h1", "h2"].forEach(function (h) {
        if (s["a>" + h] || s["b>" + h]) {
          lit[h] = 1;
          if (s["a>" + h]) litEdges["e" + edges.findIndex(function (e) { return e[0] === "a" && e[1] === h; })] = 1;
          if (s["b>" + h]) litEdges["e" + edges.findIndex(function (e) { return e[0] === "b" && e[1] === h; })] = 1;
        }
      });
      var outOk = false;
      ["h1", "h2"].forEach(function (h) {
        if (lit[h] && s[h + ">out"]) { outOk = true; litEdges["e" + edges.findIndex(function (e) { return e[0] === h && e[1] === "out"; })] = 1; }
      });
      if (outOk) lit.out = 1;
      draw(Object.assign(lit, litEdges));
      fb.className = 'ctf-feedback show ' + (outOk ? 'good' : 'info');
      fb.innerHTML = outOk
        ? '<b>💡 The output lit up!</b> You just set the <b>weights</b> — the strong connections decide where the signal flows. That\'s what training tunes, billions of times.'
        : 'No light yet! The signal needs a <b>complete path</b>: strengthen a connection INTO a middle neuron and one FROM it to the output.';
      if (outOk) { reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id); }
    });
    draw();
  }

  // =========================================================================
  // ARCADE — "AI or Not?" Fast-paced sorter: things zoom in, you call it.
  // Score, streak multiplier, per-round timer, instant one-line "why" after
  // every call. Ends with a rank + the big takeaway. Fully replayable.
  // =========================================================================
  function renderArcade(root, cfg, id) {
    root.innerHTML = header(cfg);
    var items = (cfg.items || []).slice();
    var secs = cfg.seconds || 7;
    var labels = cfg.labels || { yes: "🧠 AI!", no: "⚙️ Just a machine" };

    var box = el('div', 'ctf-arcade');
    box.innerHTML =
      '<div class="ctf-arc-hud">' +
        '<span class="ctf-arc-score">⭐ <b>0</b></span>' +
        '<span class="ctf-arc-streak"></span>' +
        '<span class="ctf-arc-round"></span>' +
      '</div>' +
      '<div class="ctf-arc-timer"><i></i></div>' +
      '<div class="ctf-arc-stage"><button class="ctf-btn ctf-arc-start">▶ Start the game!</button></div>' +
      '<div class="ctf-arc-why"></div>' +
      '<div class="ctf-arc-controls">' +
        '<button class="ctf-arc-call ctf-arc-yes">' + esc(labels.yes) + '</button>' +
        '<button class="ctf-arc-call ctf-arc-no">' + esc(labels.no) + '</button>' +
      '</div>';
    root.appendChild(box);
    var done = completionCard(cfg); if (done) root.appendChild(done);

    var stage = box.querySelector('.ctf-arc-stage'), why = box.querySelector('.ctf-arc-why');
    var scoreEl = box.querySelector('.ctf-arc-score b'), streakEl = box.querySelector('.ctf-arc-streak');
    var roundEl = box.querySelector('.ctf-arc-round'), timerEl = box.querySelector('.ctf-arc-timer i');
    var controls = box.querySelector('.ctf-arc-controls');
    var yesBtn = box.querySelector('.ctf-arc-yes'), noBtn = box.querySelector('.ctf-arc-no');

    var round = -1, score = 0, streak = 0, best = 0, timer = null, accepting = false;
    controls.style.visibility = 'hidden';

    function setHud() {
      scoreEl.textContent = score;
      streakEl.innerHTML = streak >= 2 ? '🔥 streak ×' + streak : '';
      roundEl.textContent = round >= 0 ? (Math.min(round + 1, items.length) + ' / ' + items.length) : '';
    }
    function showCard(it) {
      stage.innerHTML = '<div class="ctf-arc-card"><span class="ctf-arc-emoji">' + esc(it.emoji) + '</span><span class="ctf-arc-name">' + esc(it.label) + '</span></div>';
    }
    function startTimer() {
      clearInterval(timer);
      var left = secs * 1000, step = 50;
      timerEl.style.width = '100%'; timerEl.className = '';
      timer = setInterval(function () {
        left -= step;
        timerEl.style.width = Math.max(0, left / (secs * 1000) * 100) + '%';
        if (left < secs * 333) timerEl.className = 'hot';
        if (left <= 0) { clearInterval(timer); if (accepting) call(null); }
      }, step);
    }
    function nextRound() {
      round++;
      why.className = 'ctf-arc-why'; why.innerHTML = '';
      if (round >= items.length) return finish();
      setHud();
      showCard(items[round]);
      controls.style.visibility = '';
      accepting = true;
      startTimer();
    }
    function call(saidAI) {
      if (!accepting) return;
      accepting = false; clearInterval(timer);
      var it = items[round];
      var card = stage.querySelector('.ctf-arc-card');
      var right = saidAI !== null && saidAI === !!it.ai;
      if (right) {
        streak++; best = Math.max(best, streak);
        var pts = 10 * (streak >= 3 ? 2 : 1);
        score += pts;
        if (card) { card.classList.add('win'); card.insertAdjacentHTML('beforeend', '<span class="ctf-arc-pts">+' + pts + '</span>'); }
        why.className = 'ctf-arc-why show good';
        why.innerHTML = '<b>' + (it.ai ? '🧠 Yes — AI!' : '⚙️ Right — just a machine!') + '</b> ' + esc(it.why || '');
      } else {
        streak = 0;
        if (card) card.classList.add('lose');
        why.className = 'ctf-arc-why show bad';
        why.innerHTML = '<b>' + (saidAI === null ? '⏰ Time\'s up!' : (it.ai ? '🧠 It\'s actually AI!' : '⚙️ It\'s just a machine!')) + '</b> ' + esc(it.why || '');
      }
      setHud();
      controls.style.visibility = 'hidden';
      setTimeout(nextRound, right ? 1400 : 2300);
    }
    function finish() {
      clearInterval(timer);
      controls.style.visibility = 'hidden';
      timerEl.style.width = '0%';
      var max = items.length * 10 * 2, pct = score / (items.length * 10);
      var rank = pct >= 1.4 ? '👑 AI BOSS' : pct >= 1 ? '🕵️ AI Detective' : pct >= .6 ? '🔍 AI Spotter' : '🌱 AI Explorer';
      stage.innerHTML = '<div class="ctf-arc-end"><div class="ctf-arc-rank">' + rank + '</div>' +
        '<div class="ctf-arc-final">⭐ ' + score + ' points · best streak 🔥' + best + '</div>' +
        '<p class="ctf-arc-takeaway">' + esc(cfg.takeaway || 'If it LEARNS from examples and makes guesses — it\'s AI. If it follows the same fixed steps every time — it\'s just a machine.') + '</p>' +
        '<button class="ctf-btn ctf-arc-again">↺ Play again</button></div>';
      stage.querySelector('.ctf-arc-again').addEventListener('click', function () {
        round = -1; score = 0; streak = 0; best = 0; setHud(); nextRound();
      });
      reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
    }
    box.querySelector('.ctf-arc-start').addEventListener('click', nextRound);
    yesBtn.addEventListener('click', function () { call(true); });
    noBtn.addEventListener('click', function () { call(false); });
    setHud();
  }

  // ---- registry + boot ----------------------------------------------------
  var RENDERERS = { poll: renderPoll, sort: renderSort, choice: renderChoice, nextword: renderNextWord, attention: renderAttention, quiz: renderQuiz, timeline: renderTimeline, reveal: renderReveal, slider: renderSlider, trainer: renderTrainer, match: renderMatch, draw: renderDraw, wordchain: renderWordChain, order: renderOrder, neuron: renderNeuron, arcade: renderArcade };

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
