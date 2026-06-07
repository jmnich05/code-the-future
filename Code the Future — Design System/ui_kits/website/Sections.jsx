const { Card: SCard, Badge: SBadge, Button: SButton } = window.CodeTheFutureDesignSystem_909f12;
const SIcon = window.CTFIcon;

function Pillars() {
  const langs = ['Python', 'TypeScript', 'SQL'];
  return (
    <section id="platform">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">How we teach</span>
          <h2>Operator-grade, not toy computer science.</h2>
          <p>Every concept ties to a real loop — orders, files, inbox, inventory — so kids build
            things that actually do something.</p>
        </div>
        <div className="pillars">
          <SCard variant="default" padding="lg" interactive className="pillar">
            <div className="pico" style={{ background: 'var(--gradient-spark)' }}>
              <SIcon name="braces" size={26} color="#fff" />
            </div>
            <h3>Three languages, together</h3>
            <p>Python, TypeScript and SQL side by side — the operator surface for AI, web, APIs and data.</p>
            <div className="lang">
              {langs.map((l) => <SBadge key={l} variant="neutral">{l}</SBadge>)}
            </div>
          </SCard>

          <SCard variant="default" padding="lg" interactive className="pillar">
            <div className="pico" style={{ background: 'var(--gradient-sunrise)' }}>
              <SIcon name="git-branch" size={26} color="#fff" />
            </div>
            <h3>The agent loop</h3>
            <p>Observe, decide, act, check. Kids learn how AI reasons inside a workflow — and when a human should step in.</p>
            <div className="lang"><SBadge variant="accent" dot>hands-on</SBadge></div>
          </SCard>

          <SCard variant="default" padding="lg" interactive className="pillar">
            <div className="pico" style={{ background: 'linear-gradient(120deg,var(--teal-400),var(--blue-500))' }}>
              <SIcon name="rocket" size={26} color="#fff" />
            </div>
            <h3>Ship something real</h3>
            <p>Every camper leaves with a working agent they built and understand — not a tutorial they followed.</p>
            <div className="lang"><SBadge variant="secondary">project-based</SBadge></div>
          </SCard>
        </div>
      </div>
    </section>
  );
}

function ModelStrip() {
  const rows = [
    ['01', 'Code handles the loop', 'The repeatable steps — for each order, for each file.'],
    ['02', 'AI handles the judgment', 'The fuzzy calls inside the loop, where rules run out.'],
    ['03', 'Rules handle the guardrails', 'Confidence thresholds and stopping conditions.'],
    ['04', 'Humans handle exceptions', 'When something is unusual, a person decides.'],
  ];
  return (
    <section id="curriculum">
      <div className="wrap">
        <div className="model">
          <span className="eyebrow">The mental model</span>
          <h2>The one idea every camper internalizes.</h2>
          <div className="model-rows">
            {rows.map((r) => (
              <div className="mrow" key={r[0]}>
                <span className="n">{r[0]}</span>
                <div>
                  <b>{r[1]}</b>
                  <span>{r[2]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CampBand() {
  return (
    <section id="camp">
      <div className="wrap">
        <div className="camp">
          <span className="eyebrow">In-person · Summer 2026</span>
          <h2>Two weeks. One real build.</h2>
          <p>Mornings on the concepts, afternoons on the keyboard. Small groups, real mentors, and
            a demo day where every camper ships.</p>
          <SButton variant="secondary" size="lg" iconRight={<SIcon name="arrow-right" size={18} />}>
            Reserve a spot
          </SButton>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-top">
          <div>
            <div className="brand">
              <img src="../../assets/logo-icon.svg" alt="" width="30" height="30" />
              <b>Code the Future</b>
            </div>
            <p>AI literacy and modern coding for the next generation of builders.</p>
          </div>
          <div className="cols">
            <div className="fcol">
              <h4>Learn</h4>
              <a href="#">Platform</a><a href="#">Curriculum</a><a href="#">Summer Camp</a>
            </div>
            <div className="fcol">
              <h4>Company</h4>
              <a href="#">About</a><a href="#">For parents</a><a href="#">Contact</a>
            </div>
          </div>
        </div>
        <div className="footer-base">
          <span>© 2026 Code the Future · Louisville, KY</span>
          <span>Learn to build what's next.</span>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { Pillars, ModelStrip, CampBand, Footer });
