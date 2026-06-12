/* ==========================================================================
   Code the Future — avatar builder (window.CTFBuilder)
   Renders a live avatar preview + tabbed part pickers. Used by onboarding and
   the profile editor. Mission-reward accessories show locked (🔒) until the
   matching badge is earned — pass opts.unlocked = { accKey: true, ... }.
   ========================================================================== */
(function () {
  var A = window.CTFAvatar;
  var CAT = [
    { key: "bg", label: "Background", type: "bg" },
    { key: "color", label: "Color", type: "color" },
    { key: "hair", label: "Hair", type: "part" },
    { key: "face", label: "Eyes", type: "part" },
    { key: "brows", label: "Brows", type: "part" },
    { key: "mouth", label: "Mouth", type: "part" },
    { key: "acc", label: "Gear", type: "part" }
  ];

  function opts(cat) {
    return cat.key === "bg" ? A.BG
      : cat.key === "color" ? A.COLORS
      : cat.key === "hair" ? A.HAIR
      : cat.key === "face" ? A.FACES
      : cat.key === "brows" ? A.BROWS
      : cat.key === "mouth" ? A.MOUTHS
      : A.ACCS;
  }

  function mount(o) {
    var preview = o.preview, picker = o.picker;
    var cfg = Object.assign({}, A.DEFAULT, o.config || {});
    var onChange = o.onChange || function () {};
    var unlocked = o.unlocked || {};
    var active = 0;

    function isLocked(catKey, v) {
      if (catKey !== "acc") return false;
      if (A.BASE_ACCS.indexOf(v) >= 0) return false;
      return !unlocked[v];
    }

    function paint() { preview.innerHTML = A.render(cfg); }

    function render() {
      var c = CAT[active];
      var tabs = '<div class="builder-tabs">' + CAT.map(function (x, i) {
        return '<button class="builder-tab' + (i === active ? " active" : "") + '" data-i="' + i + '">' + x.label + "</button>";
      }).join("") + "</div>";
      var sw = '<div class="swatches">' + opts(c).map(function (v) {
        var sel = cfg[c.key] === v ? " sel" : "";
        var lock = isLocked(c.key, v) ? " locked" : "";
        if (c.type === "bg") return '<button class="swatch' + sel + '" title="' + v + '" data-v="' + v + '" style="background:' + A.bgHex(v) + '"></button>';
        if (c.type === "color") return '<button class="swatch' + sel + '" title="' + v + '" data-v="' + v + '" style="background:' + A.colorHex(v) + '"></button>';
        var mini = Object.assign({}, cfg); mini[c.key] = v;
        return '<button class="swatch' + sel + lock + '" title="' + v + '" data-v="' + v + '"><span class="mini">' + A.render(mini) + "</span></button>";
      }).join("") + "</div>" + (c.key === "acc" ? '<div class="unlock-hint" id="unlockHint"></div>' : "");
      picker.innerHTML = tabs + sw;
      picker.querySelectorAll(".builder-tab").forEach(function (t) { t.onclick = function () { active = +t.dataset.i; render(); }; });
      picker.querySelectorAll(".swatch").forEach(function (s) {
        s.onclick = function () {
          var v = s.dataset.v;
          if (isLocked(c.key, v)) {
            var r = A.rewardForAcc(v);
            var hint = picker.querySelector("#unlockHint");
            if (hint && r) hint.textContent = "🔒 " + r.label + " unlocks when you finish Mission " + r.n + "!";
            return;
          }
          cfg[c.key] = v; paint(); render(); onChange(Object.assign({}, cfg));
        };
      });
    }

    paint(); render();
    return {
      config: function () { return Object.assign({}, cfg); },
      randomize: function () { cfg = A.random(); paint(); render(); onChange(Object.assign({}, cfg)); }
    };
  }

  window.CTFBuilder = { mount: mount };
})();
