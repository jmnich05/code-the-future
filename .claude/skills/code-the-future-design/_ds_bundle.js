/* @ds-bundle: {"format":3,"namespace":"CodeTheFutureDesignSystem_909f12","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"442ae2a10537","components/core/Badge.jsx":"3f5a05647810","components/core/Button.jsx":"c8413e3137a7","components/core/Card.jsx":"478c0da91b5a","components/forms/Input.jsx":"0cea3caf02bd","components/navigation/Tabs.jsx":"ddc7fded1e9d","ui_kits/platform/Dashboard.jsx":"f9d7612ac555","ui_kits/platform/Sidebar.jsx":"06d65f59e5cf","ui_kits/platform/boot.jsx":"26378d9f5682","ui_kits/website/Hero.jsx":"ddc7222caf9f","ui_kits/website/Nav.jsx":"7fcb1eb98f7a","ui_kits/website/Sections.jsx":"9cdbb10281c6","ui_kits/website/boot.jsx":"0d566961e9b0","ui_kits/website/icons.jsx":"9bc132e760f6"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.CodeTheFutureDesignSystem_909f12 = window.CodeTheFutureDesignSystem_909f12 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Avatar({
  name = '',
  src = null,
  size = 44,
  variant = 'spark',
  style,
  ...rest
}) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]?.toUpperCase()).join('');
  const gradients = {
    spark: 'var(--gradient-spark)',
    sunrise: 'var(--gradient-sunrise)',
    night: 'var(--gradient-night)'
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      width: size,
      height: size,
      borderRadius: 'var(--radius-full)',
      background: src ? `center/cover no-repeat url(${src})` : gradients[variant] || gradients.spark,
      color: 'var(--white)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--weight-bold)',
      fontSize: size * 0.4,
      letterSpacing: '0.01em',
      flex: 'none',
      boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.18)',
      userSelect: 'none',
      ...style
    },
    title: name
  }, rest), !src && initials);
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Badge({
  children,
  variant = 'neutral',
  dot = false,
  style,
  ...rest
}) {
  const variants = {
    neutral: {
      bg: 'var(--ink-100)',
      fg: 'var(--ink-700)'
    },
    primary: {
      bg: 'var(--blue-50)',
      fg: 'var(--blue-700)'
    },
    secondary: {
      bg: 'var(--teal-50)',
      fg: 'var(--teal-700)'
    },
    accent: {
      bg: 'var(--coral-50)',
      fg: 'var(--coral-700)'
    },
    success: {
      bg: 'var(--color-success-bg)',
      fg: 'var(--color-success)'
    },
    warning: {
      bg: 'var(--color-warning-bg)',
      fg: 'var(--amber-600)'
    },
    danger: {
      bg: 'var(--color-danger-bg)',
      fg: 'var(--color-danger)'
    }
  };
  const v = variants[variant] || variants.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 11px',
      background: v.bg,
      color: v.fg,
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      fontWeight: 'var(--weight-medium)',
      letterSpacing: 'var(--tracking-wide)',
      textTransform: 'uppercase',
      borderRadius: 'var(--radius-pill)',
      lineHeight: 1.4,
      ...style
    }
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: v.fg,
      display: 'inline-block'
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Button({
  children,
  variant = 'primary',
  size = 'md',
  iconLeft = null,
  iconRight = null,
  fullWidth = false,
  disabled = false,
  type = 'button',
  onClick,
  style,
  ...rest
}) {
  const sizes = {
    sm: {
      padding: '0 16px',
      height: 38,
      fontSize: 14,
      gap: 7
    },
    md: {
      padding: '0 22px',
      height: 46,
      fontSize: 15,
      gap: 8
    },
    lg: {
      padding: '0 30px',
      height: 56,
      fontSize: 17,
      gap: 10
    }
  };
  const s = sizes[size] || sizes.md;
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s.gap,
    height: s.height,
    minHeight: 'var(--hit-min)',
    padding: s.padding,
    width: fullWidth ? '100%' : 'auto',
    fontFamily: 'var(--font-display)',
    fontWeight: 'var(--weight-semibold)',
    fontSize: s.fontSize,
    letterSpacing: 'var(--tracking-snug)',
    borderRadius: 'var(--radius-pill)',
    border: '2px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'transform var(--dur-fast) var(--ease-out), background var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)',
    whiteSpace: 'nowrap',
    textDecoration: 'none'
  };
  const variants = {
    primary: {
      background: 'var(--color-primary)',
      color: 'var(--text-on-brand)',
      boxShadow: 'var(--shadow-sm)'
    },
    accent: {
      background: 'var(--color-accent)',
      color: 'var(--text-on-brand)',
      boxShadow: 'var(--shadow-sm)'
    },
    secondary: {
      background: 'var(--surface-card)',
      color: 'var(--text-strong)',
      border: '2px solid var(--border-strong)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-primary)'
    }
  };
  const v = variants[variant] || variants.primary;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled,
    onClick: onClick,
    style: {
      ...base,
      ...v,
      ...style
    },
    onMouseDown: e => {
      if (!disabled) e.currentTarget.style.transform = 'scale(0.97)';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, rest), iconLeft, children, iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card({
  children,
  variant = 'default',
  padding = 'md',
  interactive = false,
  style,
  ...rest
}) {
  const pads = {
    sm: 'var(--space-4)',
    md: 'var(--space-5)',
    lg: 'var(--space-7)'
  };
  const variants = {
    default: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      boxShadow: 'var(--shadow-sm)',
      color: 'var(--text-body)'
    },
    elevated: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      boxShadow: 'var(--shadow-lg)',
      color: 'var(--text-body)'
    },
    dark: {
      background: 'var(--gradient-night)',
      border: '1px solid var(--border-on-dark)',
      boxShadow: 'var(--shadow-lg)',
      color: 'var(--text-on-dark)'
    },
    outline: {
      background: 'transparent',
      border: '2px solid var(--border-strong)',
      color: 'var(--text-body)'
    }
  };
  const v = variants[variant] || variants.default;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      borderRadius: 'var(--radius-lg)',
      padding: pads[padding] || pads.md,
      transition: 'transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)',
      cursor: interactive ? 'pointer' : 'default',
      ...v,
      ...style
    },
    onMouseEnter: interactive ? e => {
      e.currentTarget.style.transform = 'translateY(-3px)';
      e.currentTarget.style.boxShadow = 'var(--shadow-xl)';
    } : undefined,
    onMouseLeave: interactive ? e => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = v.boxShadow || 'none';
    } : undefined
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  label,
  hint,
  error,
  iconLeft = null,
  type = 'text',
  id,
  style,
  ...rest
}) {
  const inputId = id || (label ? `in-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  const [focused, setFocused] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontFamily: 'var(--font-body)',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-strong)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      height: 48,
      padding: '0 16px',
      background: 'var(--surface-card)',
      border: `2px solid ${error ? 'var(--color-danger)' : focused ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
      borderRadius: 'var(--radius-md)',
      boxShadow: focused && !error ? 'var(--ring)' : 'none',
      transition: 'border-color var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)'
    }
  }, iconLeft && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)',
      display: 'flex'
    }
  }, iconLeft), /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    type: type,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      flex: 1,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-base)',
      color: 'var(--text-strong)',
      minWidth: 0
    }
  }, rest))), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: error ? 'var(--color-danger)' : 'var(--text-muted)'
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Tabs({
  tabs = [],
  value,
  defaultValue,
  onChange,
  style,
  ...rest
}) {
  const [internal, setInternal] = React.useState(defaultValue ?? tabs[0]?.value);
  const active = value !== undefined ? value : internal;
  const select = v => {
    if (value === undefined) setInternal(v);
    onChange && onChange(v);
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'inline-flex',
      gap: 4,
      padding: 5,
      background: 'var(--surface-sunken)',
      borderRadius: 'var(--radius-pill)',
      fontFamily: 'var(--font-display)',
      ...style
    }
  }, rest), tabs.map(t => {
    const on = t.value === active;
    return /*#__PURE__*/React.createElement("button", {
      key: t.value,
      type: "button",
      onClick: () => select(t.value),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        border: 'none',
        cursor: 'pointer',
        padding: '0 18px',
        height: 38,
        borderRadius: 'var(--radius-pill)',
        fontFamily: 'var(--font-display)',
        fontWeight: 'var(--weight-semibold)',
        fontSize: 'var(--text-sm)',
        color: on ? 'var(--text-on-brand)' : 'var(--text-muted)',
        background: on ? 'var(--color-primary)' : 'transparent',
        boxShadow: on ? 'var(--shadow-sm)' : 'none',
        transition: 'background var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out)'
      }
    }, t.icon, t.label);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/platform/Dashboard.jsx
try { (() => {
const {
  Badge: DBadge,
  Button: DButton,
  Avatar: DAvatar,
  Card: DCard
} = window.CodeTheFutureDesignSystem_909f12;
const DIcon = window.CTFIcon;
function Dashboard() {
  const lessons = [['done', '01', 'Loops, for real', 'Repeat work until the job is done'], ['done', '02', 'Conditionals & branches', 'Decisions inside the loop'], ['now', '03', 'From a loop to an agent loop', 'Observe · decide · act · check'], ['next', '04', 'Tools & APIs', 'Let your agent reach the outside world'], ['next', '05', 'Stopping conditions', 'When confidence runs out, ask a human']];
  return /*#__PURE__*/React.createElement("main", {
    className: "main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "topbar"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", null, "Welcome back, Charlotte"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "You're on Module 03 \u2014 the agent loop. Almost there.")), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement(DBadge, {
    variant: "secondary",
    dot: true
  }, "Cohort: Summer 2026"), /*#__PURE__*/React.createElement(DAvatar, {
    name: "Charlotte N",
    variant: "spark",
    size: 42
  })), /*#__PURE__*/React.createElement("div", {
    className: "stat-row"
  }, /*#__PURE__*/React.createElement(DCard, {
    padding: "md",
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "l"
  }, /*#__PURE__*/React.createElement(DIcon, {
    name: "circle-check-big",
    size: 15,
    color: "var(--color-success)"
  }), " Lessons done"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, "12", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      color: 'var(--text-faint)'
    }
  }, " / 24")), /*#__PURE__*/React.createElement("div", {
    className: "bar"
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: '50%'
    }
  }))), /*#__PURE__*/React.createElement(DCard, {
    padding: "md",
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "l"
  }, /*#__PURE__*/React.createElement(DIcon, {
    name: "git-branch",
    size: 15,
    color: "var(--color-primary)"
  }), " Agents built"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, "3")), /*#__PURE__*/React.createElement(DCard, {
    padding: "md",
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "l"
  }, /*#__PURE__*/React.createElement(DIcon, {
    name: "flame",
    size: 15,
    color: "var(--coral-500)"
  }), " Day streak"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, "12"))), /*#__PURE__*/React.createElement("div", {
    className: "content-grid"
  }, /*#__PURE__*/React.createElement(DCard, {
    padding: "lg"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-title"
  }, /*#__PURE__*/React.createElement(DIcon, {
    name: "book-open",
    size: 18,
    color: "var(--color-primary)"
  }), " Your path"), lessons.map(([state, num, title, sub]) => /*#__PURE__*/React.createElement("div", {
    className: "lesson",
    key: num
  }, /*#__PURE__*/React.createElement("div", {
    className: `num ${state}`
  }, state === 'done' ? /*#__PURE__*/React.createElement(DIcon, {
    name: "check",
    size: 18
  }) : num), /*#__PURE__*/React.createElement("div", {
    className: "lt"
  }, /*#__PURE__*/React.createElement("b", null, title), /*#__PURE__*/React.createElement("span", null, sub)), state === 'now' ? /*#__PURE__*/React.createElement(DButton, {
    variant: "primary",
    size: "sm",
    iconRight: /*#__PURE__*/React.createElement(DIcon, {
      name: "arrow-right",
      size: 15
    })
  }, "Resume") : state === 'done' ? /*#__PURE__*/React.createElement(DBadge, {
    variant: "success"
  }, "Done") : /*#__PURE__*/React.createElement(DIcon, {
    name: "lock",
    size: 16,
    color: "var(--text-faint)"
  })))), /*#__PURE__*/React.createElement(DCard, {
    variant: "dark",
    padding: "lg"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-title",
    style: {
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement(DIcon, {
    name: "terminal",
    size: 18,
    color: "var(--teal-300)"
  }), " Today's loop"), /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'rgba(255,255,255,0.7)',
      fontSize: 14,
      margin: '0 0 4px',
      lineHeight: 1.55
    }
  }, "Build an agent that files transcripts. Code handles the loop \u2014 you decide where AI gets to judge."), /*#__PURE__*/React.createElement("div", {
    className: "codeblk"
  }, /*#__PURE__*/React.createElement("span", {
    className: "c"
  }, "# your turn: fill in the judgment"), '\n', /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "for"), " file ", /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "in"), " transcripts:", '\n', '    ', "info = agent.", /*#__PURE__*/React.createElement("span", {
    className: "fn"
  }, "read"), "(file)", '\n', '    ', /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "if"), " info.confidence > ", /*#__PURE__*/React.createElement("span", {
    className: "s"
  }, "0.8"), ":", '\n', '        ', "agent.", /*#__PURE__*/React.createElement("span", {
    className: "fn"
  }, "file_it"), "(info)", '\n', '    ', /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "else"), ":", '\n', '        ', /*#__PURE__*/React.createElement("span", {
    className: "fn"
  }, "ask_human"), "(file)"), /*#__PURE__*/React.createElement(DButton, {
    variant: "accent",
    fullWidth: true,
    iconRight: /*#__PURE__*/React.createElement(DIcon, {
      name: "play",
      size: 16
    })
  }, "Run in sandbox"))));
}
window.Dashboard = Dashboard;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/platform/Dashboard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/platform/Sidebar.jsx
try { (() => {
const {
  Badge: PBadge,
  Button: PButton,
  Avatar: PAvatar,
  Card: PCard,
  Tabs: PTabs
} = window.CodeTheFutureDesignSystem_909f12;
const PIcon = window.CTFIcon;
function Sidebar({
  route,
  setRoute
}) {
  const items = [['dashboard', 'layout-dashboard', 'Dashboard'], ['lessons', 'book-open', 'Lessons'], ['projects', 'folder-git-2', 'Projects'], ['camp', 'tent-tree', 'Summer Camp']];
  return /*#__PURE__*/React.createElement("aside", {
    className: "side"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-icon-dark.svg",
    alt: ""
  }), /*#__PURE__*/React.createElement("b", null, "Code the ", /*#__PURE__*/React.createElement("span", null, "Future"))), /*#__PURE__*/React.createElement("nav", {
    className: "snav"
  }, items.map(([key, icon, label]) => /*#__PURE__*/React.createElement("a", {
    key: key,
    className: route === key ? 'on' : '',
    onClick: () => setRoute(key)
  }, /*#__PURE__*/React.createElement(PIcon, {
    name: icon,
    size: 19
  }), label))), /*#__PURE__*/React.createElement("div", {
    className: "side-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "streak",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(PIcon, {
    name: "flame",
    size: 22,
    color: "var(--coral-400)"
  }), " 12"), /*#__PURE__*/React.createElement("small", null, "day streak \u2014 keep the loop running")));
}
window.Sidebar = Sidebar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/platform/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/platform/boot.jsx
try { (() => {
function PlatformApp() {
  const [route, setRoute] = React.useState('dashboard');
  React.useEffect(() => {
    window.hydrateIcons();
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "app"
  }, /*#__PURE__*/React.createElement(window.Sidebar, {
    route: route,
    setRoute: setRoute
  }), /*#__PURE__*/React.createElement(window.Dashboard, null));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(PlatformApp, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/platform/boot.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Hero.jsx
try { (() => {
const {
  Button: HButton,
  Badge: HBadge,
  Avatar: HAvatar
} = window.CodeTheFutureDesignSystem_909f12;
const HIcon = window.CTFIcon;
function Hero() {
  return /*#__PURE__*/React.createElement("header", {
    className: "hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap hero-grid"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, /*#__PURE__*/React.createElement(HIcon, {
    name: "sparkles",
    size: 15
  }), " Summer 2026 \xB7 Louisville, KY"), /*#__PURE__*/React.createElement("h1", {
    className: "display"
  }, "Learn to build ", /*#__PURE__*/React.createElement("em", null, "what's\xA0next.")), /*#__PURE__*/React.createElement("p", {
    className: "lead"
  }, "A platform and in-person camp where kids learn AI literacy and modern coding the way the work actually happens \u2014 Python, TypeScript, and SQL, with AI as a reasoning engine inside a real workflow."), /*#__PURE__*/React.createElement("div", {
    className: "cta-row"
  }, /*#__PURE__*/React.createElement(HButton, {
    variant: "accent",
    size: "lg",
    iconRight: /*#__PURE__*/React.createElement(HIcon, {
      name: "arrow-right",
      size: 18
    })
  }, "Reserve a spot"), /*#__PURE__*/React.createElement(HButton, {
    variant: "secondary",
    size: "lg",
    iconLeft: /*#__PURE__*/React.createElement(HIcon, {
      name: "play",
      size: 16
    })
  }, "See the curriculum")), /*#__PURE__*/React.createElement("div", {
    className: "trust"
  }, /*#__PURE__*/React.createElement("div", {
    className: "who"
  }, /*#__PURE__*/React.createElement(HAvatar, {
    name: "Ada L",
    variant: "spark",
    size: 34
  }), /*#__PURE__*/React.createElement(HAvatar, {
    name: "Liam K",
    variant: "sunrise",
    size: 34
  }), /*#__PURE__*/React.createElement(HAvatar, {
    name: "Mia R",
    variant: "night",
    size: 34
  })), /*#__PURE__*/React.createElement("span", null, "Built for curious 9\u201314s \xB7 loved by their parents"))), /*#__PURE__*/React.createElement("div", {
    className: "codecard"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dots"
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      background: 'var(--coral-400)'
    }
  }), /*#__PURE__*/React.createElement("i", {
    style: {
      background: 'var(--amber-300)'
    }
  }), /*#__PURE__*/React.createElement("i", {
    style: {
      background: 'var(--teal-300)'
    }
  })), /*#__PURE__*/React.createElement("pre", null, /*#__PURE__*/React.createElement("span", {
    className: "c"
  }, "# the agent loop \u2014 judgment inside the loop"), '\n', /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "for"), " ticket ", /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "in"), " inbox:", '\n', '    ', "plan = agent.", /*#__PURE__*/React.createElement("span", {
    className: "fn"
  }, "decide"), "(ticket)", '\n', '    ', /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "if"), " plan.confidence > ", /*#__PURE__*/React.createElement("span", {
    className: "s"
  }, "0.8"), ":", '\n', '        ', "agent.", /*#__PURE__*/React.createElement("span", {
    className: "fn"
  }, "act"), "(plan)", '\n', '    ', /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "else"), ":", '\n', '        ', /*#__PURE__*/React.createElement("span", {
    className: "fn"
  }, "ask_human"), "(ticket)", '\n'), /*#__PURE__*/React.createElement("div", {
    className: "floatchip a"
  }, /*#__PURE__*/React.createElement(HBadge, {
    variant: "secondary",
    dot: true
  }, "running")))));
}
window.Hero = Hero;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Hero.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Nav.jsx
try { (() => {
const {
  Button: CTFButton,
  Badge: CTFBadge
} = window.CodeTheFutureDesignSystem_909f12;
const Icon = window.CTFIcon;
function Nav() {
  return /*#__PURE__*/React.createElement("div", {
    className: "nav"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap nav-inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-icon.svg",
    alt: ""
  }), /*#__PURE__*/React.createElement("b", null, "Code the ", /*#__PURE__*/React.createElement("span", null, "Future"))), /*#__PURE__*/React.createElement("nav", {
    className: "nav-links"
  }, /*#__PURE__*/React.createElement("a", {
    href: "#platform"
  }, "Platform"), /*#__PURE__*/React.createElement("a", {
    href: "#camp"
  }, "Summer Camp"), /*#__PURE__*/React.createElement("a", {
    href: "#curriculum"
  }, "Curriculum")), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement(CTFButton, {
    variant: "ghost",
    size: "sm"
  }, "Sign in"), /*#__PURE__*/React.createElement(CTFButton, {
    variant: "primary",
    size: "sm",
    iconRight: /*#__PURE__*/React.createElement(Icon, {
      name: "arrow-right",
      size: 16
    })
  }, "Reserve 2026")));
}
window.Nav = Nav;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Nav.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Sections.jsx
try { (() => {
const {
  Card: SCard,
  Badge: SBadge,
  Button: SButton
} = window.CodeTheFutureDesignSystem_909f12;
const SIcon = window.CTFIcon;
function Pillars() {
  const langs = ['Python', 'TypeScript', 'SQL'];
  return /*#__PURE__*/React.createElement("section", {
    id: "platform"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sec-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "How we teach"), /*#__PURE__*/React.createElement("h2", null, "Operator-grade, not toy computer science."), /*#__PURE__*/React.createElement("p", null, "Every concept ties to a real loop \u2014 orders, files, inbox, inventory \u2014 so kids build things that actually do something.")), /*#__PURE__*/React.createElement("div", {
    className: "pillars"
  }, /*#__PURE__*/React.createElement(SCard, {
    variant: "default",
    padding: "lg",
    interactive: true,
    className: "pillar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pico",
    style: {
      background: 'var(--gradient-spark)'
    }
  }, /*#__PURE__*/React.createElement(SIcon, {
    name: "braces",
    size: 26,
    color: "#fff"
  })), /*#__PURE__*/React.createElement("h3", null, "Three languages, together"), /*#__PURE__*/React.createElement("p", null, "Python, TypeScript and SQL side by side \u2014 the operator surface for AI, web, APIs and data."), /*#__PURE__*/React.createElement("div", {
    className: "lang"
  }, langs.map(l => /*#__PURE__*/React.createElement(SBadge, {
    key: l,
    variant: "neutral"
  }, l)))), /*#__PURE__*/React.createElement(SCard, {
    variant: "default",
    padding: "lg",
    interactive: true,
    className: "pillar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pico",
    style: {
      background: 'var(--gradient-sunrise)'
    }
  }, /*#__PURE__*/React.createElement(SIcon, {
    name: "git-branch",
    size: 26,
    color: "#fff"
  })), /*#__PURE__*/React.createElement("h3", null, "The agent loop"), /*#__PURE__*/React.createElement("p", null, "Observe, decide, act, check. Kids learn how AI reasons inside a workflow \u2014 and when a human should step in."), /*#__PURE__*/React.createElement("div", {
    className: "lang"
  }, /*#__PURE__*/React.createElement(SBadge, {
    variant: "accent",
    dot: true
  }, "hands-on"))), /*#__PURE__*/React.createElement(SCard, {
    variant: "default",
    padding: "lg",
    interactive: true,
    className: "pillar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pico",
    style: {
      background: 'linear-gradient(120deg,var(--teal-400),var(--blue-500))'
    }
  }, /*#__PURE__*/React.createElement(SIcon, {
    name: "rocket",
    size: 26,
    color: "#fff"
  })), /*#__PURE__*/React.createElement("h3", null, "Ship something real"), /*#__PURE__*/React.createElement("p", null, "Every camper leaves with a working agent they built and understand \u2014 not a tutorial they followed."), /*#__PURE__*/React.createElement("div", {
    className: "lang"
  }, /*#__PURE__*/React.createElement(SBadge, {
    variant: "secondary"
  }, "project-based"))))));
}
function ModelStrip() {
  const rows = [['01', 'Code handles the loop', 'The repeatable steps — for each order, for each file.'], ['02', 'AI handles the judgment', 'The fuzzy calls inside the loop, where rules run out.'], ['03', 'Rules handle the guardrails', 'Confidence thresholds and stopping conditions.'], ['04', 'Humans handle exceptions', 'When something is unusual, a person decides.']];
  return /*#__PURE__*/React.createElement("section", {
    id: "curriculum"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "model"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "The mental model"), /*#__PURE__*/React.createElement("h2", null, "The one idea every camper internalizes."), /*#__PURE__*/React.createElement("div", {
    className: "model-rows"
  }, rows.map(r => /*#__PURE__*/React.createElement("div", {
    className: "mrow",
    key: r[0]
  }, /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, r[0]), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", null, r[1]), /*#__PURE__*/React.createElement("span", null, r[2]))))))));
}
function CampBand() {
  return /*#__PURE__*/React.createElement("section", {
    id: "camp"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "camp"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "In-person \xB7 Summer 2026"), /*#__PURE__*/React.createElement("h2", null, "Two weeks. One real build."), /*#__PURE__*/React.createElement("p", null, "Mornings on the concepts, afternoons on the keyboard. Small groups, real mentors, and a demo day where every camper ships."), /*#__PURE__*/React.createElement(SButton, {
    variant: "secondary",
    size: "lg",
    iconRight: /*#__PURE__*/React.createElement(SIcon, {
      name: "arrow-right",
      size: 18
    })
  }, "Reserve a spot"))));
}
function Footer() {
  return /*#__PURE__*/React.createElement("footer", {
    className: "footer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "footer-top"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "brand"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-icon.svg",
    alt: "",
    width: "30",
    height: "30"
  }), /*#__PURE__*/React.createElement("b", null, "Code the Future")), /*#__PURE__*/React.createElement("p", null, "AI literacy and modern coding for the next generation of builders.")), /*#__PURE__*/React.createElement("div", {
    className: "cols"
  }, /*#__PURE__*/React.createElement("div", {
    className: "fcol"
  }, /*#__PURE__*/React.createElement("h4", null, "Learn"), /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, "Platform"), /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, "Curriculum"), /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, "Summer Camp")), /*#__PURE__*/React.createElement("div", {
    className: "fcol"
  }, /*#__PURE__*/React.createElement("h4", null, "Company"), /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, "About"), /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, "For parents"), /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, "Contact")))), /*#__PURE__*/React.createElement("div", {
    className: "footer-base"
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 2026 Code the Future \xB7 Louisville, KY"), /*#__PURE__*/React.createElement("span", null, "Learn to build what's next."))));
}
Object.assign(window, {
  Pillars,
  ModelStrip,
  CampBand,
  Footer
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Sections.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/boot.jsx
try { (() => {
function App() {
  React.useEffect(() => {
    window.hydrateIcons();
  });
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(window.Nav, null), /*#__PURE__*/React.createElement(window.Hero, null), /*#__PURE__*/React.createElement(window.Pillars, null), /*#__PURE__*/React.createElement(window.ModelStrip, null), /*#__PURE__*/React.createElement(window.CampBand, null), /*#__PURE__*/React.createElement(window.Footer, null));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/boot.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/icons.jsx
try { (() => {
// Lucide icon helper — renders <i data-lucide> and lets a global pass hydrate it.
// lucide.createIcons() is called from App after each render.
function Icon({
  name,
  size = 20,
  color = 'currentColor',
  stroke = 2,
  style
}) {
  return /*#__PURE__*/React.createElement("i", {
    "data-lucide": name,
    style: {
      width: size,
      height: size,
      color,
      display: 'inline-flex',
      ...style
    },
    "data-stroke": stroke
  });
}
function hydrateIcons() {
  if (window.lucide && window.lucide.createIcons) {
    window.lucide.createIcons({
      attrs: {
        'stroke-width': 2
      }
    });
  }
}
window.CTFIcon = Icon;
window.hydrateIcons = hydrateIcons;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/icons.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
