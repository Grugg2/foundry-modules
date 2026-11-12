# Module publishing

- This is the public `Grugg2/foundry-modules` repository.
- Keep `modules/` as publishable source and `docs/` as the GitHub Pages root.
- Never add local install paths, campaign data, PCG saves, settings, logs, audio,
  user content, credentials, or PCGen audit reports to this repository.
- Preserve preimages outside this public repository before modifying existing source.
- Do not edit the live Foundry installation as part of packaging or website work.
- Run `python tools/package.py` after module changes. Check JavaScript syntax.
- Current GM Deck 0.1.0 is syntax checked only. It has not passed live Foundry
  acceptance. Do not imply PF1/core compatibility is verified.
- Do not mark manifest compatibility `verified` until that version is runtime tested.
- Never present the planned PCGen bridge as implemented or downloadable.
- Keep install manifests/download URLs relative to the Pages site where possible.
  Versioned ZIP files must remain available for existing manifests.
