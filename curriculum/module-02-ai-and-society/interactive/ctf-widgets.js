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
    // let the lesson player know this activity is finished (it gates "Continue")
    try { document.dispatchEvent(new CustomEvent('ctf:widget-done', { detail: { id: id } })); } catch (e) {}
  }
  function isDone(id) { return load(id + ':done') === true; }

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

  // =========================================================================
  // POWER-UP THE CITY (Mission 4) — a full-screen clean-energy management SIM.
  // Across a day, balance solar + wind + battery against the city's demand.
  // Store surplus clean power for the evening rush; mismanage and the lights
  // go out (blackout) or the smog rises (dirty backup). An AI advisor predicts
  // the day. Trial-and-error: replay to find the smart balance — exactly what
  // real grid AI does.
  // =========================================================================
  function renderPowerCity(root, cfg, id) {
    root.innerHTML = header(cfg);
    var hostInline = el('div', 'pc-launchwrap'); root.appendChild(hostInline);
    var fb = el('div', 'ctf-feedback good'); fb.textContent = cfg.thanks || "You balanced the city's power like a real grid AI! 🌱";
    root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);

    // 8 time blocks across a day — solar peaks midday, demand peaks evening.
    var BLOCKS = cfg.blocks || [
      { t:'Dawn',        ico:'🌅', solar:10, wind:22, demand:28, sky:'#37487e' },
      { t:'Morning',     ico:'🌄', solar:38, wind:16, demand:34, sky:'#5a78c0' },
      { t:'Late Morning',ico:'⛅', solar:58, wind:12, demand:38, sky:'#79a6ee' },
      { t:'Midday',      ico:'🌞', solar:80, wind:10, demand:42, sky:'#7db4ff' },
      { t:'Afternoon',   ico:'🌤️', solar:50, wind:18, demand:48, sky:'#6a93d8' },
      { t:'Evening',     ico:'🌆', solar:14, wind:24, demand:84, sky:'#bd6a48' },
      { t:'Night',       ico:'🌙', solar:0,  wind:30, demand:60, sky:'#161e40' },
      { t:'Late Night',  ico:'🌌', solar:0,  wind:26, demand:40, sky:'#0e1430' }
    ];
    var BAT_CAP = cfg.battery || 65;
    // Spontaneous grid disruptions — each modifies one block's numbers.
    var EVENTS = [
      { id:'storm',    ban:'⛈️ Storm rolling in!',     fore:'a storm — the sun will vanish',        apply:function(b){ b.solar = Math.round(b.solar*0.1); } },
      { id:'cloud',    ban:'🌫️ Clouds covered the sun', fore:'clouds — less solar than usual',        apply:function(b){ b.solar = Math.round(b.solar*0.45); } },
      { id:'heat',     ban:'🔥 Heat wave!',             fore:'a heat wave — everyone blasts the AC',  apply:function(b){ b.demand += 24; } },
      { id:'turbine',  ban:'🔧 A wind turbine broke',   fore:'a turbine fault — wind power will drop', apply:function(b){ b.wind = Math.round(b.wind*0.4); } },
      { id:'factory',  ban:'⚡ A big factory switched on', fore:'a factory powering up — demand spikes', apply:function(b){ b.demand += 18; } },
      { id:'festival', ban:'🎉 City festival tonight!',  fore:'a festival tonight — huge demand',      apply:function(b){ b.demand += 28; } }
    ];
    var overlay = null, wrap = null, S = null;

    function markGate(){ fb.classList.add('show'); reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id); }

    // ---- inline launch card (clear goal) → full-screen takeover -------------
    function launchCard(replayed){
      hostInline.innerHTML =
        '<div class="pc-launch">' +
          '<div class="pc-lico">🏙️⚡</div>' +
          '<h3>Power-Up the City</h3>' +
          '<p><b>Your job:</b> keep the city\'s <b>lights on</b> (no blackouts) and the <b>air clean</b> (no smog) for a whole day — running on free sun and wind. They come and go, and <b>surprise events will hit the grid</b>. The trick: <b>store extra power</b> when you have it, so you survive the rushes. Your AI advisor forecasts what\'s coming.</p>' +
          '<button class="pc-btn" data-go>' + (replayed ? '🔁 Play again' : '▶  Take control') + ' &nbsp;(full screen)</button>' +
        '</div>';
      hostInline.querySelector('[data-go]').addEventListener('click', openFull);
    }

    function openFull(){
      overlay = el('div', 'ctf-fs'); wrap = el('div', 'ctf-pc'); overlay.appendChild(wrap);
      document.body.appendChild(overlay);
      try { document.documentElement.classList.add('ctf-fs-lock'); } catch(e){}
      intro();
    }
    function closeFull(){
      if (overlay && overlay.parentNode) overlay.remove(); overlay = null; wrap = null;
      try { document.documentElement.classList.remove('ctf-fs-lock'); } catch(e){}
    }

    function intro(){
      wrap.setAttribute('data-screen', 'intro');
      wrap.innerHTML =
        '<button class="pc-exit" data-exit title="Leave">✕</button>' +
        '<div class="pc-sky" style="--sky:#16224d"></div><div class="pc-stars"></div>' +
        '<div class="pc-introbox">' +
          '<div class="pc-introbot">🤖⚡</div>' +
          '<h2>Run the city for a day.</h2>' +
          '<p>Keep the <b>lights on</b> and the <b>air clean</b>. Bank extra sun &amp; wind in your <b>battery</b> — then spend it when surprise events strike. I\'m your <b>AI advisor</b>; I\'ll forecast what\'s coming so you can plan.</p>' +
          '<button class="pc-btn" data-go>▶  Start the day</button>' +
          '<p class="pc-mini">8 time blocks · zero blackouts &amp; zero smog = perfect</p>' +
        '</div>';
      wrap.querySelector('[data-go]').addEventListener('click', start);
      wrap.querySelector('[data-exit]').addEventListener('click', closeFull);
    }

    function planEvents(){
      // assign a disruption to ~half the blocks (never the first — let them settle in)
      S.events = BLOCKS.map(function(_, i){
        if (i === 0) return null;
        return Math.random() < 0.5 ? EVENTS[Math.floor(Math.random()*EVENTS.length)] : null;
      });
    }

    function start(){
      S = { bi:0, battery:0, smog:0, blackouts:0, dirty:0, answered:false };
      planEvents();
      wrap.setAttribute('data-screen', 'play');
      wrap.innerHTML =
        '<button class="pc-exit" data-exit title="Leave">✕</button>' +
        '<div class="pc-sky"></div><div class="pc-stars"></div>' +
        '<div class="pc-arc"><span class="pc-sun">☀️</span></div>' +
        '<div class="pc-smog"></div>' +
        '<div class="pc-hud">' +
          '<div class="pc-time"></div>' +
          '<div class="pc-meters">' +
            '<span class="pc-meter" title="Lights"><b>💡</b><span class="pc-bar"><i class="pc-power"></i></span></span>' +
            '<span class="pc-meter" title="Clean air"><b>🌱</b><span class="pc-bar"><i class="pc-clean"></i></span></span>' +
          '</div>' +
        '</div>' +
        '<div class="pc-eventban" data-eventban></div>' +
        '<div class="pc-scene">' +
          '<div class="pc-turbine">🗼<span class="pc-blades">✚</span></div>' +
          '<div class="pc-city"></div>' +
          '<div class="pc-batwrap"><div class="pc-bat"><div class="pc-bat-fill"></div></div><span class="pc-bat-lbl"></span></div>' +
        '</div>' +
        '<div class="pc-advisor"><span class="pc-abot">🤖</span><div class="pc-bubble"></div></div>' +
        '<div class="pc-panel"></div>';
      var city = wrap.querySelector('.pc-city');
      for (var i=0;i<9;i++){ var b=el('div','pc-bldg'); b.style.height=(46 + (i*37%80))+'px';
        var win=''; for(var w=0;w<8;w++) win+='<i></i>'; b.innerHTML='<div class="pc-wins">'+win+'</div>'; city.appendChild(b); }
      wrap.querySelector('[data-exit]').addEventListener('click', closeFull);
      renderBlock();
    }

    function setMeters(blackout){
      var p = Math.max(0, 100 - S.blackouts*34);
      var c = Math.max(0, 100 - S.dirty);
      wrap.querySelector('.pc-power').style.width = p + '%';
      wrap.querySelector('.pc-clean').style.width = c + '%';
      wrap.querySelector('.pc-power').style.background = p>=66?'#3FD08A':p>=33?'#FFB320':'#FF5A38';
      wrap.querySelector('.pc-clean').style.background = c>=66?'#3FD08A':c>=33?'#FFB320':'#FF5A38';
      wrap.querySelector('.pc-smog').style.opacity = Math.min(.75, S.dirty/90);
      var f = wrap.querySelector('.pc-bat-fill'); f.style.height = Math.round(Math.min(1,S.battery/BAT_CAP)*100)+'%';
      wrap.querySelector('.pc-bat-lbl').textContent = '🔋 ' + Math.round(S.battery) + '/' + BAT_CAP;
      wrap.querySelector('.pc-city').classList.toggle('dark', !!blackout);
    }
    function tip(msg){ wrap.querySelector('.pc-bubble').innerHTML = msg; }

    function renderBlock(){
      // copy the base block, then apply this block's surprise event (if any)
      var base = BLOCKS[S.bi], ev = S.events[S.bi];
      var B = { t:base.t, ico:base.ico, sky:base.sky, solar:base.solar, wind:base.wind, demand:base.demand };
      if (ev) ev.apply(B);
      var clean = B.solar + B.wind, surplus = clean - B.demand;
      S.answered = false;

      var sky = wrap.querySelector('.pc-sky'); sky.style.setProperty('--sky', B.sky);
      wrap.querySelector('.pc-arc').style.setProperty('--p', (S.bi/(BLOCKS.length-1)));
      wrap.querySelector('.pc-sun').textContent = S.bi>=6 ? '🌙' : (S.bi>=5?'🌇':'☀️');
      wrap.querySelector('.pc-blades').style.animationDuration = (1.5 - B.wind/40) + 's';
      wrap.querySelector('.pc-time').innerHTML = 'Block ' + (S.bi+1) + ' / ' + BLOCKS.length + ' &nbsp;·&nbsp; ' + B.ico + ' <b>' + B.t + '</b>';
      setMeters(false);

      // surprise-event banner for THIS block
      var ban = wrap.querySelector('[data-eventban]');
      if (ev){ ban.innerHTML = '<span>' + ev.ban + '</span>'; ban.classList.remove('show'); void ban.offsetWidth; ban.classList.add('show'); }
      else { ban.classList.remove('show'); ban.innerHTML=''; }

      // AI advisor — forecasts the NEXT block's surprise so the kid can plan
      var nextEv = S.events[S.bi+1];
      if (nextEv) tip('🔮 <b>Forecast:</b> ' + nextEv.fore + ' next block. <b>Bank power now</b> if you can!');
      else if (surplus > 0) tip(B.solar>=45 ? '☀️ Big sun! <b>Store</b> this extra power for the evening rush.' : 'A little extra clean power — <b>bank it</b> for later.');
      else tip(S.battery >= -surplus ? '🔋 Demand\'s high — good thing you charged the battery!' : '⚠️ Low battery and high demand… this is the tricky part.');

      var panel = wrap.querySelector('.pc-panel');
      var sums = '<div class="pc-sums"><span class="pc-pill s">☀️ ' + B.solar + '</span><span class="pc-pill w">🌬️ ' + B.wind + '</span><span class="pc-eq">=</span><span class="pc-pill c">⚡ ' + clean + ' clean</span><span class="pc-vs">vs</span><span class="pc-pill d">🏠 needs ' + B.demand + '</span></div>';
      if (surplus >= 0){
        panel.innerHTML = sums +
          '<div class="pc-ask">You have <b>+' + surplus + '</b> spare clean power. What now?</div>' +
          '<div class="pc-choices"><button class="pc-ch good" data-a="store">🔋 Store it in the battery</button><button class="pc-ch" data-a="waste">💨 Just use it now</button></div>' +
          '<div class="pc-out"></div>';
      } else {
        var need = -surplus;
        panel.innerHTML = sums +
          '<div class="pc-ask">You\'re <b>' + need + ' short!</b> Keep the city running how?</div>' +
          '<div class="pc-choices">' +
            '<button class="pc-ch good" data-a="bat">🔋 Use battery <small>(have ' + Math.round(S.battery) + ')</small></button>' +
            '<button class="pc-ch" data-a="dim">🔅 Dim the city <small>(save power, risky)</small></button>' +
            '<button class="pc-ch" data-a="dirty">🏭 Smoky backup <small>(+smog)</small></button>' +
          '</div>' +
          '<div class="pc-out"></div>';
      }
      panel.querySelectorAll('.pc-ch').forEach(function(btn){ btn.addEventListener('click', function(){ choose(btn.getAttribute('data-a'), B, surplus); }); });
    }

    function choose(a, B, surplus){
      if (S.answered) return; S.answered = true;
      var panel = wrap.querySelector('.pc-panel');
      panel.querySelectorAll('.pc-ch').forEach(function(b){ b.disabled = true; });
      var out = panel.querySelector('.pc-out'), msg = '', blackout = false;
      if (a === 'store'){ var room = BAT_CAP - S.battery, kept = Math.min(room, surplus);
        S.battery += kept; msg = '✅ Banked ' + Math.round(kept) + ' in the battery' + (kept<surplus?' (it\'s full!)':'') + '. Smart — you\'ll need it.'; pulse('.pc-bat'); }
      else if (a === 'waste'){ msg = '😬 That clean power just… vanished. Nothing saved for when a surprise hits.'; }
      else if (a === 'bat'){ var need = -surplus;
        if (S.battery >= need){ S.battery -= need; msg = '✅ Battery covered it — clean and bright, no smog!'; pulse('.pc-bat'); }
        else { var used = S.battery, gap = need - used; S.battery = 0; S.blackouts++; blackout = true;
          msg = '🌑 Battery ran dry — the city <b>blacked out</b> (short by ' + Math.round(gap) + ')! Bank more clean power before the surges.'; flicker(); } }
      else if (a === 'dim'){ var need2 = -surplus;
        if (need2 <= 14){ msg = '🔅 You dimmed the streetlights and squeaked by — clean, no smog. Bold move!'; }
        else { S.blackouts++; blackout = true; msg = '🌑 Too big a gap to dim away — parts of the city <b>blacked out</b>. Save the dimming for small shortfalls!'; flicker(); } }
      else if (a === 'dirty'){ var n = -surplus; S.dirty += n; S.smog += n;
        msg = '🏭 The smoky backup kept the lights on, but the air got dirtier (+' + n + ' smog).'; smogPuff(); }
      setMeters(blackout);
      out.innerHTML = '<p class="pc-msg">' + msg + '</p><button class="pc-next" data-next>' + (S.bi >= BLOCKS.length-1 ? 'See how the day went →' : 'Next block ▶') + '</button>';
      out.querySelector('[data-next]').addEventListener('click', next);
    }

    function next(){ if (S.bi >= BLOCKS.length-1){ result(); return; } S.bi++; renderBlock(); }

    function result(){
      var perfect = S.blackouts === 0 && S.dirty === 0;
      var litClean = S.blackouts === 0;
      var title, icon, sub, cls;
      if (perfect){ icon='🌟'; title='Perfect day!'; cls='win'; sub='Zero blackouts, zero smog — through every surprise the grid threw at you. You banked power early and spent it exactly when it mattered. That\'s how real AI runs a power grid!'; }
      else if (litClean){ icon='💡'; title='Lights stayed on!'; cls='ok'; sub='The city never went dark — but the smoky backup ran ' + (S.dirty>0?'a few times':'') + '. Watch the AI\'s forecasts and bank more clean power before each surge to cut the smog to zero.'; }
      else { icon='🌑'; title='The city went dark.'; cls='bad'; sub='Blackouts happen when a surprise hits and the battery\'s empty. The fix: store extra sun &amp; wind whenever the advisor warns a storm or rush is coming. Give it another go!'; }
      wrap.setAttribute('data-screen', 'result');
      wrap.innerHTML =
        '<div class="pc-sky" style="--sky:' + (litClean?'#16352b':'#3a1620') + '"></div><div class="pc-stars"></div>' +
        '<div class="pc-resultbox ' + cls + '">' +
          '<div class="pc-rico">' + icon + '</div>' +
          '<h2>' + title + '</h2>' +
          '<div class="pc-rstats"><span>💡 Blackouts: <b>' + S.blackouts + '</b></span><span>🌱 Clean air: <b>' + Math.max(0,100-S.dirty) + '%</b></span></div>' +
          '<p>' + sub + '</p>' +
          '<div class="pc-ractions"><button class="pc-btn" data-replay>🔁 Play again</button><button class="pc-btn ghost" data-back>✓ Back to the lesson</button></div>' +
        '</div>';
      wrap.querySelector('[data-replay]').addEventListener('click', start);
      wrap.querySelector('[data-back]').addEventListener('click', function(){ closeFull(); launchCard(true); });
      markGate();   // one full day opens the Continue gate; kids can replay to ace it
    }

    function pulse(sel){ var n=wrap.querySelector(sel); if(n){ n.classList.remove('pc-pulse'); void n.offsetWidth; n.classList.add('pc-pulse'); } }
    function flicker(){ var c=wrap.querySelector('.pc-city'); if(c){ c.classList.add('pc-flicker'); setTimeout(function(){ c.classList.remove('pc-flicker'); }, 900); } }
    function smogPuff(){ var s=wrap.querySelector('.pc-smog'); if(s){ s.classList.remove('pc-puff'); void s.offsetWidth; s.classList.add('pc-puff'); } }

    var prior = id ? load(id + ':done') : null;
    if (prior){ fb.classList.add('show'); reveal(done, (cfg.complete && cfg.complete.progress) || 100); }
    launchCard(!!prior);
  }

  // =========================================================================
  // fsGame — reusable FULL-SCREEN game shell shared by every Module-2/3 game.
  // Renders an inline launch card in `root`; tapping it opens a full-viewport
  // overlay and runs opts.play(host, api):
  //   api.done()   → mark the activity complete + open the Continue gate
  //   api.exit()   → close the overlay, back to the lesson
  //   api.replay() → re-run play() on a fresh host
  // play() builds the game inside `host` (a .ctf-fs scene) and calls api.done()
  // when finished; give your win screen a button that calls api.exit().
  // =========================================================================
  function fsGame(root, cfg, id, opts){
    root.innerHTML = header(cfg);
    var hostInline = el('div','imm-launchwrap'); root.appendChild(hostInline);
    var fb = el('div','ctf-feedback good'); fb.textContent = cfg.thanks || opts.thanks || 'Great work!'; root.appendChild(fb);
    var doneCard = completionCard(cfg); if(doneCard) root.appendChild(doneCard);
    var overlay=null, gated=false;
    function gate(){ if(gated) return; gated=true; fb.classList.add('show'); reveal(doneCard,(cfg.complete&&cfg.complete.progress)||100); markDone(id); }
    function launch(replayed){
      hostInline.innerHTML =
        '<div class="imm-launch">'+
          '<div class="imm-lico">'+(opts.ico||'🎮')+'</div>'+
          '<h3>'+esc(opts.title||cfg.title||'Play')+'</h3>'+
          (opts.blurb?'<p>'+opts.blurb+'</p>':'')+
          '<button class="imm-btn" data-go>'+(replayed?'🔁 Play again':(opts.playLabel||'▶  Play'))+'&nbsp; (full screen)</button>'+
        '</div>';
      hostInline.querySelector('[data-go]').addEventListener('click', open);
    }
    function open(){
      overlay = el('div','ctf-fs');
      var host = el('div','imm-stage '+(opts.wrapClass||'')); overlay.appendChild(host);
      var exit = el('button','imm-exit','✕'); exit.title='Leave'; exit.addEventListener('click', close); overlay.appendChild(exit);
      document.body.appendChild(overlay);
      try{ document.documentElement.classList.add('ctf-fs-lock'); }catch(e){}
      var api = { host:host, done:gate, exit:close, replay:function(){ host.innerHTML=''; opts.play(host, api); } };
      opts.play(host, api);
    }
    function close(){ if(overlay&&overlay.parentNode) overlay.remove(); overlay=null; try{document.documentElement.classList.remove('ctf-fs-lock');}catch(e){} launch(true); }
    var prior = id ? load(id+':done') : null;
    if(prior){ gated=true; fb.classList.add('show'); reveal(doneCard,(cfg.complete&&cfg.complete.progress)||100); }
    launch(!!prior);
  }

  // shared game helpers ------------------------------------------------------
  function shuffle(a){ a = a.slice(); for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)), t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
  // A win/lose result screen used by every full-screen game. win=true shows the
  // "Back to the lesson" button (game complete); win=false shows only "Try again".
  function immResult(ico, title, win, body){
    return '<div class="imm-resbg"></div><div class="imm-result '+(win?'win':'lose')+'">'+
      '<div class="imm-rico">'+ico+'</div><h2>'+title+'</h2><div class="imm-rbody">'+body+'</div>'+
      '<div class="imm-ractions">'+
        (win ? '<button class="imm-btn" data-replay>🔁 Play again</button><button class="imm-btn ghost" data-back>✓ Back to the lesson</button>'
             : '<button class="imm-btn" data-replay>🔁 Try again</button>')+
      '</div></div>';
  }
  // wire the result buttons. onReplay restarts the round; win also closes via api.exit.
  function bindRes(host, api, onReplay){
    var r=host.querySelector('[data-replay]'); if(r) r.addEventListener('click', onReplay);
    var b=host.querySelector('[data-back]'); if(b) b.addEventListener('click', api.exit);
  }

  // =========================================================================
  // AI AROUND THE WORLD (Mission 2) — full-screen discovery game. AI is woven
  // through the whole world, quietly doing jobs you never see. Travel a map to
  // real places; each is a quick hands-on moment that uncovers the hidden AI.
  // =========================================================================
  function renderAIWorld(root, cfg, id) {
    var SPOTS = cfg.spots || [
      { id:'hospital', icon:'🏥', name:'Hospital',      x:22, y:30, kind:'scan',    job:'AI helps doctors <b>spot problems in scans</b> that tired eyes might miss.' },
      { id:'farm',     icon:'🌾', name:'Farm',          x:70, y:24, kind:'farm',    job:'AI <b>drones scan fields</b> and tell farmers exactly which plants are thirsty.' },
      { id:'weather',  icon:'🌦️', name:'Weather Center', x:48, y:54, kind:'storm',   job:'AI <b>watches the skies</b> and warns whole cities before a storm hits.' },
      { id:'traffic',  icon:'🚦', name:'Traffic Hub',    x:78, y:64, kind:'traffic', job:'AI <b>reroutes thousands of cars</b> at once around traffic jams.' },
      { id:'lab',      icon:'🔬', name:'Science Lab',    x:26, y:70, kind:'lab',     job:'AI <b>tests millions of mixes</b> to help invent brand-new medicines.' }
    ];
    fsGame(root, cfg, id, {
      ico:'🌍', title: cfg.title || 'AI Around the World',
      blurb: 'AI is hiding all over the real world, quietly doing jobs you never see. Travel the map, lend a hand at each place, and uncover every invisible helper.',
      playLabel:'▶  Explore the world', wrapClass:'ctf-aw',
      thanks: cfg.thanks || "AI is everywhere — quietly helping, and you never noticed. 🌍",
      play: function(host, api){
        var found = {};
        function countFound(){ return SPOTS.filter(function(s){ return found[s.id]; }).length; }
        function map(){
          host.setAttribute('data-screen','map');
          var pins = SPOTS.map(function(s){
            return '<button class="aw-pin'+(found[s.id]?' done':'')+'" style="left:'+s.x+'%;top:'+s.y+'%" data-id="'+s.id+'">'+
              '<span class="aw-pico">'+(found[s.id]?'✅':s.icon)+'</span><span class="aw-plbl">'+esc(s.name)+'</span></button>';
          }).join('');
          host.innerHTML =
            '<div class="aw-mapbg"></div>'+
            '<div class="aw-top"><span class="aw-count">🔎 Found <b>'+countFound()+'</b> / '+SPOTS.length+'</span>'+
              '<span class="aw-hint">Tap a place to uncover the hidden AI</span></div>'+
            '<div class="aw-map">'+pins+'</div>';
          host.querySelectorAll('.aw-pin').forEach(function(p){
            p.addEventListener('click', function(){ var s=SPOTS.filter(function(x){return x.id===p.getAttribute('data-id');})[0]; openSpot(s); });
          });
        }
        function openSpot(spot){
          host.setAttribute('data-screen','spot');
          host.innerHTML =
            '<div class="aw-spotbg"></div>'+
            '<div class="aw-shead"><button class="aw-back" data-back>‹ Map</button><span class="aw-stitle">'+spot.icon+' '+esc(spot.name)+'</span></div>'+
            '<div class="aw-instr" data-instr></div>'+
            '<div class="aw-stage" data-stage></div>'+
            '<div class="aw-reveal" data-reveal></div>';
          host.querySelector('[data-back]').addEventListener('click', map);
          var stage = host.querySelector('[data-stage]'), instr = host.querySelector('[data-instr]');
          buildScene(spot, stage, instr, function(){ solved(spot); });
        }
        function solved(spot){
          found[spot.id] = true;
          var rev = host.querySelector('[data-reveal]');
          rev.innerHTML = '<div class="aw-card"><div class="aw-ctick">✨ AI found!</div><p>'+spot.job+'</p>'+
            '<button class="aw-btn" data-next>'+(countFound()>=SPOTS.length ? 'See what you discovered →' : '← Keep exploring')+'</button></div>';
          rev.classList.add('show');
          host.querySelector('.aw-stage').classList.add('aw-dim');
          rev.querySelector('[data-next]').addEventListener('click', function(){ countFound()>=SPOTS.length ? win() : map(); });
        }
        function win(){
          host.setAttribute('data-screen','win');
          host.innerHTML =
            '<div class="aw-mapbg"></div>'+
            '<div class="aw-winbox"><div class="aw-wico">🌍✨</div>'+
              '<h2>You found AI hiding <b>all over the world!</b></h2>'+
              '<p>Doctors, farms, weather, traffic, science labs — AI is woven through the whole world, quietly doing jobs you never see. It was there all along!</p>'+
              '<div class="aw-found">'+SPOTS.map(function(s){return '<span>'+s.icon+'</span>';}).join('')+'</div>'+
              '<div class="imm-ractions"><button class="aw-btn" data-replay>🔁 Explore again</button><button class="aw-btn ghost" data-back>✓ Back to the lesson</button></div>'+
            '</div>';
          host.querySelector('[data-replay]').addEventListener('click', function(){ found={}; map(); });
          host.querySelector('[data-back]').addEventListener('click', api.exit);
          api.done();
        }
        map();
      }
    });

    // ---- the hands-on scenes (tap to solve, mistakes just nudge + retry) ----
    function buildScene(spot, stage, instr, onSolve){
      function ok(){ onSolve(); }
      function nudge(msg){ instr.setAttribute('data-bad','1'); instr.querySelector('.aw-nudge') ? (instr.querySelector('.aw-nudge').textContent=msg) : instr.insertAdjacentHTML('beforeend',' <span class="aw-nudge">'+esc(msg)+'</span>'); }

      if (spot.kind === 'scan'){
        instr.innerHTML = 'The AI highlighted a few spots on this scan. <b>Tap the one that looks different</b> — that\'s the problem.';
        var pos=[[28,40],[60,30],[46,64],[74,58]], bad=Math.floor(Math.random()*4);
        stage.innerHTML='<div class="aw-scan">'+pos.map(function(p,i){return '<button class="aw-spotdot'+(i===bad?' odd':'')+'" style="left:'+p[0]+'%;top:'+p[1]+'%" data-i="'+i+'"></button>';}).join('')+'</div>';
        stage.querySelectorAll('.aw-spotdot').forEach(function(d){ d.addEventListener('click',function(){
          if(+d.getAttribute('data-i')===bad){ d.classList.add('hit'); ok(); } else { d.classList.add('miss'); nudge('That spot looks normal — find the odd one out.'); setTimeout(function(){d.classList.remove('miss');},500); }
        }); });
      }
      else if (spot.kind === 'farm'){
        instr.innerHTML = 'The drone scanned the farm. <b>Tap every dry field</b> that needs water. 💧';
        var n=9, dry={}; while(Object.keys(dry).length<4){ dry[Math.floor(Math.random()*n)]=true; }
        var tiles=''; for(var i=0;i<n;i++){ tiles+='<button class="aw-field'+(dry[i]?' dry':'')+'" data-i="'+i+'">'+(dry[i]?'🟫':'🌱')+'</button>'; }
        stage.innerHTML='<div class="aw-farm">'+tiles+'</div>';
        var watered=0, total=Object.keys(dry).length;
        stage.querySelectorAll('.aw-field').forEach(function(t){ t.addEventListener('click',function(){
          if(t.classList.contains('done')) return;
          if(t.classList.contains('dry')){ t.classList.add('done'); t.textContent='💧'; watered++; if(watered>=total) ok(); }
          else { t.classList.add('miss'); nudge('That field\'s healthy — look for the brown, dry ones.'); setTimeout(function(){t.classList.remove('miss');},500); }
        }); });
      }
      else if (spot.kind === 'storm'){
        instr.innerHTML = 'A storm is rolling in! ⬇️ <b>Tap the city right in its path</b> so the AI can warn them in time.';
        var hit=Math.floor(Math.random()*3);
        stage.innerHTML='<div class="aw-sky">'+
          '<div class="aw-stormrow">'+[0,1,2].map(function(i){return '<span class="aw-stormslot">'+(i===hit?'⛈️<b>⬇️</b>':'')+'</span>';}).join('')+'</div>'+
          '<div class="aw-cities">'+[0,1,2].map(function(i){return '<button class="aw-city" data-i="'+i+'">🏙️<small>City '+(i+1)+'</small></button>';}).join('')+'</div></div>';
        stage.querySelectorAll('.aw-city').forEach(function(c){ c.addEventListener('click',function(){
          if(+c.getAttribute('data-i')===hit){ c.classList.add('hit'); ok(); } else { c.classList.add('miss'); nudge('Look up — which city is right under the storm cloud?'); setTimeout(function(){c.classList.remove('miss');},500); }
        }); });
      }
      else if (spot.kind === 'traffic'){
        instr.innerHTML = 'The main road is jammed! <b>Tap the open side road</b> to reroute the cars around it.';
        var openSide=Math.random()<.5?0:1;
        stage.innerHTML='<div class="aw-road"><div class="aw-jam">🚗🚕🚙 🚧</div>'+
          '<button class="aw-detour" data-i="0">'+(openSide===0?'⬅️ Side road':'🚧 Closed')+'</button>'+
          '<button class="aw-detour" data-i="1">'+(openSide===1?'Side road ➡️':'🚧 Closed')+'</button></div>';
        stage.querySelectorAll('.aw-detour').forEach(function(b){ b.addEventListener('click',function(){
          if(+b.getAttribute('data-i')===openSide){ b.classList.add('hit'); stage.querySelector('.aw-jam').classList.add('aw-flow'); stage.querySelector('.aw-jam').innerHTML='🚗  🚕  🚙  ✅'; setTimeout(ok,600); }
          else { b.classList.add('miss'); nudge('That road is blocked too — try the other side.'); setTimeout(function(){b.classList.remove('miss');},500); }
        }); });
      }
      else if (spot.kind === 'lab'){
        instr.innerHTML = 'The AI says the cure <b>glows when two BLUES mix</b>. Tap the matching pair. 🔬';
        var mixes=[['🔵','🔴'],['🔵','🔵'],['🔴','🔴']]; // index 1 correct, then shuffle
        var order=[0,1,2].sort(function(){return Math.random()-.5;}); var correct=order.indexOf(1);
        stage.innerHTML='<div class="aw-lab">'+order.map(function(m,i){return '<button class="aw-mix" data-i="'+i+'"><span>'+mixes[m][0]+'</span><b>+</b><span>'+mixes[m][1]+'</span></button>';}).join('')+'</div>';
        stage.querySelectorAll('.aw-mix').forEach(function(b){ b.addEventListener('click',function(){
          if(+b.getAttribute('data-i')===correct){ b.classList.add('hit'); b.innerHTML='<span>🔵</span><b>+</b><span>🔵</span> ✨'; setTimeout(ok,500); }
          else { b.classList.add('miss'); nudge('Not a match — look for two blue dots.'); setTimeout(function(){b.classList.remove('miss');},500); }
        }); });
      }
    }
  }

  // =========================================================================
  // DIAGNOSIS LAB (Mission 3) — you are the AI helping a doctor read scans.
  // Find the few cells that look "off" on each scan; submit; save the patient.
  // Subtle on purpose: spotting the difference is hard. 3 hearts, 4 patients.
  // =========================================================================
  function renderDiagnose(root, cfg, id){
    fsGame(root, cfg, id, { ico:'🩺', title: cfg.title||'Diagnosis Lab',
      blurb:'You are the AI that helps a doctor read patient scans. On each scan a few cells are <b>not healthy</b> — they look just a little different. Flag every bad cell and none of the healthy ones, then submit. You have 3 hearts. Save all four patients!',
      playLabel:'▶  Start the shift', wrapClass:'g-diag',
      thanks: cfg.thanks || 'You and the doctor make a great team. 🩺',
      play:function(host, api){
        var TOTAL=4, GRID=16, patient=0, hearts=3, flags={}, abset={};
        function start(){ patient=0; hearts=3; nextPatient(); }
        function nextPatient(){
          if(patient>=TOTAL) return win();
          flags={}; abset={}; var k=1+Math.floor(Math.random()*3);
          while(Object.keys(abset).length<k){ abset[Math.floor(Math.random()*GRID)]=true; }
          render();
        }
        function render(){
          var cells=''; for(var i=0;i<GRID;i++){ cells+='<button class="dg-cell'+(abset[i]?' ab':'')+(flags[i]?' flagged':'')+'" data-i="'+i+'"><span class="dg-tissue"></span>'+(flags[i]?'<span class="dg-flag">⚑</span>':'')+'</button>'; }
          host.innerHTML='<div class="dg-bg"></div>'+
            '<div class="dg-top"><span>🧑‍⚕️ Patient '+(patient+1)+' / '+TOTAL+'</span><span class="dg-hearts">'+'❤️'.repeat(hearts)+'🖤'.repeat(3-hearts)+'</span></div>'+
            '<div class="dg-instr">Tap the cells that look <b>different</b> (not healthy), then submit.</div>'+
            '<div class="dg-grid">'+cells+'</div>'+
            '<button class="imm-btn dg-submit" data-submit>🩺 Submit diagnosis</button>';
          host.querySelectorAll('.dg-cell').forEach(function(c){ c.addEventListener('click',function(){ var i=+c.getAttribute('data-i'); if(flags[i]) delete flags[i]; else flags[i]=true; render(); }); });
          host.querySelector('[data-submit]').addEventListener('click', check);
        }
        function check(){
          var akeys=Object.keys(abset).map(Number), fkeys=Object.keys(flags).map(Number);
          var correct = fkeys.length===akeys.length && akeys.every(function(i){ return flags[i]; });
          host.querySelectorAll('.dg-cell').forEach(function(c){ var i=+c.getAttribute('data-i'); c.disabled=true; if(abset[i]) c.classList.add('reveal-ab'); if(flags[i]&&!abset[i]) c.classList.add('reveal-wrong'); });
          host.querySelector('[data-submit]').disabled=true;
          if(correct){ patient++; toast('✅ Patient saved! Sharp eye.', nextPatient); }
          else { hearts--; if(hearts<=0){ return setTimeout(lose, 1000); } toast('💔 Missed it — the glowing cells were the bad ones. '+hearts+' heart'+(hearts===1?'':'s')+' left.', nextPatient); }
        }
        function toast(msg, then){ var t=el('div','dg-toast', msg); host.appendChild(t); setTimeout(function(){ t.remove(); then(); }, 1700); }
        function win(){ host.innerHTML=immResult('🏅','You saved every patient!', true, '<p>That is exactly how AI helps real doctors — it scans for tiny details a tired human eye can miss, then a <b>human doctor makes the final call</b>. Spotting the difference is hard, and you nailed it.</p>'); bindRes(host, api, start); api.done(); }
        function lose(){ host.innerHTML=immResult('🩹','That was a tough shift', false, '<p>Reading scans is genuinely hard — that is why doctors and AI work <b>together</b>, double-checking each other. Take another shift and watch for the cells that look just a little off.</p>'); bindRes(host, api, start); }
        start();
      }});
  }

  // =========================================================================
  // MISSION CONTROL (Mission 5) — assign each job to AI / Human / Both.
  // AI = fast, repetitive, data. Human = feelings, fairness, final calls.
  // Both = teamwork. Get almost all right to run a perfect day.
  // =========================================================================
  function renderMissionCtrl(root, cfg, id){
    var JOBS = cfg.jobs || [
      { t:'Sort 10,000 vacation photos by color', best:'ai', why:'Boring + repetitive on a huge pile = perfect for AI.' },
      { t:'Comfort a friend who is feeling sad', best:'human', why:'Real feelings and care need a human heart.' },
      { t:'Check this 80-page report for spelling typos', best:'ai', why:'Fast, exact, never gets bored — AI shines here.' },
      { t:'Decide which student wins the kindness award', best:'human', why:'A fair, caring judgment call belongs to people.' },
      { t:'Write a birthday poem for Grandma', best:'both', why:'AI drafts ideas; a human adds the love that makes it real.' },
      { t:'Watch 1,000 camera feeds for a lost dog', best:'ai', why:'Tireless watching of many screens at once = AI.' },
      { t:'Tell a family hard news about their pet', best:'human', why:'Heavy, human moments need a real, kind person.' },
      { t:'Plan the class party on a tight budget', best:'both', why:'AI crunches the numbers; humans pick what feels fun.' }
    ];
    fsGame(root, cfg, id, { ico:'🛰️', title: cfg.title||'Mission Control',
      blurb:'You run a busy command center. Jobs keep flying in — decide who handles each: the <b>AI</b> (fast + tireless), a <b>Human</b> (caring + wise), or <b>Both</b> as a team. Some are sneaky. Get almost all of them right to run a perfect day!',
      playLabel:'▶  Take command', wrapClass:'g-mc',
      thanks: cfg.thanks || 'Code handles the loop; humans handle the judgment. 🛰️',
      play:function(host, api){
        var queue, idx, score, NEED;
        function start(){ queue=shuffle(JOBS); idx=0; score=0; NEED=queue.length-1; render(); }
        function render(){
          if(idx>=queue.length) return finish();
          var j=queue[idx];
          host.innerHTML='<div class="mc-bg"></div>'+
            '<div class="mc-top"><span>Job '+(idx+1)+' / '+queue.length+'</span><span class="mc-score">⭐ '+score+'</span></div>'+
            '<div class="mc-screen"><div class="mc-radar"></div><div class="mc-job">📋 '+esc(j.t)+'</div></div>'+
            '<div class="mc-instr">Who should handle this job?</div>'+
            '<div class="mc-choices">'+
              '<button class="mc-pick" data-k="ai"><b>🤖 AI</b><small>fast · tireless · loves data</small></button>'+
              '<button class="mc-pick" data-k="human"><b>🧑 Human</b><small>caring · fair · wise</small></button>'+
              '<button class="mc-pick" data-k="both"><b>🤝 Both</b><small>AI helps · human decides</small></button>'+
            '</div><div class="mc-fb" data-fb></div>';
          host.querySelectorAll('.mc-pick').forEach(function(b){ b.addEventListener('click',function(){ pick(j, b.getAttribute('data-k'), b); }); });
        }
        function pick(j, k, btn){
          host.querySelectorAll('.mc-pick').forEach(function(b){ b.disabled=true; if(b.getAttribute('data-k')===j.best) b.classList.add('right'); });
          var good=k===j.best, fb=host.querySelector('[data-fb]');
          if(good){ score++; fb.className='mc-fb ok'; fb.innerHTML='✅ <b>Yes!</b> '+esc(j.why); }
          else { btn.classList.add('wrong'); fb.className='mc-fb bad'; fb.innerHTML='❌ Not the best fit. '+esc(j.why); }
          fb.innerHTML+='<button class="imm-btn mc-next" data-next>'+(idx+1>=queue.length?'See your day →':'Next job →')+'</button>';
          fb.querySelector('[data-next]').addEventListener('click',function(){ idx++; render(); });
        }
        function finish(){
          if(score>=NEED){ host.innerHTML=immResult('🏆','A near-perfect shift! ('+score+'/'+queue.length+')', true, '<p>You matched almost every job to the right helper. The big idea: <b>AI handles the fast, boring, data-heavy work — humans handle the caring and the deciding.</b> The best teams use both.</p>'); bindRes(host, api, start); api.done(); }
          else { host.innerHTML=immResult('🛠️','The day got bumpy ('+score+'/'+queue.length+')', false, '<p>A few jobs went to the wrong helper. Remember: <b>feelings, fairness, and final calls</b> are human jobs; <b>fast, repetitive, huge piles</b> are AI jobs; tricky ones need <b>both</b>. Try again!</p>'); bindRes(host, api, start); }
        }
        start();
      }});
  }

  // =========================================================================
  // TOOL LAB (Mission 6) — a tool can help or hurt; the choice is ours.
  // Pick the responsible way to use each AI tool. The sneaky option is the
  // wrong one. Three careless choices and the town goes dark.
  // =========================================================================
  function renderToolLab(root, cfg, id){
    var SC = cfg.scenarios || [
      { t:'An AI can write your whole book report in 5 seconds. What do you do?', opts:[
        { l:'Hand it in as your own', good:false, r:'You learn nothing, and it isn’t really your work. That’s cheating yourself.' },
        { l:'Use it to brainstorm, then write it yourself', good:true, r:'Smart! The tool sparks ideas; your brain still does the learning.' },
        { l:'Decide the AI is smarter, so why try', good:false, r:'Ouch — that gives up your own growth. Tools should lift you, not replace you.' } ] },
      { t:'An AI image maker can copy any artist’s exact style. You want a poster.', opts:[
        { l:'Copy a living artist and sell it as theirs', good:false, r:'That takes credit and money from a real person. Not fair.' },
        { l:'Make your own style, inspired by what you like', good:true, r:'Great — inspired, not stolen. Your creativity leads.' },
        { l:'Flood the internet with thousands of fakes', good:false, r:'That’s spammy and unkind, and it drowns out real artists.' } ] },
      { t:'A chatbot answers ANY question instantly — even ones you should check.', opts:[
        { l:'Believe everything it says, always', good:false, r:'AI can be confidently wrong. Trusting it blindly leads you astray.' },
        { l:'Use it, then double-check important facts', good:true, r:'Exactly. Trust but verify — you stay the boss of the truth.' },
        { l:'Use it to spread a rumor about a kid', good:false, r:'That hurts someone real. Powerful tools used to harm do real damage.' } ] },
      { t:'An AI can copy anyone’s voice. A friend dares you to prank with it.', opts:[
        { l:'Fake a teacher’s voice to trick the class', good:false, r:'Tricking people with fake voices breaks trust and can scare them.' },
        { l:'Say no — and explain why fakes can hurt', good:true, r:'Brave and kind. You saw the harm before it happened.' },
        { l:'Fake a parent’s voice to skip your homework', good:false, r:'That’s a lie that breaks trust with people who care about you.' } ] },
      { t:'An AI helper offers to do chores for an elderly neighbor.', opts:[
        { l:'Use it to help them, then visit in person', good:true, r:'Beautiful — the tool helps AND you bring the human warmth.' },
        { l:'Let the robot do it all so you never visit', good:false, r:'They’d be lonely. Tools should add to caring, not replace it.' },
        { l:'Charge them money for the free AI help', good:false, r:'That takes advantage of someone. Not okay.' } ] }
    ];
    fsGame(root, cfg, id, { ico:'🪄', title: cfg.title||'Tool Lab',
      blurb:'Every powerful AI tool can <b>help</b> or <b>hurt</b> — it all depends on the choice you make. Read each situation and pick the wise way to use it. The easy or sneaky option is usually the wrong one. Make good choices to keep your town bright!',
      playLabel:'▶  Enter the lab', wrapClass:'g-tool',
      thanks: cfg.thanks || 'A tool is only as kind as the hand that holds it. 🪄',
      play:function(host, api){
        var queue, idx, harm;
        function start(){ queue=shuffle(SC).map(function(s){ return { t:s.t, opts:shuffle(s.opts) }; }); idx=0; harm=0; render(); }
        function render(){
          if(idx>=queue.length) return finish();
          var s=queue[idx];
          host.innerHTML='<div class="tl-bg"></div>'+
            '<div class="tl-top"><span>Choice '+(idx+1)+' / '+queue.length+'</span><span class="tl-meter">'+'☀️'.repeat(3-harm)+'🌑'.repeat(harm)+'</span></div>'+
            '<div class="tl-card">🪄 '+esc(s.t)+'</div>'+
            '<div class="tl-opts">'+s.opts.map(function(o,i){ return '<button class="tl-opt" data-i="'+i+'">'+esc(o.l)+'</button>'; }).join('')+'</div>'+
            '<div class="tl-fb" data-fb></div>';
          host.querySelectorAll('.tl-opt').forEach(function(b){ b.addEventListener('click',function(){ choose(s, +b.getAttribute('data-i'), b); }); });
        }
        function choose(s, i, btn){
          var o=s.opts[i];
          host.querySelectorAll('.tl-opt').forEach(function(b){ b.disabled=true; });
          btn.classList.add(o.good?'good':'bad');
          var fb=host.querySelector('[data-fb]'); fb.className='tl-fb '+(o.good?'ok':'bad');
          fb.innerHTML=(o.good?'✅ ':'⚠️ ')+esc(o.r);
          if(!o.good){ harm++; if(harm>=3){ return setTimeout(lose, 1300); } }
          fb.innerHTML+='<button class="imm-btn" data-next>'+(idx+1>=queue.length?'See your town →':'Next →')+'</button>';
          fb.querySelector('[data-next]').addEventListener('click',function(){ idx++; render(); });
        }
        function finish(){
          if(harm===0) host.innerHTML=immResult('🌟','Wise choices, bright town!', true, '<p>You used every tool to <b>help, not harm</b>. That’s the whole secret: a tool is only as good or bad as the person holding it. You chose to be kind, honest, and fair.</p>');
          else host.innerHTML=immResult('🌤️','Your town pulled through', true, '<p>You made it, but a couple of careless choices dimmed the lights. The big idea: the <b>same tool can help or hurt</b> — the choice is always yours. Try again for a perfect run!</p>');
          bindRes(host, api, start); api.done();
        }
        function lose(){ host.innerHTML=immResult('🌑','The town went dark', false, '<p>Too many careless choices. Powerful tools in careless hands cause real harm. Try again — pick the kind and honest option even when the sneaky one looks easier.</p>'); bindRes(host, api, start); }
        start();
      }});
  }

  // =========================================================================
  // GUARD THE VAULT (Mission 7) — privacy under pressure. Sort each piece of
  // info: keep private / OK to share / ask a grown-up. A data-thief creeps
  // closer on every mistake. Five slips and they break in.
  // =========================================================================
  function renderVault(root, cfg, id){
    var ITEMS = cfg.items || [
      { t:'Your home address', bin:'private' },
      { t:'Your favorite color', bin:'share' },
      { t:'Your password', bin:'private' },
      { t:'A drawing you made', bin:'share' },
      { t:'Your full real name AND school', bin:'ask' },
      { t:'A photo of your face to a stranger', bin:'private' },
      { t:'Your phone number', bin:'private' },
      { t:'Your high score in a game', bin:'share' },
      { t:'Exactly where you’ll be this weekend', bin:'ask' },
      { t:'Your birthday month (just the month)', bin:'share' },
      { t:'A video tour of your bedroom', bin:'private' },
      { t:'A parent’s credit card number', bin:'private' },
      { t:'Your username (no real name in it)', bin:'share' },
      { t:'Your exact location right now', bin:'private' }
    ];
    var BINS=[{k:'private',l:'🔒 Keep private'},{k:'share',l:'🌍 OK to share'},{k:'ask',l:'❓ Ask a grown-up'}];
    fsGame(root, cfg, id, { ico:'🔒', title: cfg.title||'Guard the Vault',
      blurb:'A sneaky data-thief is trying to grab your private info! As each item slides in, send it to the right place — <b>🔒 Keep private</b>, <b>🌍 OK to share</b>, or <b>❓ Ask a grown-up</b>. Every slip lets the thief creep closer. Keep them out of the vault!',
      playLabel:'▶  Guard the vault', wrapClass:'g-vault',
      thanks: cfg.thanks || 'You decide what’s yours to keep. 🔒',
      play:function(host, api){
        var queue, idx, thief, correct;
        function start(){ queue=shuffle(ITEMS); idx=0; thief=0; correct=0; render(''); }
        function render(flash){
          if(idx>=queue.length) return win();
          var it=queue[idx];
          host.innerHTML='<div class="gv-bg"></div>'+
            '<div class="gv-top"><span>Item '+(idx+1)+' / '+queue.length+'</span><span class="gv-thiefmeter">Thief <i style="width:'+(thief*20)+'%"></i></span></div>'+
            '<div class="gv-scene"><div class="gv-thief" style="left:'+(6+thief*15)+'%">🦹</div><div class="gv-vault">🏦</div></div>'+
            '<div class="gv-itemwrap"><div class="gv-item '+flash+'">📄 '+esc(it.t)+'</div></div>'+
            '<div class="gv-bins">'+BINS.map(function(b){ return '<button class="gv-bin" data-k="'+b.k+'">'+b.l+'</button>'; }).join('')+'</div>';
          host.querySelectorAll('.gv-bin').forEach(function(btn){ btn.addEventListener('click',function(){ pick(it, btn.getAttribute('data-k')); }); });
        }
        function pick(it, k){
          host.querySelectorAll('.gv-bin').forEach(function(b){ b.disabled=true; });
          if(k===it.bin){ correct++; idx++; render2('gv-ok'); }
          else { thief++; if(thief>=5){ return setTimeout(lose, 700); } idx++; render2('gv-bad'); }
        }
        function render2(flash){ var i=host.querySelector('.gv-item'); if(i) i.classList.add(flash); setTimeout(function(){ render(''); }, 480); }
        function win(){ host.innerHTML=immResult('🛡️','Vault secured!', true, '<p>You sorted <b>'+correct+' / '+queue.length+'</b> right and kept the thief out. That’s how you protect yourself: some things you share, some you keep private, and some you ask a grown-up about. Addresses, passwords, and your exact location are <b>always private</b>.</p>'); bindRes(host, api, start); api.done(); }
        function lose(){ host.innerHTML=immResult('🦹','The thief broke in!', false, '<p>A few private things slipped through and the thief grabbed them. Remember: addresses, passwords, exact location, and photos to strangers are <b>always private</b>. Guard the vault again!</p>'); bindRes(host, api, start); }
        start();
      }});
  }

  // =========================================================================
  // FAIR SHARE (Mission 8) — fairness vs. equal. Share limited AI tutor-bots
  // among four kids who start in different places. Fair means the kids behind
  // get MORE. Lift everyone to the ready line with the bots you have.
  // =========================================================================
  function renderFairShare(root, cfg, id){
    var NAMES=['Ari','Bo','Cy','Dee'], LINE=4, START=[1,2,3,1], POOL0=10;
    fsGame(root, cfg, id, { ico:'⚖️', title: cfg.title||'Fair Share',
      blurb:'Four kids all want to learn, but they’re not starting from the same place. You have a team of AI tutor-bots to share. <b>Fair doesn’t mean equal</b> — the kids furthest behind need the most help. Lift <b>everyone</b> to the ready line!',
      playLabel:'▶  Share the bots', wrapClass:'g-fair',
      thanks: cfg.thanks || 'Fair means everyone gets what they need. ⚖️',
      play:function(host, api){
        var lvl, pool;
        function start(){ lvl=START.slice(); pool=POOL0; render(); }
        function render(){
          var allReady=lvl.every(function(v){ return v>=LINE; });
          host.innerHTML='<div class="fs-bg"></div>'+
            '<div class="fs-top"><span>🤖 Bots left: <b>'+pool+'</b></span><span>🎯 Ready line: '+LINE+'</span></div>'+
            '<div class="fs-instr">Give more bots to whoever needs them. <b>Everyone</b> must reach the line.</div>'+
            '<div class="fs-students">'+lvl.map(function(v,i){
              var bars=''; for(var b=1;b<=6;b++){ bars+='<span class="fs-seg'+(b<=v?' on':'')+(b===LINE?' line':'')+'"></span>'; }
              return '<div class="fs-kid'+(v>=LINE?' ready':'')+'">'+
                '<div class="fs-face">'+(v>=LINE?'😄':(v<=2?'😟':'🙂'))+'</div><div class="fs-name">'+NAMES[i]+'</div>'+
                '<div class="fs-bars">'+bars+'</div>'+
                '<div class="fs-pm"><button class="fs-btn" data-d="-1" data-i="'+i+'">−</button><span class="fs-bots">'+'🤖'.repeat(Math.max(0,v-START[i]))+'</span><button class="fs-btn" data-d="1" data-i="'+i+'">+</button></div>'+
              '</div>';
            }).join('')+'</div>'+
            '<button class="imm-btn fs-run" data-run'+(allReady?'':' disabled')+'>▶ Run the class</button>'+
            '<div class="fs-hint" data-hint></div>';
          host.querySelectorAll('.fs-btn').forEach(function(btn){ btn.addEventListener('click',function(){
            var i=+btn.getAttribute('data-i'), d=+btn.getAttribute('data-d');
            if(d>0){ if(pool<=0){ return flashHint('Out of bots! Take some from a kid who’s already over the line.'); } if(lvl[i]>=6) return; lvl[i]++; pool--; }
            else { if(lvl[i]<=START[i]) return; lvl[i]--; pool++; }
            render();
          }); });
          var run=host.querySelector('[data-run]'); if(run) run.addEventListener('click',function(){ if(lvl.every(function(v){ return v>=LINE; })) win(); });
        }
        function flashHint(m){ var h=host.querySelector('[data-hint]'); if(h){ h.textContent=m; h.classList.add('show'); setTimeout(function(){ h.classList.remove('show'); }, 1900); } }
        function win(){ host.innerHTML=immResult('⚖️','Everyone reached the line!', true, '<p>You gave the <b>most help to the kids who were furthest behind</b> — that’s what fairness really means. Splitting the bots <i>exactly</i> evenly would have left someone stuck. This is the kind of fairness we have to build into AI on purpose.</p>'); bindRes(host, api, start); api.done(); }
        start();
      }});
  }

  // =========================================================================
  // TWO DOORS (Mission 9) — tools, rules & freedom. Walk a path to the Castle
  // of Freedom. At each gate pick the balanced choice (helpful tool + smart
  // rules + human in charge). A wrong door slides you back a step.
  // =========================================================================
  function renderTwoDoors(root, cfg, id){
    var STEPS = cfg.steps || [
      { q:'You get a powerful AI robot. How should it work with you?', doors:[
        { l:'🔒 It bosses me around and decides everything', ok:false, r:'A tool that controls YOU isn’t freedom — that’s a cage.' },
        { l:'🤝 It helps when I ask; I stay in charge', ok:true, r:'Yes! A good tool gives you MORE freedom, not less.' },
        { l:'🌀 It does random stuff with no rules at all', ok:false, r:'No rules = chaos. Things break and people get hurt.' } ] },
      { q:'Your AI could read everyone’s private messages to “help.” Rules?', doors:[
        { l:'📖 No rules — let it read everything', ok:false, r:'No guardrails means privacy gets trampled.' },
        { l:'🚧 A clear rule: only with permission', ok:true, r:'Good rules protect people AND keep the tool useful.' },
        { l:'🔒 Ban it from ever helping anyone', ok:false, r:'Too locked-down — now it can’t help at all.' } ] },
      { q:'The AI makes a mistake. Who fixes it and decides what’s right?', doors:[
        { l:'🤖 The AI decides it’s fine; ignore it', ok:false, r:'Machines shouldn’t be the final judge of right and wrong.' },
        { l:'🧑 A human checks it and makes the call', ok:true, r:'Exactly — humans hold the judgment and the steering wheel.' },
        { l:'🤷 Nobody — just hope it works out', ok:false, r:'“Hope” is not a plan. Someone must be responsible.' } ] },
      { q:'Final gate: what gives you real freedom?', doors:[
        { l:'⛓️ Rules so strict you can’t do anything', ok:false, r:'That’s control, not freedom.' },
        { l:'🕊️ Good rules + you in charge + it helps', ok:true, r:'That’s the balance: tools + rules + human judgment = freedom!' },
        { l:'💥 Total free-for-all, anything goes', ok:false, r:'Pure chaos isn’t freedom — it’s danger.' } ] }
    ];
    fsGame(root, cfg, id, { ico:'🚪', title: cfg.title||'Two Doors',
      blurb:'Walk the path to the Castle of Freedom. At each gate, pick the choice that balances <b>helpful tools, smart rules, and people staying in charge</b>. Too much control traps you; too little crashes you. A wrong door slides you back a step — find the balanced path!',
      playLabel:'▶  Walk the path', wrapClass:'g-doors',
      thanks: cfg.thanks || 'Tools + rules + human judgment = real freedom. 🕊️',
      play:function(host, api){
        var pos;
        function start(){ pos=0; render(null); }
        function render(msg){
          if(pos>=STEPS.length) return win();
          var s=STEPS[pos], stones='';
          for(var i=0;i<=STEPS.length;i++){ stones+='<span class="td-stone'+(i<pos?' past':'')+(i===pos?' here':'')+(i===STEPS.length?' goal':'')+'">'+(i===STEPS.length?'🏰':(i<pos?'✓':(i===pos?'🚶':'·')))+'</span>'; }
          host.innerHTML='<div class="td-bg"></div>'+
            '<div class="td-path">'+stones+'</div>'+
            (msg?'<div class="td-msg '+msg.cls+'">'+msg.txt+'</div>':'<div class="td-msg"></div>')+
            '<div class="td-q">🚪 '+esc(s.q)+'</div>'+
            '<div class="td-doors">'+s.doors.map(function(d,i){ return '<button class="td-door" data-i="'+i+'">'+d.l+'</button>'; }).join('')+'</div>';
          host.querySelectorAll('.td-door').forEach(function(b){ b.addEventListener('click',function(){ choose(s, +b.getAttribute('data-i'), b); }); });
        }
        function choose(s, i, btn){
          var d=s.doors[i];
          host.querySelectorAll('.td-door').forEach(function(b){ b.disabled=true; });
          btn.classList.add(d.ok?'right':'wrong');
          setTimeout(function(){
            if(d.ok){ pos++; render({cls:'ok', txt:'✅ '+d.r}); }
            else { var was=pos; pos=Math.max(0,pos-1); render({cls:'bad', txt:'⬅️ '+d.r+(was>0?' (slid back a step)':'')}); }
          }, 850);
        }
        function win(){ host.innerHTML=immResult('🏰','You reached the Castle of Freedom!', true, '<p>You found the balanced path every time: <b>helpful tools + smart rules + people in charge</b>. That’s the recipe for technology that sets us free instead of bossing us around.</p>'); bindRes(host, api, start); api.done(); }
        start();
      }});
  }

  // =========================================================================
  // RULE LAB (Mission 10) — rules are hard. The robot follows your rule word
  // for word and finds a loophole. Pick the clause that closes it (without
  // making a new mess). Three bad patches and the robot runs wild.
  // =========================================================================
  function renderRuleLab(root, cfg, id){
    var ROUNDS = cfg.rounds || [
      { hole:'You told the robot: “Keep the room clean.” It threw your toys in the trash! 🗑️ Technically… it IS clean now.', patches:[
        { l:'“…and never throw away things that aren’t trash.”', ok:true, r:'Nice — now it tidies without trashing your stuff.' },
        { l:'“…and do it faster.”', ok:false, r:'Now it speed-trashes EVERYTHING even quicker! 😱' },
        { l:'“…and make it sparkle.”', ok:false, r:'It bleaches your toys to make them “sparkle.” Yikes.' } ] },
      { hole:'New rule: “Put every toy in a box.” The robot put the CAT in a box too! 🐱📦', patches:[
        { l:'“…only put TOYS in boxes, never living things.”', ok:true, r:'Phew — pets are safe now.' },
        { l:'“…use bigger boxes.”', ok:false, r:'Now it boxes the cat AND the dog. Bigger problem!' },
        { l:'“…be gentle about it.”', ok:false, r:'It gently boxes the cat. Still boxing the cat!' } ] },
      { hole:'Rule: “Make everyone happy.” The robot gave away your savings to buy candy for strangers! 🍬', patches:[
        { l:'“…without giving away things that aren’t yours.”', ok:true, r:'Now it spreads joy without raiding your piggy bank.' },
        { l:'“…make even MORE people happy.”', ok:false, r:'It empties the whole house for candy. Worse!' },
        { l:'“…ask the candy store first.”', ok:false, r:'The store says yes — your money’s still gone.' } ] }
    ];
    fsGame(root, cfg, id, { ico:'📜', title: cfg.title||'Rule Lab',
      blurb:'You’re the boss of a brand-new robot. You write the rules… but it does <b>exactly</b> what you say — and finds sneaky loopholes! Each time it misbehaves, add the clause that closes the gap. Patch every loophole. Careful — a bad patch makes things worse!',
      playLabel:'▶  Write the rules', wrapClass:'g-rule',
      thanks: cfg.thanks || 'Good rules take careful words and lots of testing. 📜',
      play:function(host, api){
        var queue, idx, patience;
        function start(){ queue=ROUNDS.map(function(r){ return { hole:r.hole, patches:shuffle(r.patches) }; }); idx=0; patience=3; render(null); }
        function render(msg){
          if(idx>=queue.length) return win();
          var r=queue[idx];
          host.innerHTML='<div class="rl-bg"></div>'+
            '<div class="rl-top"><span>Loophole '+(idx+1)+' / '+queue.length+'</span><span class="rl-pat">'+'🤖'.repeat(patience)+'💢'.repeat(3-patience)+'</span></div>'+
            '<div class="rl-bot">🤖<span class="rl-bub">'+esc(r.hole)+'</span></div>'+
            (msg?'<div class="rl-msg '+msg.cls+'">'+msg.txt+'</div>':'<div class="rl-msg"></div>')+
            '<div class="rl-instr">Pick the clause that closes the loophole:</div>'+
            '<div class="rl-patches">'+r.patches.map(function(p,i){ return '<button class="rl-patch" data-i="'+i+'">'+esc(p.l)+'</button>'; }).join('')+'</div>';
          host.querySelectorAll('.rl-patch').forEach(function(b){ b.addEventListener('click',function(){ pick(r, +b.getAttribute('data-i'), b); }); });
        }
        function pick(r, i, btn){
          var p=r.patches[i];
          host.querySelectorAll('.rl-patch').forEach(function(b){ b.disabled=true; });
          btn.classList.add(p.ok?'right':'wrong');
          setTimeout(function(){
            if(p.ok){ idx++; render({cls:'ok', txt:'✅ '+p.r}); }
            else { patience--; if(patience<=0){ return lose(); } render({cls:'bad', txt:'😵 '+p.r}); }
          }, 950);
        }
        function win(){ host.innerHTML=immResult('📜','You wrote a rule that works!', true, '<p>Writing rules for AI is <b>way harder than it looks</b> — machines follow them word-for-word and find every loophole. That’s why people keep testing, fixing, and improving the rules. Careful rule-writing keeps AI safe and fair.</p>'); bindRes(host, api, start); api.done(); }
        function lose(){ host.innerHTML=immResult('💢','The robot ran wild!', false, '<p>Too many loopholes stayed open and the robot caused chaos. That’s the real lesson: rules need exact wording — and lots of testing. Try again and close every gap!</p>'); bindRes(host, api, start); }
        start();
      }});
  }

  // =========================================================================
  // BUILD-A-HELPER (Mission 11) — you help build it. Choose your helper’s
  // job, what it learns from, and its safety rule, then run the tests. Bad
  // choices make it unfair, mean, or unsafe. Fix what fails and pass them all.
  // =========================================================================
  function renderBuildHelper(root, cfg, id){
    var SLOTS = [
      { key:'goal', label:'🎯 Its job', opts:[
        { l:'Suggest fun books to read', good:true },
        { l:'Decide which kid is “the best”', good:false, why:'Ranking kids as “the best” isn’t kind or fair.' },
        { l:'Pick the winner before the race', good:false, why:'It can’t know the future — that’s just guessing.' } ] },
      { key:'data', label:'📚 What it learns from', opts:[
        { l:'Books loved by all kinds of kids', good:true },
        { l:'Only books that ONE group likes', good:false, why:'Narrow data makes a biased, unfair helper.' },
        { l:'Random angry internet comments', good:false, why:'Mean data teaches a mean helper.' } ] },
      { key:'guard', label:'🛡️ Its safety rule', opts:[
        { l:'A human can always say “no”', good:true },
        { l:'Nobody can ever turn it off', good:false, why:'No off-switch is dangerous — humans must stay in charge.' },
        { l:'No rules, just go full speed', good:false, why:'No guardrails means it can cause harm.' } ] }
    ];
    fsGame(root, cfg, id, { ico:'🛠️', title: cfg.title||'Build-a-Helper',
      blurb:'Time to build your very own AI helper! Choose its <b>job</b>, what it <b>learns from</b>, and its <b>safety rule</b> — then run the tests. Bad choices make it act unfair, mean, or unsafe. Fix what fails and test again until your helper is kind, fair, and safe!',
      playLabel:'▶  Start building', wrapClass:'g-build',
      thanks: cfg.thanks || 'You didn’t just use AI — you helped shape it. 🛠️',
      play:function(host, api){
        var pick;
        function start(){ pick={goal:null,data:null,guard:null}; render(''); }
        function render(tests){
          host.innerHTML='<div class="bh-bg"></div>'+
            '<div class="bh-helper">🤖<span class="bh-spark">✨</span></div>'+
            '<div class="bh-slots">'+SLOTS.map(function(s){
              return '<div class="bh-slot"><div class="bh-slabel">'+s.label+'</div>'+
                s.opts.map(function(o,i){ var sel=pick[s.key]===i; return '<button class="bh-opt'+(sel?' sel':'')+'" data-k="'+s.key+'" data-i="'+i+'">'+esc(o.l)+'</button>'; }).join('')+
              '</div>';
            }).join('')+'</div>'+
            (tests?'<div class="bh-tests">'+tests+'</div>':'')+
            '<button class="imm-btn bh-run" data-run>🧪 Run the tests</button>';
          host.querySelectorAll('.bh-opt').forEach(function(b){ b.addEventListener('click',function(){ pick[b.getAttribute('data-k')]=+b.getAttribute('data-i'); render(''); }); });
          host.querySelector('[data-run]').addEventListener('click', run);
        }
        function run(){
          if(pick.goal==null||pick.data==null||pick.guard==null){ render('<div class="bh-warn">⚠️ Pick one option in each box first!</div>'); return; }
          var rows='', allGood=true;
          SLOTS.forEach(function(s){ var o=s.opts[pick[s.key]], good=o.good; if(!good) allGood=false;
            rows+='<div class="bh-test '+(good?'pass':'fail')+'">'+(good?'✅':'❌')+' <b>'+s.label+'</b> — '+(good?'works great!':esc(o.why))+'</div>';
          });
          if(allGood){ host.innerHTML=immResult('🎉','Your helper is kind, fair & safe!', true, '<p>You picked a good job, taught it with <b>fair, friendly</b> examples, and kept a <b>human in charge</b>. That’s exactly how real people build AI you can trust. You didn’t just use a tool — you helped shape it. 💛</p>'); bindRes(host, api, start); api.done(); }
          else { render(rows); }
        }
        start();
      }});
  }

  // ---- registry + boot ----------------------------------------------------
  var RENDERERS = { poll: renderPoll, sort: renderSort, choice: renderChoice, nextword: renderNextWord, attention: renderAttention, quiz: renderQuiz, timeline: renderTimeline, reveal: renderReveal, slider: renderSlider, trainer: renderTrainer, match: renderMatch, draw: renderDraw, wordchain: renderWordChain, order: renderOrder, neuron: renderNeuron, arcade: renderArcade, powercity: renderPowerCity, aiworld: renderAIWorld, diagnose: renderDiagnose, missionctrl: renderMissionCtrl, toollab: renderToolLab, vault: renderVault, fairshare: renderFairShare, twodoors: renderTwoDoors, rulelab: renderRuleLab, buildhelper: renderBuildHelper };

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

  window.CTFWidgets = { init: init, hydrate: hydrate, isDone: isDone, reset: function () { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(NS) === 0) localStorage.removeItem(k); }); } };
})();
