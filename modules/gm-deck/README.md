# GM Deck

One window for running the table in Foundry VTT v14. Press **Shift+G** or click the d20 button in the token tools.

| Tab | What it does |
|---|---|
| Sound | Every audio file in your soundboard folder is a button. Click plays it for everyone with random pitch; Shift-click plays only for you; right-click loops. |
| Sound (ambience) | One folder per mood. Files in it loop and layer; files in a subfolder (for example `oneshots`) play at random intervals with random pitch and volume. |
| World | In-game date and time with quick advance buttons, one-click scene weather, weather rolls by climate, a day/night slider. A mood folder named like the weather starts automatically. |
| Tables | Search and roll any roll table in the world or in compendiums. |
| People | Search creature compendiums by name and CR, drop a token with one click, pick a random creature, generate a quick NPC idea. |
| Lore | Search journal names and text; write timestamped notes to a Session Log journal. |

Players only hear the sounds. The window is GM-only.

## Status

Version 0.1.1 alpha. Smoke-tested once in a Foundry 14.361 test world (window, tabs, time, weather, table roll, creature import, journal log); sound playback and multiplayer are untested. Targets Foundry v14; Pathfinder 1e and other system compatibility are unverified. Most controls aim to use core APIs; the creature CR filter is PF1-specific. Test in a disposable world first.

## Folder layout for sound

```
soundboard/            buttons (subfolders become categories)
ambience/
  Rain/                files here loop
    oneshots/          files here play at random
  Tavern/
```

Both folders can be changed from the Sound tab.

## Install

In Foundry Add-on Modules, choose Install Module and paste:

https://grugg2.github.io/foundry-modules/modules/gm-deck/module.json

Enable GM Deck in a test world. No audio or compendium content is included. Set random pitch to 0 for music.

## Not implemented

- Map generation.
- Full PF1 character/NPC stat-block generation with class levels and gear.
- Custom holidays, moon phases, and calendars.

## Publication

The public manifest adds install/download links and omits the original untested compatibility verification claim. The installed module was left unchanged. No redistribution license has been selected yet.
