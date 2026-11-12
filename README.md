# Frej's Foundry modules

Small tools for running the table in Foundry Virtual Tabletop.

- **[Module page](https://grugg2.github.io/foundry-modules/)**
- **[GM Deck installation manifest](https://grugg2.github.io/foundry-modules/modules/gm-deck/module.json)**
- **[GM Deck 0.1.1 ZIP](https://grugg2.github.io/foundry-modules/downloads/gm-deck-0.1.1.zip)**

## GM Deck — 0.1.1 alpha

A GM-only window with Sound, World, Tables, People, and Lore tabs. Target: Foundry
VTT v14. The JavaScript passes a syntax check; the module **has not been run in
Foundry**. System compatibility, including Pathfinder 1e, is unverified. Try it
in a disposable test world first.

In Foundry, open **Add-on Modules → Install Module**, paste the manifest URL,
and install. Enable **GM Deck** in the test world's module settings, then press
**Shift+G** or click the d20 control in the token tools.

See [GM Deck's README](modules/gm-deck/README.md) for feature details and limits.
Audio, compendium content, characters, and worlds are not included.

The PCGen / Foundry Pathfinder 1e bridge is planned. An offline development
harness exists separately; no working character synchronization is shipped here.

## Repository layout

- `modules/gm-deck/`: publishable module source.
- `docs/`: static GitHub Pages site, install manifests, and versioned downloads.
- `tools/package.py`: package the checked-in module source and validate local links.

Build with Python 3.12+ and Node.js:

```text
python tools/package.py
node --check modules/gm-deck/scripts/main.mjs
node --check docs/site.js
```

GitHub Pages publishes the `docs` folder on `main`. There is no third-party
hosting dependency, scheduled task, analytics, or bundled audio. Future releases
should bump the source manifest version, regenerate the package and site manifest,
update the page, and perform actual Foundry runtime acceptance before claiming
verified compatibility.

This is a community project, not an official Foundry product. No redistribution
license has been selected yet.
