import type { RecordedRun } from './demo-runner'
import { LazyDemo } from './lazy-demo'

export function DemoSection({ recorded }: { recorded: RecordedRun }) {
  return (
    <section id="demo" className="section" aria-labelledby="demo-title">
      <p className="label">Live demo</p>
      <h2 id="demo-title" className="display-l section__title">
        Run it on my leakiest store.
      </h2>
      <p className="section__lede">
        Leaky Llama Supply Co. is a demo store I wrote with classic integration mistakes. Unleash
        the cast and watch the receipt print as PayPal’s sandbox confirms each leak. Then apply the
        fixes and run it again with the same seed.
      </p>
      <LazyDemo recorded={recorded} />
    </section>
  )
}
