# namespace-guard skill

A skill for Claude Code, Codex and other agents that read `SKILL.md` files. It deals with confusables: letters that look like other letters, also called homoglyphs, such as a Cyrillic а in place of a Latin a.

**lookalike-names-and-text** helps an agent write code that stops names impersonating others at sign-up (`раураl`, `rnicrosoft`, `paypa1`), catches invisible characters and profanity with evasions, and claims names safely when two people want the same one. It also turns confusables back into plain letters before text reaches an LLM. That prevents Denial of Spend: text flooded with confusables doesn't fool current models, but it can take up to 5.7x the tokens to read. It uses the [namespace-guard](https://github.com/paultendo/namespace-guard) npm package.

## What it runs and contacts

Nothing. The skill is instructions: it tells the agent how to use the namespace-guard package from npm in your project, and namespace-guard makes no network calls.

## Install

It's listed in Anthropic's plugin directory for Claude Code, Cowork and the Claude apps, so you can add it from the directory there.

From the command line in Claude Code:

```bash
claude plugin marketplace add paultendo/skills
claude plugin install namespace-guard@paultendo
```

For Codex or another agent, copy `skills/lookalike-names-and-text` into your agent's skills folder, such as `~/.codex/skills/`.

The same marketplace has a separate plugin, `d0ma1n`, for finding lookalike domains of a real domain.

## Where the data comes from

The lookalike data comes from Unicode's confusables.txt (Unicode Technical Standard #39) and from [confusable-vision](https://github.com/paultendo/confusable-vision), which measures 64,751 characters in 322 fonts. addons.mozilla.org checks add-on names for lookalikes with characters from confusable-vision, and namespace-guard is used by agent-sanitizer and d0ma1n.

## Privacy

The skill and the package collect and send nothing: see the [privacy policy](https://github.com/paultendo/namespace-guard/blob/main/PRIVACY.md).

## License

MIT, by Paul Wood FRSA ([@paultendo](https://github.com/paultendo)).
