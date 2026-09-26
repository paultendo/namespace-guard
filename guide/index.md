<div class="docs-hero">
<p class="eyebrow">namespace-guard docs</p>
</div>

# Is this name really free?

namespace-guard checks a name before someone claims it: that it's in the right format, that it isn't reserved or already taken in any of your tables, and that it doesn't pass for a name you protect. It has no dependencies and works with nine databases.

<div class="try">
<div class="try-form"><span>yourapp.com/</span><input type="text" value="rnicrosoft" aria-label="A name to check" autocomplete="off" spellcheck="false"></div>
<div class="try-out"><span class="hint">Type a name, or pick one below.</span></div>
<div class="try-chips"><button type="button" data-name="rnicrosoft">rnicrosoft</button><button type="button" data-name="paypaI">paypaI</button><button type="button" data-name="раураl">раураl</button><button type="button" data-name="sarah">sarah</button><button type="button" data-name="admin">admin</button><button type="button" data-name="my-new-app">my-new-app</button></div>
</div>

<div class="cards">
<a class="card" href="getting-started/"><span class="card-label">Start here</span><strong>Getting started</strong><span>Install it, point it at your tables, and check your first name in five minutes.</span></a>
<a class="card" href="protect-names/"><span class="card-label">Guide</span><strong>Protect names</strong><span>Stop rn for m, a capital I for l, and a Cyrillic paypal from passing for names you care about.</span></a>
<a class="card" href="guard/"><span class="card-label">Reference</span><strong>The guard</strong><span>Every method, what it returns, and when to use which.</span></a>
</div>

## Find your way

<ul class="jumps">
<li><a href="how-it-works/">How a name is checked</a></li>
<li><a href="claiming/">Claim a name without a race</a></li>
<li><a href="unicode-names/">Allow Unicode names safely</a></li>
<li><a href="suggestions/">Suggest a free name</a></li>
<li><a href="moderation/">Block offensive names</a></li>
<li><a href="llm-text/">Clean text before an LLM reads it</a></li>
<li><a href="domains/">Check lookalike domains</a></li>
<li><a href="comparing-names/">Compare two names</a></li>
<li><a href="cli/">Test your rules in CI</a></li>
<li><a href="upgrading/">Upgrade to 0.23</a></li>
<li><a href="adapters/">Prisma, Drizzle and seven more</a></li>
<li><a href="changelog/">What changed</a></li>
</ul>

The examples in these docs run against the library in your browser, and the same examples run in the test suite, so what you read is what the code does. Double-click an example to edit it, then run your version.
