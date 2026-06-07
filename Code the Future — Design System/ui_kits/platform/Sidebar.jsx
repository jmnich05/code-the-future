const { Badge: PBadge, Button: PButton, Avatar: PAvatar, Card: PCard, Tabs: PTabs } = window.CodeTheFutureDesignSystem_909f12;
const PIcon = window.CTFIcon;

function Sidebar({ route, setRoute }) {
  const items = [
    ['dashboard', 'layout-dashboard', 'Dashboard'],
    ['lessons', 'book-open', 'Lessons'],
    ['projects', 'folder-git-2', 'Projects'],
    ['camp', 'tent-tree', 'Summer Camp'],
  ];
  return (
    <aside className="side">
      <div className="brand">
        <img src="../../assets/logo-icon-dark.svg" alt="" />
        <b>Code the <span>Future</span></b>
      </div>
      <nav className="snav">
        {items.map(([key, icon, label]) => (
          <a key={key} className={route === key ? 'on' : ''} onClick={() => setRoute(key)}>
            <PIcon name={icon} size={19} />
            {label}
          </a>
        ))}
      </nav>
      <div className="side-foot">
        <div className="streak" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PIcon name="flame" size={22} color="var(--coral-400)" /> 12
        </div>
        <small>day streak — keep the loop running</small>
      </div>
    </aside>
  );
}

window.Sidebar = Sidebar;
