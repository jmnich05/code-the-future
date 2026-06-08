const { Badge: DBadge, Button: DButton, Avatar: DAvatar, Card: DCard } = window.CodeTheFutureDesignSystem_909f12;
const DIcon = window.CTFIcon;

function Dashboard() {
  const lessons = [
    ['done', '01', 'Loops, for real', 'Repeat work until the job is done'],
    ['done', '02', 'Conditionals & branches', 'Decisions inside the loop'],
    ['now', '03', 'From a loop to an agent loop', 'Observe · decide · act · check'],
    ['next', '04', 'Tools & APIs', 'Let your agent reach the outside world'],
    ['next', '05', 'Stopping conditions', 'When confidence runs out, ask a human'],
  ];
  return (
    <main className="main">
      <div className="topbar">
        <div>
          <h1>Welcome back, Charlotte</h1>
          <div className="sub">You're on Module 03 — the agent loop. Almost there.</div>
        </div>
        <div className="spacer" />
        <DBadge variant="secondary" dot>Cohort: Summer 2026</DBadge>
        <DAvatar name="Charlotte N" variant="spark" size={42} />
      </div>

      <div className="stat-row">
        <DCard padding="md" className="stat">
          <div className="l"><DIcon name="circle-check-big" size={15} color="var(--color-success)" /> Lessons done</div>
          <div className="v">12<span style={{ fontSize: 16, color: 'var(--text-faint)' }}> / 24</span></div>
          <div className="bar"><i style={{ width: '50%' }} /></div>
        </DCard>
        <DCard padding="md" className="stat">
          <div className="l"><DIcon name="git-branch" size={15} color="var(--color-primary)" /> Agents built</div>
          <div className="v">3</div>
        </DCard>
        <DCard padding="md" className="stat">
          <div className="l"><DIcon name="flame" size={15} color="var(--coral-500)" /> Day streak</div>
          <div className="v">12</div>
        </DCard>
      </div>

      <div className="content-grid">
        <DCard padding="lg">
          <div className="panel-title"><DIcon name="book-open" size={18} color="var(--color-primary)" /> Your path</div>
          {lessons.map(([state, num, title, sub]) => (
            <div className="lesson" key={num}>
              <div className={`num ${state}`}>
                {state === 'done' ? <DIcon name="check" size={18} /> : num}
              </div>
              <div className="lt">
                <b>{title}</b>
                <span>{sub}</span>
              </div>
              {state === 'now'
                ? <DButton variant="primary" size="sm" iconRight={<DIcon name="arrow-right" size={15} />}>Resume</DButton>
                : state === 'done'
                  ? <DBadge variant="success">Done</DBadge>
                  : <DIcon name="lock" size={16} color="var(--text-faint)" />}
            </div>
          ))}
        </DCard>

        <DCard variant="dark" padding="lg">
          <div className="panel-title" style={{ color: '#fff' }}>
            <DIcon name="terminal" size={18} color="var(--teal-300)" /> Today's loop
          </div>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: '0 0 4px', lineHeight: 1.55 }}>
            Build an agent that files transcripts. Code handles the loop — you decide where AI gets to judge.
          </p>
          <div className="codeblk">
            <span className="c"># your turn: fill in the judgment</span>{'\n'}
            <span className="k">for</span> file <span className="k">in</span> transcripts:{'\n'}
            {'    '}info = agent.<span className="fn">read</span>(file){'\n'}
            {'    '}<span className="k">if</span> info.confidence &gt; <span className="s">0.8</span>:{'\n'}
            {'        '}agent.<span className="fn">file_it</span>(info){'\n'}
            {'    '}<span className="k">else</span>:{'\n'}
            {'        '}<span className="fn">ask_human</span>(file)
          </div>
          <DButton variant="accent" fullWidth iconRight={<DIcon name="play" size={16} />}>Run in sandbox</DButton>
        </DCard>
      </div>
    </main>
  );
}

window.Dashboard = Dashboard;
