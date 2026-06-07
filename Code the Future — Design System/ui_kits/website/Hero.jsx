const { Button: HButton, Badge: HBadge, Avatar: HAvatar } = window.CodeTheFutureDesignSystem_909f12;
const HIcon = window.CTFIcon;

function Hero() {
  return (
    <header className="hero">
      <div className="wrap hero-grid">
        <div>
          <span className="eyebrow"><HIcon name="sparkles" size={15} /> Summer 2026 · Louisville, KY</span>
          <h1 className="display">Learn to build <em>what's&nbsp;next.</em></h1>
          <p className="lead">
            A platform and in-person camp where kids learn AI literacy and modern coding the way
            the work actually happens — Python, TypeScript, and SQL, with AI as a reasoning engine
            inside a real workflow.
          </p>
          <div className="cta-row">
            <HButton variant="accent" size="lg" iconRight={<HIcon name="arrow-right" size={18} />}>
              Reserve a spot
            </HButton>
            <HButton variant="secondary" size="lg" iconLeft={<HIcon name="play" size={16} />}>
              See the curriculum
            </HButton>
          </div>
          <div className="trust">
            <div className="who">
              <HAvatar name="Ada L" variant="spark" size={34} />
              <HAvatar name="Liam K" variant="sunrise" size={34} />
              <HAvatar name="Mia R" variant="night" size={34} />
            </div>
            <span>Built for curious 9–14s · loved by their parents</span>
          </div>
        </div>

        <div className="codecard">
          <div className="dots">
            <i style={{ background: 'var(--coral-400)' }} />
            <i style={{ background: 'var(--amber-300)' }} />
            <i style={{ background: 'var(--teal-300)' }} />
          </div>
<pre>
<span className="c"># the agent loop — judgment inside the loop</span>{'\n'}
<span className="k">for</span> ticket <span className="k">in</span> inbox:{'\n'}
{'    '}plan = agent.<span className="fn">decide</span>(ticket){'\n'}
{'    '}<span className="k">if</span> plan.confidence &gt; <span className="s">0.8</span>:{'\n'}
{'        '}agent.<span className="fn">act</span>(plan){'\n'}
{'    '}<span className="k">else</span>:{'\n'}
{'        '}<span className="fn">ask_human</span>(ticket){'\n'}
</pre>
          <div className="floatchip a">
            <HBadge variant="secondary" dot>running</HBadge>
          </div>
        </div>
      </div>
    </header>
  );
}

window.Hero = Hero;
