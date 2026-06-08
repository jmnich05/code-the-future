function PlatformApp() {
  const [route, setRoute] = React.useState('dashboard');
  React.useEffect(() => { window.hydrateIcons(); });
  return (
    <div className="app">
      <window.Sidebar route={route} setRoute={setRoute} />
      <window.Dashboard />
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<PlatformApp />);
