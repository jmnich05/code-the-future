/* ==========================================================================
   Code the Future — avatar builder (window.CTFBuilder)
   Renders a live avatar preview + tabbed part pickers. Used by onboarding and
   the profile editor. Calls onChange(config) whenever a part changes.
   ========================================================================== */
(function () {
  var A = window.CTFAvatar;
  var CAT = [
    { key: "bg", label: "Background", type: "bg" },
    { key: "color", label: "Color", type: "color" },
    { key: "face", label: "Face", type: "part" },
    { key: "acc", label: "Extra", type: "part" }
  ];

  function opts(cat) { return cat.key === "bg" ? A.BG : cat.key === "color" ? A.COLORS : cat.key === "face" ? A.FACES : A.ACCS; }

  function mount(o) {
    var preview = o.preview, picker = o.picker;
    var cfg = Object.assign({}, A.DEFAULT, o.config || {});
    var onChange = o.onChange || function () {};
    var active = 0;

    function paint() { preview.innerHTML = A.render(cfg); }

    function render() {
      var c = CAT[active];
      var tabs = '<div class="builder-tabs">' + CAT.map(function (x, i) {
        return '<button class="builder-tab' + (i === active ? " active" : "") + '" data-i="' + i + '">' + x.label + "</button>";
      }).join("") + "</div>";
      var sw = '<div class="swatches">' + opts(c).map(function (v) {
        var sel = cfg[c.key] === v ? " sel" : "";
        if (c.type === "bg") return '<button class="swatch' + sel + '" title="' + v + '" data-v="' + v + '" style="background:' + A.bgHex(v) + '"></button>';
        if (c.type === "color") return '<button class="swatch' + sel + '" title="' + v + '" data-v="' + v + '" style="background:' + A.colorHex(v) + '"></button>';
        var mini = Object.assign({}, cfg); mini[c.key] = v;
        return '<button class="swatch' + sel + '" title="' + v + '" data-v="' + v + '"><span class="mini">' + A.render(mini) + "</span></button>";
      }).join("") + "</div>";
      picker.innerHTML = tabs + sw;
      picker.querySelectorAll(".builder-tab").forEach(function (t) { t.onclick = function () { active = +t.dataset.i; render(); }; });
      picker.querySelectorAll(".swatch").forEach(function (s) {
        s.onclick = function () { cfg[c.key] = s.dataset.v; paint(); render(); onChange(Object.assign({}, cfg)); };
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
