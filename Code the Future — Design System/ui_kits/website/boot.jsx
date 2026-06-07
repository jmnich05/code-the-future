function App() {
  React.useEffect(() => { window.hydrateIcons(); });
  return (
    <>
      <window.Nav />
      <window.Hero />
      <window.Pillars />
      <window.ModelStrip />
      <window.CampBand />
      <window.Footer />
    </>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
