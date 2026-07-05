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
    var notepad = !!cfg.notepad;   // open notepad mode: no buttons, just type your own words

    if (!notepad) {
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
    }

    var input;
    if (notepad || cfg.freeText) {
      input = notepad ? el('textarea', 'ctf-input ctf-notepad') : el('input', 'ctf-input');
      if (!notepad) input.type = 'text'; else input.rows = 4;
      input.placeholder = cfg.placeholder || 'Type your answer…';
      input.style.marginTop = notepad ? '4px' : '12px';
      if (prior && prior.text) input.value = prior.text;
      input.addEventListener('input', function () { persist(undefined, input.value); });
      root.appendChild(input);
    }

    var fb = el('div', 'ctf-feedback good');
    fb.textContent = cfg.thanks || 'Saved! We\'ll come back to this later.';
    root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);
    var hasAnswer = prior && (prior.choice || (prior.text && prior.text.trim()));
    if (hasAnswer) { fb.classList.add('show'); reveal(done, (cfg.complete && cfg.complete.progress) || 100); }

    function persist(choice, text) {
      var cur = load(id + ':answer') || {};
      if (choice !== undefined) cur.choice = choice;
      if (text !== undefined) cur.text = text;
      if (id) save(id + ':answer', cur);
      // only celebrate once there's a real answer (a notepad starts empty)
      if (cur.choice || (cur.text && cur.text.trim())) {
        fb.classList.add('show');
        reveal(done, (cfg.complete && cfg.complete.progress) || 100);
        markDone(id);
      }
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
          // the attempt counts either way so an API hiccup can't trap the kid behind the gate
          reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
        })
        .catch(function () {
          guessBtn.disabled = false; guessBtn.textContent = cfg.button || '🤖 Ask the AI to guess!';
          fb.className = 'ctf-feedback show info'; fb.innerHTML = '🙈 Couldn\'t reach the AI — is the internet ok? You can try again, or keep going.';
          // count the attempt so a network hiccup can't trap the kid behind the gate
          guesses++;
          reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
        });
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
  // NEURON — "Be the Trainer", now a living network. Connections CHARGE UP:
  // every tap pumps energy into a line and it visibly thickens — but each one
  // has a hidden threshold before it snaps open and can carry signal. Three
  // escalating levels (Spark → Surge → Storm); energy is scarce, so kids
  // spend taps strategically. Breathing neurons, flowing charge, traveling
  // signal pulses. Always solvable: the energy budget is rolled from the
  // cheapest path + a little slack.
  // =========================================================================
  function renderNeuron(root, cfg, id) {
    root.innerHTML = header(cfg);

    var LEVELS = [
      { name: 'Spark', h: 280, slack: 3,
        nodes: { a:[60,70], b:[60,210], h1:[240,70], h2:[240,210], out:[420,140] },
        ins: ['a','b'], layers: [['a','b'],['h1','h2'],['out']],
        edges: [['a','h1'],['a','h2'],['b','h1'],['b','h2'],['h1','out'],['h2','out']] },
      { name: 'Surge', h: 320, slack: 3,
        nodes: { a:[55,60], b:[55,160], c:[55,260], h1:[240,60], h2:[240,160], h3:[240,260], out:[425,160] },
        ins: ['a','b','c'], layers: [['a','b','c'],['h1','h2','h3'],['out']],
        edges: [['a','h1'],['a','h2'],['b','h1'],['b','h2'],['b','h3'],['c','h2'],['c','h3'],['h1','out'],['h2','out'],['h3','out']] },
      { name: 'Storm', h: 360, slack: 4,
        nodes: { a:[50,60], b:[50,180], c:[50,300], h1:[195,50], h2:[195,140], h3:[195,230], h4:[195,315], g1:[330,105], g2:[330,255], out:[430,180] },
        ins: ['a','b','c'], layers: [['a','b','c'],['h1','h2','h3','h4'],['g1','g2'],['out']],
        edges: [['a','h1'],['a','h2'],['b','h2'],['b','h3'],['c','h3'],['c','h4'],['h1','g1'],['h2','g1'],['h2','g2'],['h3','g1'],['h3','g2'],['h4','g2'],['g1','out'],['g2','out']] }
    ];

    var box = el('div', 'ctf-neuron');
    root.appendChild(box);
    var fb = el('div', 'ctf-feedback'); root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);

    var li = 0, L, thr, charge, open, budget, energy, won, sparkT;

    function rollLevel(n) {
      li = n; L = LEVELS[n]; won = false;
      thr = L.edges.map(function () { return 2 + Math.floor(Math.random() * (n === 0 ? 2 : 3)); });   // hidden: 2-3 taps (L1) / 2-4
      charge = L.edges.map(function () { return 0; });
      open = L.edges.map(function () { return false; });
      // cheapest input→out path (by threshold sum) so every roll is winnable
      var best = {}; L.ins.forEach(function (k) { best[k] = 0; });
      L.layers.slice(1).forEach(function (layer) {
        layer.forEach(function (nk) {
          var c = Infinity;
          L.edges.forEach(function (e, i) { if (e[1] === nk && best[e[0]] != null) c = Math.min(c, best[e[0]] + thr[i]); });
          if (c < Infinity) best[nk] = c;
        });
      });
      budget = (best.out || 6) + L.slack;
      energy = budget;
      build();
    }

    function build() {
      box.innerHTML =
        '<div class="ctf-nn-top"><span class="ctf-nn-lvl">🧠 Level ' + (li + 1) + ' of 3 · ' + L.name + '</span><span class="ctf-nn-energy"></span></div>' +
        '<svg viewBox="0 0 480 ' + L.h + '" class="ctf-neuron-svg"></svg>' +
        '<div class="ctf-neuron-hud"><button class="ctf-btn ctf-nn-reset">↺ Reset</button><button class="ctf-btn ctf-neuron-send">⚡ Send the signal!</button></div>';
      box.querySelector('.ctf-nn-reset').addEventListener('click', function () { rollLevel(li); fb.className = 'ctf-feedback'; });
      box.querySelector('.ctf-neuron-send').addEventListener('click', send);
      draw();
      clearInterval(sparkT);
      sparkT = setInterval(idleSpark, 1400);   // little synapse sparkles keep it alive
    }

    function hud() {
      var pips = '';
      for (var i = 0; i < budget; i++) pips += '<i class="' + (i < energy ? 'on' : '') + '"></i>';
      box.querySelector('.ctf-nn-energy').innerHTML = 'Energy <span class="ctf-nn-pips">' + pips + '</span>';
    }

    function edgeEl(i) { return box.querySelector('[data-e="' + i + '"]'); }
    function draw(lit) {
      lit = lit || {};
      var svg = box.querySelector('svg');
      svg.innerHTML =
        L.edges.map(function (e, i) {
          var p1 = L.nodes[e[0]], p2 = L.nodes[e[1]];
          var w = open[i] ? 8 : 2.5 + charge[i] * 2.2;                       // taps visibly fatten the line…
          var col = lit['e' + i] ? '#FFB320' : open[i] ? '#2A5FF0' : charge[i] ? '#8FB0F5' : '#DDE2EC';
          return '<line data-e="' + i + '" x1="' + p1[0] + '" y1="' + p1[1] + '" x2="' + p2[0] + '" y2="' + p2[1] + '"' +
            ' stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round"' +
            ' class="' + (open[i] ? 'ctf-nn-open' : 'ctf-nn-charging') + (lit['e' + i] ? ' ctf-nn-lit' : '') + '"/>';
        }).join('') +
        Object.keys(L.nodes).map(function (k) {
          var p = L.nodes[k], isOut = k === 'out', isIn = L.ins.indexOf(k) > -1;
          var r = isOut ? 28 : isIn ? 20 : 17;
          return '<g class="ctf-nn-node" style="animation-delay:' + ((p[0] + p[1]) % 7) * .3 + 's">' +
            '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + r + '" fill="' +
            (lit[k] ? '#FFB320' : isIn ? '#12B2BC' : isOut ? '#0F1B3A' : '#2A5FF0') + '"' +
            (lit[k] ? ' style="filter:drop-shadow(0 0 14px #FFB320)"' : '') + '/>' +
            (isOut ? '<text x="' + p[0] + '" y="' + (p[1] + 5) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">' + (lit[k] ? '💡' : 'OUT') + '</text>' : '') + '</g>';
        }).join('');
      hud();
      svg.querySelectorAll('line').forEach(function (ln) {
        ln.addEventListener('click', function () { tap(+ln.getAttribute('data-e')); });
      });
    }

    function tap(i) {
      if (won) return;
      if (open[i]) { pulseLine(i); return; }                                  // already open — no waste
      if (energy <= 0) { fb.className = 'ctf-feedback show info'; fb.innerHTML = '⚡ Out of energy! Tap <b>Reset</b> to re-plan — spend your taps on ONE full path.'; return; }
      energy--; charge[i]++;
      if (charge[i] >= thr[i]) {                                              // …until the hidden threshold SNAPS it open
        open[i] = true; draw(); snapSpark(i);
      } else {
        var ln = edgeEl(i);
        ln.setAttribute('stroke-width', 2.5 + charge[i] * 2.2);
        ln.setAttribute('stroke', '#8FB0F5');
        pulseLine(i); hud();
      }
    }
    function pulseLine(i) { var ln = edgeEl(i); if (!ln) return; ln.classList.remove('ctf-nn-pulse'); void ln.getBoundingClientRect(); ln.classList.add('ctf-nn-pulse'); }
    function midOf(i) { var e = L.edges[i], p1 = L.nodes[e[0]], p2 = L.nodes[e[1]]; return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]; }
    function spark(x, y, big) {
      var svg = box.querySelector('svg'); if (!svg) return;
      var s = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      s.setAttribute('cx', x); s.setAttribute('cy', y); s.setAttribute('r', big ? 5 : 2.5);
      s.setAttribute('class', 'ctf-nn-spark' + (big ? ' big' : ''));
      svg.appendChild(s); setTimeout(function () { s.remove(); }, 900);
    }
    function snapSpark(i) { var m = midOf(i); spark(m[0], m[1], true); spark(m[0] - 10, m[1] + 6); spark(m[0] + 9, m[1] - 7); }
    function idleSpark() {
      var openIdx = []; open.forEach(function (o, i) { if (o) openIdx.push(i); });
      var pool = openIdx.length ? openIdx : [Math.floor(Math.random() * L.edges.length)];
      var i = pool[Math.floor(Math.random() * pool.length)];
      var e = L.edges[i], p1 = L.nodes[e[0]], p2 = L.nodes[e[1]], t = Math.random();
      spark(p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t);
    }

    function send() {
      if (won) return;
      // propagate layer by layer through OPEN edges
      var lit = {}; L.ins.forEach(function (k) { lit[k] = 1; });
      var litEdges = {}, hops = {};
      L.ins.forEach(function (k) { hops[k] = 0; });
      L.layers.slice(1).forEach(function (layer) {
        layer.forEach(function (nk) {
          L.edges.forEach(function (e, i) {
            if (e[1] === nk && open[i] && lit[e[0]]) {
              lit[nk] = 1; litEdges['e' + i] = 1;
              hops[nk] = Math.min(hops[nk] == null ? 99 : hops[nk], hops[e[0]] + 1);
            }
          });
        });
      });
      var win = !!lit.out;
      draw(Object.assign({}, lit, litEdges));
      // traveling pulses: a dot runs along every lit edge, staggered by depth
      L.edges.forEach(function (e, i) {
        if (!litEdges['e' + i]) return;
        var p1 = L.nodes[e[0]], p2 = L.nodes[e[1]], delay = (hops[e[0]] || 0) * 380;
        var svg = box.querySelector('svg');
        var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('r', 6); dot.setAttribute('fill', '#FFB320'); dot.setAttribute('class', 'ctf-nn-dot');
        var mo = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
        mo.setAttribute('dur', '.38s'); mo.setAttribute('begin', (delay / 1000) + 's'); mo.setAttribute('fill', 'freeze');
        mo.setAttribute('path', 'M ' + p1[0] + ' ' + p1[1] + ' L ' + p2[0] + ' ' + p2[1]);
        dot.appendChild(mo); svg.appendChild(dot);
        setTimeout(function () { dot.remove(); }, delay + 700);
      });
      if (win) {
        won = true; clearInterval(sparkT);
        var isLast = li >= LEVELS.length - 1;
        fb.className = 'ctf-feedback show good';
        fb.innerHTML = '<b>💡 The output lit up!</b> You just set the <b>weights</b> — every tap made a connection stronger until the signal could flow. That\'s exactly what training tunes, billions of times.' +
          (isLast ? ' <b>You beat all three networks — master trainer!</b>' : '') +
          '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">' +
          (!isLast ? '<button class="ctf-btn ctf-nn-next">🧠 Level ' + (li + 2) + ': ' + LEVELS[li + 1].name + ' — bigger brain →</button>' : '<button class="ctf-btn ctf-nn-next">↺ Play again from Level 1</button>') + '</div>';
        fb.querySelector('.ctf-nn-next').addEventListener('click', function () { fb.className = 'ctf-feedback'; rollLevel(isLast ? 0 : li + 1); });
        reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
      } else {
        fb.className = 'ctf-feedback show info';
        fb.innerHTML = 'Not yet! The signal only flows through <b>fully-opened</b> connections (the thick glowing ones) — and it needs an unbroken path all the way to OUT. ' + (energy > 0 ? 'You have ⚡ left — keep charging!' : 'Out of energy — tap <b>Reset</b> and spend your taps on ONE full path.');
        box.querySelector('svg').classList.remove('ctf-nn-shake'); void box.offsetWidth; box.querySelector('svg').classList.add('ctf-nn-shake');
      }
    }

    rollLevel(0);
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
  // MEET AI — an open-ended FIRST chat with a real AI. No right answers: kids
  // type anything (or tap an idea), watch it reply, and discover it *guesses*
  // (and is sometimes wrong). Built for experimenting, failing, and tinkering.
  // =========================================================================
  function renderMeetAI(root, cfg, id) {
    root.innerHTML = header(cfg);
    var wrap = el('div', 'ctf-meetai');

    var log = el('div', 'ctf-mai-log');
    function bubble(who, text) {
      var b = el('div', 'ctf-mai-msg ' + (who === 'ai' ? 'ai' : 'me'));
      b.innerHTML = (who === 'ai' ? '<span class="ctf-mai-av">🤖</span>' : '') +
        '<span class="ctf-mai-txt">' + esc(text) + '</span>';
      return b;
    }
    function push(b) { log.appendChild(b); log.scrollTop = log.scrollHeight; return b; }
    push(bubble('ai', cfg.greeting || "Hi! 👋 I'm a real AI living inside this lesson. Ask me anything — or tap an idea below!"));
    wrap.appendChild(log);

    var row = el('div', 'ctf-mai-row');
    var input = el('input', 'ctf-input ctf-mai-input'); input.type = 'text';
    input.placeholder = cfg.placeholder || 'Type a message to the AI…'; input.maxLength = 200;
    var send = el('button', 'ctf-mai-send', 'Send ➤');
    row.appendChild(input); row.appendChild(send);

    var chips = el('div', 'ctf-mai-chips');
    (cfg.ideas || ["Tell me a joke 🤪", "Why is the sky blue? 🌈", "Make up a tiny robot story 🤖", "What's your favorite animal? 🐾"]).forEach(function (idea) {
      var c = el('button', 'ctf-mai-chip', esc(idea));
      c.addEventListener('click', function () { input.value = idea; input.focus(); });
      chips.appendChild(c);
    });
    wrap.appendChild(chips);
    wrap.appendChild(row);
    root.appendChild(wrap);

    var fb = el('div', 'ctf-feedback good');
    fb.textContent = cfg.thanks || "You just talked with a real AI! 🎉";
    root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);

    var sent = 0, busy = false, prior = id ? load(id + ':answer') : null;
    if (prior && prior.sent) { sent = prior.sent; fb.classList.add('show'); }

    function ask() {
      var q = input.value.trim();
      if (!q || busy) return;
      if (window.CTFFilter && window.CTFFilter.clean) {
        var ck = window.CTFFilter.clean(q);
        if (ck && ck.blocked) { input.value = ''; push(bubble('ai', "Let's keep it kind and fun! Try asking me something else. 😊")); return; }
      }
      busy = true; send.disabled = true;
      push(bubble('me', q)); input.value = '';
      var typing = push(el('div', 'ctf-mai-msg ai ctf-mai-typing', '<span class="ctf-mai-av">🤖</span><span class="ctf-mai-txt">· · ·</span>'));
      var sendPrompt = cfg.promptTemplate ? cfg.promptTemplate.replace('{q}', q) : q;
      fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'kids', prompt: sendPrompt }) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          typing.remove();
          push(bubble('ai', (res.ok && res.d.text) ? res.d.text : ((res.d && res.d.error) || "Hmm, I got shy! Ask me again?")));
          busy = false; send.disabled = false;
          sent++; if (id) save(id + ':answer', { sent: sent });
          fb.classList.add('show');
          reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
          if (sent === 2 && !wrap.querySelector('.ctf-mai-note')) {
            var note = el('div', 'ctf-mai-note', cfg.tinkerNote ||
              "🔎 Notice it answers a little differently each time? That's because it <b>guesses</b> the next words — it isn't looking up a saved answer. Sometimes it's even wrong, and that's totally OK. Try to surprise it!");
            wrap.insertBefore(note, row);
          }
        })
        .catch(function () {
          typing.remove(); push(bubble('ai', "🙈 I couldn't connect — is the internet ok? Try again!"));
          busy = false; send.disabled = false;
          // count the attempt so a network hiccup can't trap the kid behind the gate
          sent++; if (id) save(id + ':answer', { sent: sent });
          fb.classList.add('show'); reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
        });
    }
    send.addEventListener('click', ask);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ask(); } });
  }

  // =========================================================================
  // THE FUTURE MACHINE — a full-screen, animated fortune-teller cabinet. The
  // kid whispers a dream (typed or tapped from a chip), the machine "reads the
  // future" (orb swirls, bulbs chase, gears spin), then prints a paper ticket
  // that scrolls out of a slot. Same engine as meetai — input + ideas + /api/ai
  // — but reframed as a delightful object instead of a busy chat log.
  // =========================================================================
  function stripEmoji(s) {
    // drop trailing emoji/symbols so the typed-in dream reads naturally
    return String(s).replace(/[←-⇿⌀-➿⬀-⯿️‍\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}]+/gu, '').replace(/\s+/g, ' ').trim();
  }
  function renderFutureMachine(root, cfg, id) {
    root.innerHTML = header(cfg);

    // ---- inline launch card → the machine itself takes over the whole screen
    var launch = el('div', 'ctf-fm-launch');
    root.appendChild(launch);
    var fb = el('div', 'ctf-feedback good');
    fb.textContent = cfg.thanks || 'Your future is YOURS to build — and AI is a tool in your hands. 🚀';
    root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);

    var sent = 0, prior = id ? load(id + ':answer') : null;
    if (prior && prior.sent) { sent = prior.sent; fb.classList.add('show'); reveal(done, (cfg.complete && cfg.complete.progress) || 100); }

    function drawLaunch(again) {
      launch.innerHTML =
        '<div class="ctf-fm-launch-ico">🔮</div>' +
        '<h3>' + esc(cfg.machineName || 'THE FUTURE MACHINE') + '</h3>' +
        '<p>' + esc(cfg.launchBlurb || 'A carnival machine that predicts amazing futures! Tell it a dream job and it prints your fortune ticket.') + '</p>' +
        '<button class="ctf-fm-send" data-open>' + (again ? '🔁 Step up again' : '▶ Step up to the machine') + '&nbsp;(full screen)</button>';
      launch.querySelector('[data-open]').addEventListener('click', open);
    }
    drawLaunch(!!(prior && prior.sent));

    function open() { buildMachine(); }

    function buildMachine() {
    var overlay = el('div', 'ctf-fm-fsov');
    var wrap = el('div', 'ctf-fm ctf-fm-fs');
    overlay.appendChild(wrap);
    var exit = el('button', 'ctf-fm-exit', '✕'); exit.title = 'Back to the lesson';
    overlay.appendChild(exit);
    document.body.appendChild(overlay);
    try { document.documentElement.classList.add('ctf-fs-lock'); } catch (e) {}
    function closeFS() { overlay.remove(); try { document.documentElement.classList.remove('ctf-fs-lock'); } catch (e) {} drawLaunch(sent > 0); }
    exit.addEventListener('click', closeFS);

    // ---- the machine cabinet ------------------------------------------------
    var cab = el('div', 'ctf-fm-cab');
    cab.setAttribute('data-state', 'idle');

    var marquee = el('div', 'ctf-fm-marquee');
    var bulbs = el('div', 'ctf-fm-bulbs');
    for (var i = 0; i < 11; i++) { var bl = el('i', 'ctf-fm-bulb'); bl.style.animationDelay = (i * 0.11) + 's'; bulbs.appendChild(bl); }
    marquee.appendChild(bulbs);
    marquee.appendChild(el('div', 'ctf-fm-name', esc(cfg.machineName || 'THE FUTURE MACHINE')));
    cab.appendChild(marquee);

    var screen = el('div', 'ctf-fm-screen');
    screen.innerHTML =
      '<div class="ctf-fm-orb">' +
        '<span class="ctf-fm-orb-glow"></span>' +
        '<span class="ctf-fm-swirl"></span>' +
        '<span class="ctf-fm-stars">✦<i>✧</i><b>★</b></span>' +
        '<span class="ctf-fm-eyes"><i></i><i></i></span>' +
      '</div>' +
      '<div class="ctf-fm-status"></div>' +
      '<div class="ctf-fm-thinkbar"><span></span></div>';
    cab.appendChild(screen);

    var deco = el('div', 'ctf-fm-deco');
    deco.innerHTML = '<span class="ctf-fm-gear g1">⚙️</span><span class="ctf-fm-knob"></span><span class="ctf-fm-knob"></span><span class="ctf-fm-gear g2">⚙️</span>';
    cab.appendChild(deco);

    var slot = el('div', 'ctf-fm-slot'); slot.innerHTML = '<span class="ctf-fm-slot-lip"></span><span class="ctf-fm-slot-mouth"></span>';
    cab.appendChild(slot);

    var tray = el('div', 'ctf-fm-tray');
    cab.appendChild(tray);
    wrap.appendChild(cab);

    // ---- controls -----------------------------------------------------------
    var row = el('div', 'ctf-fm-row');
    var input = el('input', 'ctf-input ctf-fm-input'); input.type = 'text';
    input.placeholder = cfg.placeholder || 'My big dream is…'; input.maxLength = 200;
    var send = el('button', 'ctf-fm-send', esc(cfg.button || '🔮 Tell my future'));
    row.appendChild(input); row.appendChild(send);
    wrap.appendChild(row);

    if (cfg.ideas && cfg.ideas.length) {
      wrap.appendChild(el('div', 'ctf-fm-chips-label', esc(cfg.ideasLabel || 'or tap a career to try one')));
      var chips = el('div', 'ctf-fm-chips');
      cfg.ideas.forEach(function (idea) {
        var c = el('button', 'ctf-fm-chip', esc(idea));
        c.addEventListener('click', function () { input.value = stripEmoji(idea); input.focus(); });
        chips.appendChild(c);
      });
      wrap.appendChild(chips);
    }

    var status = screen.querySelector('.ctf-fm-status');
    var IDLE = cfg.greeting || 'Step right up! Tell me a dream job…';
    status.textContent = IDLE;

    var busy = false;
    function setState(s) { cab.setAttribute('data-state', s); }

    function printTicket(text) {
      tray.innerHTML = '';
      var t = el('div', 'ctf-fm-ticket');
      t.innerHTML =
        '<span class="ctf-fm-ticket-perf top"></span>' +
        '<div class="ctf-fm-ticket-pad">' +
          '<div class="ctf-fm-ticket-stars">✦ &nbsp; ✦ &nbsp; ✦</div>' +
          '<div class="ctf-fm-ticket-h">' + esc(cfg.ticketTitle || 'YOUR FUTURE') + '</div>' +
          '<div class="ctf-fm-ticket-sub">' + esc(cfg.ticketSub || 'as foreseen by the machine') + '</div>' +
          '<div class="ctf-fm-ticket-body">' + esc(text) + '</div>' +
          '<div class="ctf-fm-ticket-foot">' + esc(cfg.ticketFoot || '★ the future is YOURS to build ★') + '</div>' +
        '</div>' +
        '<span class="ctf-fm-ticket-perf bot"></span>';
      tray.appendChild(t);
      requestAnimationFrame(function () { t.classList.add('out'); });
    }

    function ask() {
      var q = input.value.trim();
      if (!q || busy) return;
      if (window.CTFFilter && window.CTFFilter.clean) {
        var ck = window.CTFFilter.clean(q);
        if (ck && ck.blocked) { input.value = ''; setState('idle'); status.textContent = "Let's dream up something kind! Try again. 😊"; return; }
      }
      busy = true; send.disabled = true; input.disabled = true;
      tray.innerHTML = '';
      setState('thinking');
      status.textContent = cfg.thinking || 'Reading the stars of your future';
      var sendPrompt = cfg.promptTemplate ? cfg.promptTemplate.replace('{q}', q) : q;
      var t0 = Date.now();
      fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'kids', prompt: sendPrompt }) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          var text = (res.ok && res.d.text) ? res.d.text : ((res.d && res.d.error) || 'The crystal went foggy! Ask me again?');
          // let the machine "work" for at least a beat so the reveal feels earned
          var wait = Math.max(0, 1400 - (Date.now() - t0));
          setTimeout(function () {
            setState('print');
            status.textContent = cfg.printed || 'Your future is ready! 🎟️';
            printTicket(text);
            setTimeout(function () { setState('done'); status.textContent = cfg.again || 'Dream up another? ✨'; }, 1700);
            busy = false; send.disabled = false; input.disabled = false; input.value = '';
            sent++; if (id) save(id + ':answer', { sent: sent });
            fb.classList.add('show');
            reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
          }, wait);
        })
        .catch(function () {
          setState('idle'); status.textContent = '🙈 The machine lost the signal — try again!';
          busy = false; send.disabled = false; input.disabled = false;
          // count the attempt so a network hiccup can't trap the kid behind the gate
          sent++; if (id) save(id + ':answer', { sent: sent });
          fb.classList.add('show'); reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
        });
    }
    send.addEventListener('click', ask);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ask(); } });
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 350);
    }   // end buildMachine (full-screen)
  }

  // =========================================================================
  // TIME CAPSULE RECAP — the module's Big Ideas drop in one by one as cards,
  // a keepsake of everything unlocked instead of a wall of text. Replayable.
  // =========================================================================
  function renderRecap(root, cfg, id) {
    root.innerHTML = header(cfg);
    var wrap = el('div', 'ctf-recap'); root.appendChild(wrap);
    var items = cfg.items || [];

    function run() {
      wrap.innerHTML =
        '<div class="ctf-recap-cap"><span class="ic">📦</span><div><b>' + esc(cfg.capTitle || 'Your Time Capsule') + '</b>' +
        '<span class="sub">' + esc(cfg.capSub || 'Everything you unlocked — dropping in!') + '</span></div></div>' +
        '<div class="ctf-recap-grid"></div><div class="ctf-recap-foot"></div>';
      var grid = wrap.querySelector('.ctf-recap-grid');
      items.forEach(function (it, i) {
        var c = el('div', 'ctf-recap-card c' + (i % 5));
        c.innerHTML =
          '<span class="ctf-recap-m">Mission ' + esc(it.m) + '</span>' +
          '<span class="ctf-recap-e">' + esc(it.e) + '</span>' +
          '<b>' + esc(it.h) + '</b><p>' + it.t + '</p>';
        c.style.animationDelay = (0.35 + i * 0.3) + 's';
        grid.appendChild(c);
      });
      setTimeout(function () {
        var f = wrap.querySelector('.ctf-recap-foot');
        f.innerHTML = '<button class="ctf-btn ctf-recap-replay">🔁 Drop them in again</button>';
        f.querySelector('button').addEventListener('click', run);
        if (id) save(id + ':answer', { seen: 1 });
        markDone(id);
      }, 350 + items.length * 300 + 650);
    }
    run();
  }

  // =========================================================================
  // CRACK THE SECRET RULE — a pattern-detective game. Study a few examples,
  // predict new ones, get feedback, and figure out the hidden rule — exactly
  // how you (and AI) learn a concept from examples. Open-ended discovery.
  // =========================================================================
  function renderRule(root, cfg, id) {
    root.innerHTML = header(cfg);
    var wrap = el('div', 'ctf-rule'); root.appendChild(wrap);
    var fb = el('div', 'ctf-feedback'); root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);
    var rounds = cfg.rounds || [], ri = 0;
    var prior = id ? load(id + ':answer') : null;
    if (prior && prior.done) { finishedView(); fb.classList.add('show'); reveal(done, (cfg.complete && cfg.complete.progress) || 100); }
    else playRound();

    function exCol(title, items, yes) {
      var c = el('div', 'ctf-rule-col ' + (yes ? 'yes' : 'no'));
      c.appendChild(el('div', 'ctf-rule-col-h', title));
      var g = el('div', 'ctf-rule-items');
      (items || []).forEach(function (it) { g.appendChild(el('span', 'ctf-rule-chip', '<span class="em">' + esc(it.emoji) + '</span>' + esc(it.label || ''))); });
      c.appendChild(g); return c;
    }
    function playRound() {
      var R = rounds[ri]; wrap.innerHTML = '';
      var pips = el('div', 'ctf-rule-pips');
      for (var p = 0; p < rounds.length; p++) pips.appendChild(el('i', 'ctf-rule-pip ' + (p < ri ? 'done' : p === ri ? 'on' : '')));
      wrap.appendChild(pips);
      wrap.appendChild(el('div', 'ctf-rule-title', 'Meet the <b>' + esc(R.name || 'Zorbs') + '</b> — what makes one a ' + esc(R.name || 'Zorb') + '? 🤔'));
      var ex = el('div', 'ctf-rule-ex');
      ex.appendChild(exCol('✅ ARE ' + esc(R.name || 'Zorbs'), R.yes, true));
      ex.appendChild(exCol('🚫 are NOT', R.no, false));
      wrap.appendChild(ex);
      wrap.appendChild(el('div', 'ctf-rule-q', 'Now YOU spot them!'));
      var tests = R.tests || [], ti = 0;
      var tw = el('div', 'ctf-rule-tests'); wrap.appendChild(tw);
      showTest();
      function showTest() {
        if (ti >= tests.length) { cracked(); return; }
        tw.innerHTML = ''; var t = tests[ti];
        tw.appendChild(el('div', 'ctf-rule-card', '<span class="em">' + esc(t.emoji) + '</span><span class="lb">' + esc(t.label || '') + '</span>'));
        var btns = el('div', 'ctf-rule-btns');
        var yes = el('button', 'ctf-rule-btn yes', '✓ ' + esc(R.name || 'Zorb'));
        var no = el('button', 'ctf-rule-btn no', '🚫 Nope');
        btns.appendChild(yes); btns.appendChild(no); tw.appendChild(btns);
        function judge(g) {
          yes.disabled = no.disabled = true;
          var right = (g === !!t.zorb);
          tw.querySelector('.ctf-rule-card').classList.add(right ? 'right' : 'wrong');
          fb.className = 'ctf-feedback show ' + (right ? 'good' : 'info');
          fb.innerHTML = (right ? '✅ ' : '🤔 ') + esc(t.why || (t.zorb ? 'It IS one!' : 'It is NOT one.'));
          setTimeout(function () { ti++; fb.classList.remove('show'); showTest(); }, 1150);
        }
        yes.onclick = function () { judge(true); }; no.onclick = function () { judge(false); };
      }
      function cracked() {
        tw.innerHTML = '<div class="ctf-rule-crack">🔑 You cracked it!<br><b>' + esc(R.reveal) + '</b></div>';
        var nx = el('button', 'ctf-btn ctf-rule-next', ri < rounds.length - 1 ? 'Next mystery →' : 'Finish 🎉');
        tw.appendChild(nx);
        nx.onclick = function () { if (ri < rounds.length - 1) { ri++; playRound(); } else finishRule(); };
      }
    }
    function finishRule() {
      if (id) save(id + ':answer', { done: true });
      finishedView();
      fb.className = 'ctf-feedback show good';
      fb.innerHTML = cfg.thanks || "You learned each rule from just a few examples — that's EXACTLY how AI learns! 🧠";
      reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
    }
    function finishedView() { wrap.innerHTML = '<div class="ctf-rule-finished">🕵️ Pattern Detective! You cracked all ' + rounds.length + ' secret rules.</div>'; }
  }

  // =========================================================================
  // CATCH THE AI'S MISTAKE — the AI makes confident claims; YOU decide trust
  // vs double-check. Teaches: sounding sure ≠ being right; humans are the check.
  // =========================================================================
  function renderFactCheck(root, cfg, id) {
    root.innerHTML = header(cfg);
    var wrap = el('div', 'ctf-fc'); root.appendChild(wrap);
    var fb = el('div', 'ctf-feedback'); root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);
    var claims = cfg.claims || [], ci = 0, caught = 0;
    var prior = id ? load(id + ':answer') : null;
    if (prior && prior.done) { wrap.innerHTML = '<div class="ctf-fc-finished">🔍 Fact-Checker! You judged every claim.</div>'; fb.classList.add('show'); reveal(done, (cfg.complete && cfg.complete.progress) || 100); return; }
    showClaim();
    function showClaim() {
      if (ci >= claims.length) { finish(); return; }
      var c = claims[ci]; wrap.innerHTML = '';
      var pips = el('div', 'ctf-fc-pips');
      for (var p = 0; p < claims.length; p++) pips.appendChild(el('i', 'ctf-fc-pip ' + (p < ci ? 'done' : p === ci ? 'on' : '')));
      wrap.appendChild(pips);
      wrap.appendChild(el('div', 'ctf-fc-bubble', '<span class="av">🤖</span><span class="txt">' + esc(c.text) + '</span>'));
      var btns = el('div', 'ctf-fc-btns');
      var trust = el('button', 'ctf-fc-btn trust', '✅ Trust it');
      var check = el('button', 'ctf-fc-btn check', '🔍 Double-check');
      btns.appendChild(trust); btns.appendChild(check); wrap.appendChild(btns);
      function judge(trusted) {
        trust.disabled = check.disabled = true;
        var smart = (trusted === !!c.ok);
        if (!c.ok && !trusted) caught++;
        wrap.querySelector('.ctf-fc-bubble').classList.add(c.ok ? 'true' : 'false');
        fb.className = 'ctf-feedback show ' + (smart ? 'good' : 'info');
        fb.innerHTML = (c.ok ? '✅ Yep, that one\'s TRUE. ' : '🔍 That one\'s WRONG! ') + esc(c.why || '');
        var nx = el('button', 'ctf-btn ctf-fc-next', ci < claims.length - 1 ? 'Next claim →' : 'See my score →');
        wrap.appendChild(nx); nx.onclick = function () { ci++; fb.classList.remove('show'); showClaim(); };
      }
      trust.onclick = function () { judge(true); }; check.onclick = function () { judge(false); };
    }
    function finish() {
      var wrong = claims.filter(function (c) { return !c.ok; }).length;
      if (id) save(id + ':answer', { done: true });
      wrap.innerHTML = '<div class="ctf-fc-finished">🔍 You caught <b>' + caught + ' of ' + wrong + '</b> sneaky mistakes!</div>';
      fb.className = 'ctf-feedback show good';
      fb.innerHTML = cfg.thanks || "AI sounds super sure even when it's wrong — so YOU are always the checker. 🕵️";
      reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
    }
  }

  // =========================================================================
  // ATTENTION LAB — tap a word to choose what the focus word ("it"/"he") pays
  // attention to. A glowing beam draws the link and the meaning changes —
  // sensible or silly. Tweak it freely across several sentences. Visual + play.
  // =========================================================================
  function renderAttentionLab(root, cfg, id) {
    root.innerHTML = header(cfg);
    var rounds = cfg.rounds || [], i = 0;
    var area = el('div', 'ctf-al'); root.appendChild(area);
    var fb = el('div', 'ctf-feedback'); root.appendChild(fb);
    var actions = el('div', 'ctf-actions'); root.appendChild(actions);
    var done = completionCard(cfg); if (done) root.appendChild(done);
    var prior = id ? load(id + ':answer') : null;
    if (prior && prior.done) { area.innerHTML = '<div class="al-finished">🔦 Attention Ace! You explored how every word connects.</div>'; fb.classList.add('show'); reveal(done, (cfg.complete && cfg.complete.progress) || 100); return; }
    show();

    function focusWord(R) { var f = (R.words || []).filter(function (w) { return w.focus; })[0]; return f ? f.w.replace(/[^A-Za-z']/g, '') : 'it'; }
    function drawBeam(stage, svg, fromEl, toEl, ok) {
      var sr = stage.getBoundingClientRect(), a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
      var ax = a.left + a.width / 2 - sr.left, ay = a.top - sr.top, bx = b.left + b.width / 2 - sr.left, by = b.top - sr.top;
      var midY = Math.min(ay, by) - 28;
      svg.setAttribute('viewBox', '0 0 ' + sr.width + ' ' + sr.height);
      svg.innerHTML = '';
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M ' + ax + ' ' + ay + ' Q ' + ((ax + bx) / 2) + ' ' + midY + ' ' + bx + ' ' + by);
      p.setAttribute('fill', 'none'); p.setAttribute('stroke', ok ? '#12B2BC' : '#FFB320');
      p.setAttribute('stroke-width', '4'); p.setAttribute('stroke-linecap', 'round');
      svg.appendChild(p);
      var L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; p.style.transition = 'stroke-dashoffset .5s ease';
      requestAnimationFrame(function () { p.style.strokeDashoffset = 0; });
    }
    function show() {
      var R = rounds[i], found = false;
      area.innerHTML = '';
      if (rounds.length > 1) area.appendChild(el('p', 'ctf-roundlbl', 'Sentence ' + (i + 1) + ' of ' + rounds.length));
      area.appendChild(el('p', 'al-tip', 'Tap a word to see what <b>' + esc(focusWord(R)) + '</b> connects to. Try a few — which one makes sense? 🔦'));
      var stage = el('div', 'al-stage');
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'al-beams');
      stage.appendChild(svg);
      var sent = el('div', 'al-sentence'); var focusEl = null;
      (R.words || []).forEach(function (t) {
        var c = el('span', 'al-chip', esc(t.w));
        if (t.focus) { c.classList.add('al-focus'); focusEl = c; }
        else if (t.opt) { c.classList.add('al-opt'); c.onclick = function () { pick(t, c); }; }
        sent.appendChild(c);
      });
      stage.appendChild(sent); area.appendChild(stage);
      var result = el('div', 'al-result'); area.appendChild(result);
      fb.className = 'ctf-feedback'; actions.innerHTML = '';

      function pick(t, c) {
        sent.querySelectorAll('.al-opt').forEach(function (x) { x.classList.remove('on-ok', 'on-bad'); });
        c.classList.add(t.ok ? 'on-ok' : 'on-bad');
        if (focusEl) drawBeam(stage, svg, focusEl, c, t.ok);
        result.className = 'al-result show ' + (t.ok ? 'ok' : 'bad');
        result.innerHTML = t.result;
        if (t.ok && !found) {
          found = true;
          if (R.why) result.innerHTML += '<div class="al-why">' + R.why + '</div>';
          if (i < rounds.length - 1) {
            var nx = el('button', 'ctf-btn', 'Next sentence →'); nx.onclick = function () { i++; show(); };
            actions.innerHTML = ''; actions.appendChild(nx);
          } else {
            if (id) save(id + ':answer', { done: true });
            reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
            fb.className = 'ctf-feedback show good';
            fb.innerHTML = cfg.thanks || "You see it now — attention is just deciding which words connect. That's the trick behind every chatbot! 🔦";
          }
        }
      }
    }
  }

  // =========================================================================
  // STORY OF AI — a cinematic, build-it-yourself timeline. Tap to reveal each
  // milestone of the last ~20 years; an "AI smarts" meter climbs as the years
  // bunch up — so kids FEEL how fast AI got smart. Storytelling, not a quiz.
  // =========================================================================
  function renderStoryline(root, cfg, id) {
    root.innerHTML = header(cfg);
    var ms = cfg.milestones || [];
    var meter = el('div', 'sl-meter', '<div class="sl-mhead"><span>🧠 AI smarts</span><span class="sl-mlabel">just getting started…</span></div><div class="sl-bar"><i></i></div>');
    root.appendChild(meter);
    var track = el('div', 'sl-track'); root.appendChild(track);
    var actions = el('div', 'ctf-actions'); root.appendChild(actions);
    var fb = el('div', 'ctf-feedback'); root.appendChild(fb);
    var done = completionCard(cfg); if (done) root.appendChild(done);
    var bar = meter.querySelector('.sl-bar > i'), mlabel = meter.querySelector('.sl-mlabel');
    var btn = el('button', 'ctf-btn', '▶ Start the story'); actions.appendChild(btn);

    function setMeter(v) {
      bar.style.width = v + '%';
      mlabel.textContent = v >= 100 ? "…and now it's YOUR turn! 🚀" : v >= 75 ? 'mind-blowing 🤯' : v >= 50 ? 'really smart 🧠' : v >= 25 ? 'getting clever ✨' : 'just getting started…';
    }
    function addCard(m, animate) {
      var c = el('div', 'sl-item' + (animate ? ' in' : ''),
        '<div class="sl-dot">' + esc(m.icon || '•') + '</div>' +
        '<div class="sl-card"><div class="sl-year">' + esc(m.year) + '</div>' +
        '<div class="sl-title">' + esc(m.title) + '</div>' +
        '<div class="sl-text">' + esc(m.text) + '</div></div>');
      track.appendChild(c);
      if (animate) { try { c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {} }
    }
    function finishStory() {
      btn.remove();
      fb.className = 'ctf-feedback show good'; fb.innerHTML = cfg.thanks || '';
      reveal(done, (cfg.complete && cfg.complete.progress) || 100); markDone(id);
    }

    var prior = id ? load(id + ':answer') : null;
    if (prior && prior.done) { ms.forEach(function (m) { addCard(m); }); setMeter(100); finishStory(); return; }
    var shown = (prior && prior.shown) ? Math.min(prior.shown, ms.length) : 0;
    for (var k = 0; k < shown; k++) addCard(ms[k]);
    if (shown > 0) { setMeter(ms[shown - 1].smarts); btn.textContent = 'Next →'; }

    btn.onclick = function () {
      if (shown >= ms.length) return;
      var m = ms[shown]; shown++;
      addCard(m, true); setMeter(m.smarts);
      if (id) save(id + ':answer', { shown: shown });
      if (shown >= ms.length) { if (id) save(id + ':answer', { shown: shown, done: true }); finishStory(); }
      else btn.textContent = 'Next →';
    };
  }

  // ---- registry + boot ----------------------------------------------------
  var RENDERERS = { poll: renderPoll, sort: renderSort, choice: renderChoice, nextword: renderNextWord, attention: renderAttention, quiz: renderQuiz, timeline: renderTimeline, reveal: renderReveal, slider: renderSlider, trainer: renderTrainer, match: renderMatch, draw: renderDraw, wordchain: renderWordChain, order: renderOrder, neuron: renderNeuron, recap: renderRecap, arcade: renderArcade, meetai: renderMeetAI, future: renderFutureMachine, rule: renderRule, factcheck: renderFactCheck, attentionlab: renderAttentionLab, storyline: renderStoryline };

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
