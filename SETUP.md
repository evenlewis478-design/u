# Roblox Potato Graphics — Roblox-side setup

This is the real, working half of the system: an in-game component that
actually changes settings Roblox allows an experience to control, plus an
optional live-sync channel. Nothing here fakes a result.

## What gets applied automatically vs. what doesn't

**Automatically applied (real, scripted):**
- Your personal graphics quality level (`SavedQualityLevel`)
- Shadows on/off and rendering technology (world-wide, server-controlled)
- Post-processing effects: Bloom, SunRays, Depth of Field, Color Correction, Atmosphere
- Terrain grass/rock decoration
- Streaming render-distance radius
- Decorative particle/beam/trail effects the developer has explicitly tagged as optional
- Text size on any of *your own* custom UI that's tagged for it

**Manual Roblox setting (cannot be touched by any experience or website):**
- Overall app resolution / display scaling
- V-Sync / frame rate cap
- Fullscreen toggle
- Texture quality
- OS-level UI text size outside this experience

The in-game menu and the Configuration module both list these two
categories separately — nothing here pretends to control the second group.

## Install (Studio)

1. In **ReplicatedStorage**, create a Folder named `RobloxPotatoGraphics`.
2. Inside it, create two ModuleScripts: `Configuration` and `Net`. Paste in
   `Configuration.lua` and `Net.lua` respectively.
3. In **ServerScriptService**, create a Script named `PotatoGraphicsServer`.
   Paste in `PotatoGraphicsServer.server.lua`.
4. In **StarterPlayer → StarterPlayerScripts**, create a LocalScript named
   `PotatoGraphicsClient`. Paste in `PotatoGraphicsClient.client.lua`.
5. File → Experience Settings → Security → turn on **Allow HTTP Requests**
   (only needed if you set a `SYNC_URL` — see below; the in-game menu works
   with this off).
6. Play-test. You should see a small 🥔 button bottom-left. Click it to
   open the profile menu.
7. (Optional) Tag any purely decorative `ParticleEmitter`/`Beam`/`Trail` you
   want potato mode allowed to disable: select it, open the **Tags**
   widget in Studio, add tag `PotatoOptionalFX`.
8. (Optional) Tag any of your own `TextLabel`/`TextButton`/`TextBox`
   instances you want to scale with text-size profiles: add tag
   `PotatoScalable`.
9. Publish.

## Optional: live sync without republishing

By default `SYNC_URL = ""` in `PotatoGraphicsServer.server.lua`, so the
game just runs on the `DEFAULT_PROFILE` you set there. If you want to be
able to change the world-wide profile later without republishing:

1. Create a GitHub Gist with a file called `config.json` containing:
   ```json
   {"profile": "Potato"}
   ```
2. Use the Gist's **raw** URL (click "Raw" on the file) as `SYNC_URL`.
3. The server polls it every `SYNC_POLL_SECONDS` (default 30s) using
   `HttpService:GetAsync` — a real HTTP call, server-side only (Roblox
   does not allow this from LocalScripts). Edit the Gist and save; within
   one poll interval, every server running your game picks up the change.
4. Real status (`Connected`/`Syncing`/`Applied`/`Disconnected`/`Error`) is
   shown in the in-game panel, driven directly by whether that HTTP call
   actually succeeded — never simulated.

There is no live channel back to the website: a static site (like GitHub
Pages) has no way to receive a push from a running Roblox server without
its own backend, which this project doesn't assume you have. The
website's role is to help you design/export the `config.json` you paste
into the Gist — not to display a live "Connected" light itself.
