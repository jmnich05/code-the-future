const { Button: CTFButton, Badge: CTFBadge } = window.CodeTheFutureDesignSystem_909f12;
const Icon = window.CTFIcon;

function Nav() {
  return (
    <div className="nav">
      <div className="wrap nav-inner">
        <div className="brand">
          <img src="../../assets/logo-icon.svg" alt="" />
          <b>Code the <span>Future</span></b>
        </div>
        <nav className="nav-links">
          <a href="#platform">Platform</a>
          <a href="#camp">Summer Camp</a>
          <a href="#curriculum">Curriculum</a>
        </nav>
        <div className="spacer" />
        <CTFButton variant="ghost" size="sm">Sign in</CTFButton>
        <CTFButton variant="primary" size="sm" iconRight={<Icon name="arrow-right" size={16} />}>
          Reserve 2026
        </CTFButton>
      </div>
    </div>
  );
}

window.Nav = Nav;
